import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  History,
  Upload,
} from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import {
  downloadProtectedProjectDocument,
  uploadProtectedProjectDocument,
} from '../lib/apiClient.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import {
  evaluateProjectDelay,
  MAX_BILL_FILE_BYTES,
  validateProjectStageTransition,
} from '../shared/solarEngine.ts';
import {
  PROJECT_STAGES,
  type ProjectDocumentDoc,
  type ProjectPaymentDoc,
  type ProjectStage,
  type ProjectStatusHistoryDoc,
} from '../types/domain.ts';

function formatRecordTimestamp(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  return 'Recorded';
}

export function ProjectTrackingDashboardPage() {
  const {
    firebaseUser,
    profile,
    isBootstrappedAdmin,
    workspaceMode,
    language,
    dataLoading,
    projects,
    leadContacts,
    logSimulatedNotification,
  } = useAuthData();
  const dict = t(language);
  const [searchParams] = useSearchParams();
  const queryProjectId = searchParams.get('projectId') || '';

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DELAYED' | 'COMPLETED'>(
    'ALL'
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(queryProjectId);

  // Subcollection state for selected project
  const [documents, setDocuments] = useState<ProjectDocumentDoc[]>([]);
  const [payments, setPayments] = useState<ProjectPaymentDoc[]>([]);
  const [historyList, setHistoryList] = useState<ProjectStatusHistoryDoc[]>([]);
  const [loadingSub, setLoadingSub] = useState<boolean>(false);

  // Stage update form state
  const [targetStage, setTargetStage] = useState<ProjectStage>('ADVANCE_PAYMENT_RECEIVED');
  const [pendingActivitiesInput, setPendingActivitiesInput] = useState<string>('');
  const [markDelayed, setMarkDelayed] = useState<boolean>(false);
  const [delayReasonInput, setDelayReasonInput] = useState<string>('');
  const [stageRemarks, setStageRemarks] = useState<string>('');
  const [updatingStage, setUpdatingStage] = useState<boolean>(false);

  // Simulated payment form state
  const [payMilestone, setPayMilestone] =
    useState<ProjectPaymentDoc['milestone']>('ADVANCE_BOOKING');
  const [payMode, setPayMode] = useState<ProjectPaymentDoc['paymentMode']>('SIMULATED_UPI');
  const [payAmountInr, setPayAmountInr] = useState<number>(30000);
  const [recordingPayment, setRecordingPayment] = useState<boolean>(false);

  // Protected document upload & metadata state
  const [docType, setDocType] =
    useState<ProjectDocumentDoc['docType']>('SITE_SURVEY_REPORT');
  const [docTitle, setDocTitle] = useState<string>('');
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [docFileName, setDocFileName] = useState<string>('Shadow_Analysis_Layout.pdf');
  const [docFileSizeKb, setDocFileSizeKb] = useState<number>(420);
  const [docNotes, setDocNotes] = useState<string>('');
  const [uploadingDoc, setUploadingDoc] = useState<boolean>(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const responsibleStaffName =
    profile?.displayName || firebaseUser?.email || 'Nagpur EPC Engineer';

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const sla = evaluateProjectDelay(p.currentStage, p.stageStartedAt);
      const delayed = p.currentStage !== 'PROJECT_COMPLETED' && (p.isDelayed || sla.isDelayed);
      if (statusFilter === 'ACTIVE' && p.currentStage === 'PROJECT_COMPLETED') return false;
      if (statusFilter === 'DELAYED' && !delayed) return false;
      if (statusFilter === 'COMPLETED' && p.currentStage !== 'PROJECT_COMPLETED') return false;
      return true;
    });
  }, [projects, statusFilter]);

  useEffect(() => {
    if (queryProjectId && projects.some((p) => p.id === queryProjectId)) {
      setSelectedProjectId(queryProjectId);
      return;
    }
    if (!selectedProjectId && filteredProjects.length > 0) {
      setSelectedProjectId(filteredProjects[0].id);
    }
  }, [projects, filteredProjects, queryProjectId, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  // Sync form defaults when selected project changes
  useEffect(() => {
    if (!selectedProject) return;
    const nextDef =
      PROJECT_STAGES.find((s) => s.index === Math.min(10, selectedProject.stageIndex + 1)) ||
      PROJECT_STAGES[PROJECT_STAGES.length - 1];
    setTargetStage(nextDef.code);
    setPendingActivitiesInput(selectedProject.pendingActivities);
    setMarkDelayed(selectedProject.isDelayed);
    setDelayReasonInput(selectedProject.delayReason);
    setStageRemarks('');
    setPayAmountInr(Math.max(5000, Math.round(selectedProject.netCustomerCostInr * 0.2)));
    setSelectedDocFile(null);
  }, [selectedProject?.id, selectedProject?.stageIndex]);

  // Load subcollections (documents, payments, history) for selected project
  const refreshSubcollections = async (projectId: string) => {
    if (!firebaseUser) return;
    setLoadingSub(true);
    try {
      const buildSubQuery = (subName: 'documents' | 'payments' | 'history') => {
        const ref = collection(db, 'projects', projectId, subName);
        if (workspaceMode === 'SALES' && isBootstrappedAdmin) {
          return query(ref);
        }
        if (workspaceMode === 'SALES') {
          return query(ref, where('assignedStaffUids', 'array-contains', firebaseUser.uid));
        }
        return query(ref, where('ownerUid', '==', firebaseUser.uid));
      };

      const [docsSnap, paySnap, histSnap] = await Promise.all([
        getDocs(buildSubQuery('documents')),
        getDocs(buildSubQuery('payments')),
        getDocs(buildSubQuery('history')),
      ]);

      setDocuments(
        docsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectDocumentDoc, 'id'>) }))
      );
      setPayments(
        paySnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectPaymentDoc, 'id'>) }))
      );
      const sortedHist = histSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectStatusHistoryDoc, 'id'>) }))
        .sort((a, b) => b.stageIndex - a.stageIndex);
      setHistoryList(sortedHist);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, `projects/${projectId}/subcollections`);
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    if (selectedProject) {
      void refreshSubcollections(selectedProject.id);
    }
  }, [selectedProject?.id, firebaseUser?.uid, workspaceMode, isBootstrappedAdmin]);

  const handleStageUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedProject) return;

    setErrorBanner(null);
    setActionBanner(null);

    const check = validateProjectStageTransition(
      selectedProject.currentStage,
      targetStage,
      isBootstrappedAdmin
    );
    if (!check.valid) {
      setErrorBanner(check.reason || 'Invalid project stage transition.');
      return;
    }

    setUpdatingStage(true);
    const nextStageDef = PROJECT_STAGES.find((s) => s.code === targetStage)!;
    const nowIso = new Date().toISOString();
    const completionMonth =
      targetStage === 'PROJECT_COMPLETED'
        ? nowIso.slice(0, 7)
        : selectedProject.completionMonthKey || '';
    const nextPending =
      targetStage === 'PROJECT_COMPLETED'
        ? 'All installation, net-metering, and subsidy handover steps completed.'
        : pendingActivitiesInput.trim() || nextStageDef.customerSummary;
    const isNowDelayed = targetStage === 'PROJECT_COMPLETED' ? false : markDelayed;
    const nextDelayReason = isNowDelayed ? delayReasonInput.trim() : '';
    const completedIndices = Array.from({ length: nextStageDef.index }, (_, idx) => idx + 1);

    try {
      const batch = writeBatch(db);

      // 1. Update Project Master Document
      batch.update(doc(db, 'projects', selectedProject.id), {
        currentStage: targetStage,
        stageIndex: nextStageDef.index,
        pendingActivities: nextPending.slice(0, 400),
        isDelayed: isNowDelayed,
        delayReason: nextDelayReason.slice(0, 300),
        stageStartedAt:
          targetStage !== selectedProject.currentStage ? nowIso : selectedProject.stageStartedAt,
        completionMonthKey: completionMonth,
        updatedAt: serverTimestamp(),
      });

      // 2. Sync Public Capability Tracking Document
      batch.update(doc(db, 'public_tracking', selectedProject.trackingToken), {
        currentStage: targetStage,
        stageIndex: nextStageDef.index,
        completedStageIndices: completedIndices,
        pendingActivities: nextPending.slice(0, 400),
        isDelayed: isNowDelayed,
        delaySummary: nextDelayReason.slice(0, 300),
        updatedAt: serverTimestamp(),
      });

      // 3. Append Immutable Audit History Record with Timestamp & Responsible Staff
      const histId = `hst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      batch.set(doc(db, 'projects', selectedProject.id, 'history', histId), {
        projectId: selectedProject.id,
        ownerUid: selectedProject.ownerUid,
        assignedStaffUids: selectedProject.assignedStaffUids,
        fromStage: selectedProject.currentStage,
        toStage: targetStage,
        stageIndex: nextStageDef.index,
        remarks: (
          stageRemarks.trim() || `Updated project stage to ${nextStageDef.label}.`
        ).slice(0, 400),
        updatedByUid: firebaseUser.uid,
        updatedByName: responsibleStaffName.slice(0, 100),
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      const contact = leadContacts[selectedProject.leadId];
      const maskedPhone = contact?.mobileNumber
        ? `+91-XXXXXX${contact.mobileNumber.slice(-4)}`
        : '+91-XXXXXX0000';

      await logSimulatedNotification({
        recipientUid: selectedProject.ownerUid,
        assignedStaffUids: selectedProject.assignedStaffUids,
        channel: 'WHATSAPP_SIMULATION',
        eventType: 'PROJECT_STAGE_UPDATED',
        referenceCode: selectedProject.projectNumber,
        maskedRecipientPhone: maskedPhone,
        title: `Project ${selectedProject.projectNumber} -> Stage ${nextStageDef.index}/10`,
        message: `[Simulated WhatsApp] ${selectedProject.customerName}, your solar installation (${selectedProject.projectNumber}) is now at "${nextStageDef.label}".`,
      });

      await refreshSubcollections(selectedProject.id);
      setStageRemarks('');
      setActionBanner(
        `Project ${selectedProject.projectNumber} updated to Stage ${nextStageDef.index}/10 (${nextStageDef.label}) by ${responsibleStaffName}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `projects/${selectedProject.id}`);
    } finally {
      setUpdatingStage(false);
    }
  };

  const handleRecordSimulatedPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedProject || payAmountInr <= 0) return;

    setRecordingPayment(true);
    setErrorBanner(null);
    setActionBanner(null);

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const paymentReference = `SIM-TXN-${Math.floor(100000 + Math.random() * 899999)}`;

    try {
      await setDoc(doc(db, 'projects', selectedProject.id, 'payments', paymentId), {
        projectId: selectedProject.id,
        ownerUid: selectedProject.ownerUid,
        assignedStaffUids: selectedProject.assignedStaffUids,
        paymentReference,
        milestone: payMilestone,
        amountInr: Math.round(payAmountInr),
        paymentMode: payMode,
        isSimulation: true,
        recordedByUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
      });

      const contact = leadContacts[selectedProject.leadId];
      const maskedPhone = contact?.mobileNumber
        ? `+91-XXXXXX${contact.mobileNumber.slice(-4)}`
        : '+91-XXXXXX0000';

      await logSimulatedNotification({
        recipientUid: selectedProject.ownerUid,
        assignedStaffUids: selectedProject.assignedStaffUids,
        channel: 'SMS_SIMULATION',
        eventType: 'PAYMENT_SIMULATED',
        referenceCode: paymentReference,
        maskedRecipientPhone: maskedPhone,
        title: `Simulated Payment Recorded (${paymentReference})`,
        message: `[Simulated SMS] Simulated payment of ₹${Math.round(payAmountInr).toLocaleString('en-IN')} (${payMilestone}) logged for solar project ${selectedProject.projectNumber}.`,
      });

      await refreshSubcollections(selectedProject.id);
      setActionBanner(
        `Recorded simulated payment ${paymentReference} of ₹${Math.round(payAmountInr).toLocaleString('en-IN')}.`
      );
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `projects/${selectedProject.id}/payments/${paymentId}`
      );
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleDocFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(f.type)) {
      setErrorBanner('Unsupported document format. Please select a PDF, JPEG, PNG, or WebP file.');
      return;
    }
    if (f.size > MAX_BILL_FILE_BYTES) {
      setErrorBanner('Project document must be 5 MB or smaller.');
      return;
    }

    setErrorBanner(null);
    setSelectedDocFile(f);
    setDocFileName(f.name);
    setDocFileSizeKb(Math.max(1, Math.round(f.size / 1024)));
    if (!docTitle) {
      setDocTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleAttachDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedProject) return;

    const cleanTitle = (docTitle.trim() || docType.replace(/_/g, ' ')).slice(0, 140);
    setUploadingDoc(true);
    setErrorBanner(null);
    setActionBanner(null);

    const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let finalFileName = (docFileName.trim() || 'Engineering_Record.pdf').slice(0, 160);
    let finalFileSizeKb = Math.max(1, Math.min(10240, Math.round(docFileSizeKb || 250)));

    try {
      // If a real local file is chosen, upload binary securely to RBAC-protected backend storage
      if (selectedDocFile) {
        const uploaded = await uploadProtectedProjectDocument({
          projectId: selectedProject.id,
          docId,
          file: selectedDocFile,
          ownerUid: selectedProject.ownerUid,
          assignedStaffUids: selectedProject.assignedStaffUids,
          uploadedByName: responsibleStaffName,
        });
        finalFileName = uploaded.fileName.slice(0, 160);
        finalFileSizeKb = uploaded.fileSizeKb;
      }

      const staffNotePrefix = `Staff: ${responsibleStaffName}`;
      const combinedNotes = docNotes.trim()
        ? `${staffNotePrefix} · ${docNotes.trim()}`
        : `${staffNotePrefix}${selectedDocFile ? ' · Protected file stored' : ''}`;

      await setDoc(doc(db, 'projects', selectedProject.id, 'documents', docId), {
        projectId: selectedProject.id,
        ownerUid: selectedProject.ownerUid,
        assignedStaffUids: selectedProject.assignedStaffUids,
        docTitle: cleanTitle,
        docType,
        fileName: finalFileName,
        fileSizeKb: finalFileSizeKb,
        uploadedByUid: firebaseUser.uid,
        notes: combinedNotes.slice(0, 300),
        createdAt: serverTimestamp(),
      });

      setDocTitle('');
      setDocNotes('');
      setSelectedDocFile(null);
      await refreshSubcollections(selectedProject.id);
      setActionBanner(
        `Uploaded "${cleanTitle}" (${finalFileSizeKb} KB) to ${selectedProject.projectNumber}.`
      );
    } catch (error) {
      if (error instanceof Error && !error.message.includes('permission')) {
        setErrorBanner(error.message);
      } else {
        handleFirestoreError(
          error,
          OperationType.CREATE,
          `projects/${selectedProject.id}/documents/${docId}`
        );
      }
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDownloadDocument = async (docItem: ProjectDocumentDoc) => {
    if (!selectedProject) return;
    setDownloadingDocId(docItem.id);
    setErrorBanner(null);
    try {
      await downloadProtectedProjectDocument({
        projectId: selectedProject.id,
        docId: docItem.id,
        fileName: docItem.fileName,
        workspaceMode,
      });
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to download protected project document.'
      );
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleCopyTrackingUrl = async () => {
    if (!selectedProject) return;
    const url = `${window.location.origin}/track/${selectedProject.trackingToken}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2200);
  };

  const selectedDelayInfo = useMemo(() => {
    if (!selectedProject) return null;
    return evaluateProjectDelay(selectedProject.currentStage, selectedProject.stageStartedAt);
  }, [selectedProject]);

  return (
    <AppShell title={dict.navProjects} breadcrumb="10-Stage EPC Execution & Net Metering">
      <div className="space-y-6">
        {/* Filter Tabs */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(['ALL', 'ACTIVE', 'DELAYED', 'COMPLETED'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-emerald-900 dark:bg-emerald-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab === 'ALL'
                  ? `All Projects (${projects.length})`
                  : tab === 'ACTIVE'
                    ? 'Active Installations'
                    : tab === 'DELAYED'
                      ? 'Delayed / Stuck'
                      : 'Completed Plants'}
              </button>
            ))}
          </div>

          <Link
            to="/quotations/builder"
            className="text-xs font-semibold text-sky-900 dark:text-sky-300 hover:underline whitespace-nowrap shrink-0"
          >
            Convert Approved Quote to New Project →
          </Link>
        </section>

        {actionBanner && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
              {actionBanner}
            </span>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="font-semibold text-emerald-900 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-red-800 dark:text-red-200 font-medium">
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="font-semibold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Master-Detail Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 4 Cols: Project Selector Cards */}
          <div className="lg:col-span-4 space-y-3">
            {dataLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-slate-500 dark:text-slate-400">
                No solar projects in this filter state.
              </div>
            ) : (
              filteredProjects.map((proj) => {
                const sla = evaluateProjectDelay(proj.currentStage, proj.stageStartedAt);
                const isStuck =
                  proj.currentStage !== 'PROJECT_COMPLETED' && (proj.isDelayed || sla.isDelayed);
                const selected = proj.id === selectedProject?.id;
                const stageLabel =
                  PROJECT_STAGES.find((s) => s.code === proj.currentStage)?.label ||
                  proj.currentStage;

                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => setSelectedProjectId(proj.id)}
                    className={`w-full text-left rounded-xl p-4 border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/40 border-emerald-700 dark:border-emerald-500'
                        : isStuck
                          ? 'bg-red-50/40 dark:bg-red-950/25 border-red-300 dark:border-red-800 hover:border-red-400 dark:hover:border-red-700'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono tabular-nums text-xs font-bold text-slate-900 dark:text-slate-100">
                        {proj.projectNumber}
                      </span>
                      <span
                        className={`text-xs font-mono tabular-nums font-semibold ${
                          isStuck
                            ? 'text-red-700 dark:text-red-400'
                            : proj.currentStage === 'PROJECT_COMPLETED'
                              ? 'text-emerald-800 dark:text-emerald-400'
                              : 'text-sky-900 dark:text-sky-300'
                        }`}
                      >
                        Stage {proj.stageIndex}/10
                      </span>
                    </div>
                    <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                      {proj.customerName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {proj.city} ({proj.pincode}) ·{' '}
                      <span className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                        {proj.systemCapacityKw} kW
                      </span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 dark:text-slate-300 truncate">
                        {stageLabel}
                      </span>
                      {isStuck && (
                        <span className="inline-flex items-center gap-1 text-red-700 dark:text-red-400 font-semibold shrink-0">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Delayed ({sla.daysInStage}d)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right 8 Cols: Selected Project Execution Workspace */}
          <div className="lg:col-span-8 space-y-6">
            {!selectedProject ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Select a solar installation project on the left to manage stages, documents, and
                simulated payments.
              </div>
            ) : (
              <>
                {/* Project Header & Secure Customer Tracking Link */}
                <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-mono tabular-nums font-semibold text-emerald-900 dark:text-emerald-400">
                        {selectedProject.projectNumber} · {selectedProject.city} (
                        {selectedProject.pincode})
                      </div>
                      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        {selectedProject.customerName} — {selectedProject.systemCapacityKw} kW
                        Rooftop Plant
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Net Customer Cost:{' '}
                        <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                          ₹{selectedProject.netCustomerCostInr.toLocaleString('en-IN')}
                        </span>{' '}
                        · Subsidy Tracked:{' '}
                        <span className="font-mono tabular-nums font-semibold text-emerald-800 dark:text-emerald-400">
                          ₹{selectedProject.applicableSubsidyInr.toLocaleString('en-IN')}
                        </span>{' '}
                        · Stage Started:{' '}
                        <span className="font-mono tabular-nums">
                          {selectedProject.stageStartedAt.slice(0, 10)}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyTrackingUrl()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedToken ? (
                          <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedToken ? 'Copied Link' : 'Copy Customer Status Link'}
                      </button>

                      <Link
                        to={`/track/${selectedProject.trackingToken}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-950 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors whitespace-nowrap shrink-0"
                      >
                        Customer View
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Delayed / SLA Alert Banner */}
                  {selectedProject.currentStage !== 'PROJECT_COMPLETED' &&
                    (selectedProject.isDelayed || selectedDelayInfo?.isDelayed) && (
                      <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
                        <AlertTriangle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-semibold">
                            Delayed Project Alert ({selectedDelayInfo?.daysInStage ?? 0} days in
                            current stage, SLA {selectedDelayInfo?.slaDays ?? 0} days):
                          </span>{' '}
                          {selectedProject.delayReason || selectedProject.pendingActivities}
                        </div>
                      </div>
                    )}

                  {/* 10-Stage Progress Stepper */}
                  <div className="pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {PROJECT_STAGES.map((st) => {
                        const done =
                          st.index < selectedProject.stageIndex ||
                          selectedProject.currentStage === 'PROJECT_COMPLETED';
                        const current =
                          st.code === selectedProject.currentStage &&
                          selectedProject.currentStage !== 'PROJECT_COMPLETED';
                        return (
                          <div
                            key={st.code}
                            className={`rounded-lg px-3.5 py-2.5 border text-xs flex items-start gap-2.5 ${
                              current
                                ? 'bg-sky-50/80 dark:bg-sky-950/50 border-sky-600 dark:border-sky-500 text-sky-950 dark:text-sky-100'
                                : done
                                  ? 'bg-emerald-50/40 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/70 text-slate-800 dark:text-slate-200'
                                  : 'bg-white dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {done ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                              ) : current ? (
                                <Clock className="w-4 h-4 text-sky-800 dark:text-sky-400" />
                              ) : (
                                <span className="font-mono tabular-nums font-semibold">
                                  {st.index}.
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate">
                                {st.index}. {st.label}
                              </div>
                              <div className="text-[11px] opacity-80 truncate">
                                {st.slaDays > 0 ? `Target SLA: ${st.slaDays} days` : 'Final Handover'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Stage Progression & Delay Control Form (Sales Staff) */}
                {workspaceMode === 'SALES' && (
                  <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                        Update Project Lifecycle Stage & SLA Status
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Responsible Staff:{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {responsibleStaffName}
                        </strong>
                      </span>
                    </div>
                    <form onSubmit={(e) => void handleStageUpdate(e)} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Next / Target Stage
                          </label>
                          <select
                            value={targetStage}
                            onChange={(e) => setTargetStage(e.target.value as ProjectStage)}
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                          >
                            {PROJECT_STAGES.map((s) => (
                              <option key={s.code} value={s.code}>
                                {s.index}. {s.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Next Pending Activity (Visible on Customer Link)
                          </label>
                          <input
                            type="text"
                            value={pendingActivitiesInput}
                            onChange={(e) => setPendingActivitiesInput(e.target.value)}
                            placeholder="e.g. MSEDCL bi-directional meter testing scheduled"
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Engineering / Audit Remarks
                          </label>
                          <input
                            type="text"
                            value={stageRemarks}
                            onChange={(e) => setStageRemarks(e.target.value)}
                            placeholder="Record engineering milestone note for audit history..."
                            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                          />
                        </div>

                        <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={markDelayed}
                              onChange={(e) => setMarkDelayed(e.target.checked)}
                              className="rounded border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-emerald-900 dark:text-emerald-600 focus:ring-emerald-700"
                            />
                            Flag project as Delayed / Stuck (DISCOM or site bottleneck)
                          </label>

                          {markDelayed && (
                            <input
                              type="text"
                              required
                              value={delayReasonInput}
                              onChange={(e) => setDelayReasonInput(e.target.value)}
                              placeholder="Specify delay reason (e.g. Awaiting MSEDCL net meter inspection)"
                              className="flex-1 min-w-[240px] text-xs bg-red-50/50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-red-500"
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={updatingStage}
                          className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {updatingStage ? 'Saving Stage...' : 'Save Stage & Notify Customer'}
                        </button>
                      </div>
                    </form>
                  </section>
                )}

                {/* Simulated Payment & Protected Document Upload Grid */}
                {workspaceMode === 'SALES' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Simulated Payment Form */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-emerald-800 dark:text-emerald-400" />
                          Record Milestone Payment
                        </h3>
                        <span className="text-[11px] font-medium text-amber-800 dark:text-amber-400">
                          Simulated Receipt
                        </span>
                      </div>
                      <form
                        onSubmit={(e) => void handleRecordSimulatedPayment(e)}
                        className="space-y-3"
                      >
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Payment Milestone
                          </label>
                          <select
                            value={payMilestone}
                            onChange={(e) =>
                              setPayMilestone(e.target.value as ProjectPaymentDoc['milestone'])
                            }
                            className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                          >
                            <option value="ADVANCE_BOOKING">20% Advance Booking</option>
                            <option value="STRUCTURE_DISPATCH">70% Kit & Structure Dispatch</option>
                            <option value="FINAL_HANDOVER">10% Commissioning Handover</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Simulated Mode
                            </label>
                            <select
                              value={payMode}
                              onChange={(e) =>
                                setPayMode(e.target.value as ProjectPaymentDoc['paymentMode'])
                              }
                              className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                            >
                              <option value="SIMULATED_UPI">Simulated UPI</option>
                              <option value="SIMULATED_NEFT">Simulated NEFT</option>
                              <option value="SIMULATED_CARD">Simulated Card</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                              Amount (₹)
                            </label>
                            <input
                              type="number"
                              min={500}
                              required
                              value={payAmountInr}
                              onChange={(e) => setPayAmountInr(Number(e.target.value))}
                              className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={recordingPayment}
                          className="w-full py-2 text-xs font-semibold text-emerald-950 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                        >
                          {recordingPayment
                            ? 'Recording...'
                            : 'Record Simulated Payment Receipt'}
                        </button>
                      </form>
                    </section>

                    {/* Protected Engineering Document Upload Form */}
                    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Upload className="w-4 h-4 text-sky-800 dark:text-sky-400" />
                        Upload Protected Project Document
                      </h3>
                      <form onSubmit={(e) => void handleAttachDocument(e)} className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Document Category
                          </label>
                          <select
                            value={docType}
                            onChange={(e) =>
                              setDocType(e.target.value as ProjectDocumentDoc['docType'])
                            }
                            className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                          >
                            <option value="SITE_SURVEY_REPORT">Site Survey & Shadow Report</option>
                            <option value="SINGLE_LINE_DIAGRAM">
                              Electrical Single Line Diagram
                            </option>
                            <option value="NET_METERING_APPLICATION">
                              MSEDCL Net Metering Application
                            </option>
                            <option value="SUBSIDY_VOUCHER">National Portal Subsidy Voucher</option>
                            <option value="COMMISSIONING_REPORT">
                              Plant Commissioning Certificate
                            </option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                            Attach PDF / Photo (Max 5 MB · RBAC Protected)
                          </label>
                          <input
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            onChange={handleDocFileInput}
                            className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-sky-50 dark:file:bg-sky-950/60 file:text-sky-900 dark:file:text-sky-200"
                          />
                        </div>

                        <input
                          type="text"
                          value={docNotes}
                          onChange={(e) => setDocNotes(e.target.value)}
                          placeholder="Document notes (e.g. Approved by Nagpur Urban Sub-Division)"
                          className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                        />

                        <button
                          type="submit"
                          disabled={uploadingDoc}
                          className="w-full py-2 text-xs font-semibold text-sky-950 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/60 transition-colors cursor-pointer"
                        >
                          {uploadingDoc ? 'Uploading Document...' : 'Upload & Attach Document'}
                        </button>
                      </form>
                    </section>
                  </div>
                )}

                {/* Recorded Payments, Documents & Audit History Lists (with Timestamps & Responsible Staff) */}
                <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-800 dark:text-emerald-400" />
                      Milestone Payments ({payments.length})
                    </h4>
                    {loadingSub ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Loading...</p>
                    ) : payments.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No simulated payments recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {payments.map((pay) => (
                          <div
                            key={pay.id}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs"
                          >
                            <div className="flex items-center justify-between font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                              <span>₹{pay.amountInr.toLocaleString('en-IN')}</span>
                              <span className="text-[10px] text-amber-800 dark:text-amber-400">
                                SIMULATION
                              </span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                              {pay.milestone.replace(/_/g, ' ')} ·{' '}
                              {pay.paymentMode.replace('SIMULATED_', '')}
                            </div>
                            <div className="font-mono tabular-nums text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                              {pay.paymentReference} · {formatRecordTimestamp(pay.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-sky-800 dark:text-sky-400" />
                      Project Documents ({documents.length})
                    </h4>
                    {loadingSub ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Loading...</p>
                    ) : documents.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No engineering documents attached.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {documents.map((d) => (
                          <div
                            key={d.id}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">
                                {d.docTitle}
                              </div>
                              <button
                                type="button"
                                disabled={downloadingDocId === d.id}
                                onClick={() => void handleDownloadDocument(d)}
                                title="Download RBAC-protected attachment"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-900 dark:text-sky-300 hover:underline shrink-0 cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                File
                              </button>
                            </div>
                            <div className="text-slate-500 dark:text-slate-400 font-mono tabular-nums text-[11px]">
                              {d.fileName} ({d.fileSizeKb} KB)
                            </div>
                            {d.notes && (
                              <div className="text-slate-600 dark:text-slate-300">{d.notes}</div>
                            )}
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                              {formatRecordTimestamp(d.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                      Stage History & Staff ({historyList.length})
                    </h4>
                    {loadingSub ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">Loading...</p>
                    ) : historyList.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        No stage transitions logged yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {historyList.map((h) => (
                          <div
                            key={h.id}
                            className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs"
                          >
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              Stage {h.stageIndex}: {h.toStage.replace(/_/g, ' ')}
                            </div>
                            <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                              {h.remarks}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                              Staff:{' '}
                              <strong className="text-slate-700 dark:text-slate-200">
                                {h.updatedByName}
                              </strong>
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                              {formatRecordTimestamp(h.createdAt)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
