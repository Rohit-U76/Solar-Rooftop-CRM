import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileCheck2,
  FolderPlus,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { runBackendQuotationCalculation } from '../lib/apiClient.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import {
  buildSnapshotComparisonOptions,
  downloadQuotationPdf,
} from '../lib/pdfGenerator.ts';
import type {
  QuotationCalculationResult,
  QuotationComparisonOption,
} from '../shared/solarEngine.ts';
import type {
  QuotationLineItemDoc,
  QuotationStatus,
  SolarQuotationDoc,
} from '../types/domain.ts';

function addDaysIso(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return isoDate;
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function maskCustomerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}

export function QuotationBuilderPage() {
  const {
    firebaseUser,
    profile,
    isBootstrappedAdmin,
    workspaceMode,
    language,
    dataLoading,
    leads,
    leadContacts,
    adminRules,
    quotations,
    logSimulatedNotification,
  } = useAuthData();
  const dict = t(language);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isSales = workspaceMode === 'SALES';
  const preselectedLeadId = searchParams.get('leadId') || '';

  const [selectedLeadId, setSelectedLeadId] = useState<string>(preselectedLeadId);
  const [quotationDate, setQuotationDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [validityDays, setValidityDays] = useState<number>(21);
  const [systemCapacityKw, setSystemCapacityKw] = useState<number>(3);
  const [selectedPanelCode, setSelectedPanelCode] = useState<string>('');
  const [selectedTariffCode, setSelectedTariffCode] = useState<string>('');
  const [isResidentialTariff, setIsResidentialTariff] = useState<boolean>(true);
  const [equipmentAdjustmentInr, setEquipmentAdjustmentInr] = useState<number>(0);
  const [installationAdjustmentInr, setInstallationAdjustmentInr] = useState<number>(0);

  const [calcResult, setCalcResult] = useState<QuotationCalculationResult | null>(null);
  const [comparisonOptions, setComparisonOptions] = useState<QuotationComparisonOption[]>([]);
  const [appliedSnapshot, setAppliedSnapshot] = useState<
    Record<string, string | number | boolean>
  >({});
  const [resolvedPanelTitle, setResolvedPanelTitle] = useState<string>('');
  const [calculating, setCalculating] = useState<boolean>(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  const [savingQuote, setSavingQuote] = useState<boolean>(false);
  const [busyQuotationId, setBusyQuotationId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [previewQuote, setPreviewQuote] = useState<SolarQuotationDoc | null>(null);

  const panelRules = useMemo(
    () => adminRules.filter((r) => r.ruleCategory === 'SOLAR_OPTION' && r.isActive),
    [adminRules]
  );
  const tariffRules = useMemo(
    () => adminRules.filter((r) => r.ruleCategory === 'ELECTRICITY_TARIFF' && r.isActive),
    [adminRules]
  );

  // Sync default selected lead & capacity
  useEffect(() => {
    if (!selectedLeadId && leads.length > 0) {
      const target =
        leads.find((l) => l.id === preselectedLeadId) ||
        leads.find((l) => l.leadNumber === 'LD-30881') ||
        leads[0];
      if (target) {
        setSelectedLeadId(target.id);
        setSystemCapacityKw(target.recommendedCapacityKw > 0 ? target.recommendedCapacityKw : 3);
      }
    }
  }, [leads, preselectedLeadId, selectedLeadId]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId]
  );

  useEffect(() => {
    if (selectedLead) {
      setSystemCapacityKw(
        selectedLead.recommendedCapacityKw > 0 ? selectedLead.recommendedCapacityKw : 2
      );
    }
  }, [selectedLeadId]);

  useEffect(() => {
    if (!selectedPanelCode && panelRules.length > 0) {
      setSelectedPanelCode(panelRules[0].code);
    }
  }, [panelRules, selectedPanelCode]);

  useEffect(() => {
    if (!selectedTariffCode && tariffRules.length > 0) {
      setSelectedTariffCode(tariffRules[0].code);
    }
  }, [tariffRules, selectedTariffCode]);

  // Trigger deterministic backend calculation + 4-option matrix whenever inputs change
  useEffect(() => {
    if (!isSales || !selectedLead || adminRules.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setCalculating(true);
      setCalcError(null);
      try {
        const res = await runBackendQuotationCalculation({
          quotationDate,
          systemCapacityKw: Number(systemCapacityKw) || 1,
          recommendedCapacityKw: selectedLead.recommendedCapacityKw,
          ownershipType: selectedLead.ownershipType,
          isResidentialTariff,
          selectedPanelCode: selectedPanelCode || undefined,
          selectedTariffCode: selectedTariffCode || undefined,
          customEquipmentAdjustmentInr: Number(equipmentAdjustmentInr) || 0,
          customInstallationAdjustmentInr: Number(installationAdjustmentInr) || 0,
          rules: adminRules,
        });
        if (!cancelled) {
          setCalcResult(res.calculation);
          setComparisonOptions(res.comparisonOptions || []);
          setAppliedSnapshot(res.appliedRuleSnapshot);
          setResolvedPanelTitle(res.panelTitle);
        }
      } catch (err) {
        if (!cancelled) {
          setCalcResult(null);
          setComparisonOptions([]);
          setCalcError(err instanceof Error ? err.message : 'Calculation failed.');
        }
      } finally {
        if (!cancelled) {
          setCalculating(false);
        }
      }
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isSales,
    selectedLead,
    quotationDate,
    systemCapacityKw,
    isResidentialTariff,
    selectedPanelCode,
    selectedTariffCode,
    equipmentAdjustmentInr,
    installationAdjustmentInr,
    adminRules,
  ]);

  const validUntilPreview = useMemo(
    () => addDaysIso(quotationDate, validityDays),
    [quotationDate, validityDays]
  );

  const handleCreateQuotation = async (initialStatus: 'DRAFT' | 'ISSUED') => {
    if (!firebaseUser || !selectedLead || !calcResult) return;

    setSavingQuote(true);
    setFeedbackBanner(null);

    const quotationId = `qt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const yearStr = quotationDate.slice(0, 4) || '2025';
    const seq = Math.floor(1000 + Math.random() * 8999);
    const quotationNumber = `QT-${yearStr}-${seq}`;
    const validUntilDate = addDaysIso(quotationDate, validityDays);

    const staffList = Array.from(
      new Set([...selectedLead.assignedStaffUids, firebaseUser.uid])
    ).slice(0, 10);

    const quotePayload = {
      quotationNumber,
      leadId: selectedLead.id,
      ownerUid: selectedLead.ownerUid,
      assignedStaffUids: staffList,
      customerName: selectedLead.customerName,
      city: selectedLead.city,
      pincode: selectedLead.pincode,
      ownershipType: selectedLead.ownershipType,
      systemCapacityKw: calcResult.systemCapacityKw,
      panelTypeLabel: resolvedPanelTitle || 'Mono PERC / TOPCon Solar PV Package',
      annualGenerationUnits: calcResult.annualGenerationUnits,
      equipmentCostInr: calcResult.equipmentCostInr,
      installationChargesInr: calcResult.installationChargesInr,
      totalInstallationCostInr: calcResult.totalInstallationCostInr,
      applicableSubsidyInr: calcResult.applicableSubsidyInr,
      netCustomerCostInr: calcResult.netCustomerCostInr,
      electricityTariffInr: calcResult.electricityTariffInr,
      selfConsumptionUnits: calcResult.selfConsumptionUnits,
      estimatedAnnualSavingsInr: calcResult.estimatedAnnualSavingsInr,
      estimatedPaybackYears: calcResult.estimatedPaybackYears,
      quotationDate,
      validUntilDate,
      appliedRuleSnapshot: appliedSnapshot,
      status: initialStatus,
      createdByUid: firebaseUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'quotations', quotationId), quotePayload);

      batch.set(doc(db, 'quotations', quotationId, 'items', 'item_1'), {
        quotationId,
        ownerUid: selectedLead.ownerUid,
        assignedStaffUids: staffList,
        itemName: `Solar PV Modules & On-Grid Inverter (${calcResult.systemCapacityKw} kW)`,
        specification: `${resolvedPanelTitle || 'Tier-1 Bifacial Modules'} with MPPT String Inverter`,
        quantity: 1,
        unitPriceInr: calcResult.equipmentCostInr,
        lineTotalInr: calcResult.equipmentCostInr,
        createdAt: serverTimestamp(),
      });

      batch.set(doc(db, 'quotations', quotationId, 'items', 'item_2'), {
        quotationId,
        ownerUid: selectedLead.ownerUid,
        assignedStaffUids: staffList,
        itemName: 'Hot-Dip Galvanized Structure, ACDB/DCDB, Earthing & Net Metering',
        specification: 'Complete turnkey rooftop installation & MSEDCL Vidarbha liaison',
        quantity: 1,
        unitPriceInr: calcResult.installationChargesInr,
        lineTotalInr: calcResult.installationChargesInr,
        createdAt: serverTimestamp(),
      });

      if (selectedLead.leadStage !== 'CONVERTED') {
        batch.update(doc(db, 'leads', selectedLead.id), {
          leadStage: 'QUOTED',
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      const contact = leadContacts[selectedLead.id];
      const maskedPhone = contact?.mobileNumber
        ? `+91-XXXXXX${contact.mobileNumber.slice(-4)}`
        : '+91-XXXXXX0000';

      if (initialStatus === 'ISSUED') {
        await logSimulatedNotification({
          recipientUid: selectedLead.ownerUid,
          assignedStaffUids: staffList,
          channel: 'WHATSAPP_SIMULATION',
          eventType: 'QUOTATION_ISSUED',
          referenceCode: quotationNumber,
          maskedRecipientPhone: maskedPhone,
          title: `Solar Proposal ${quotationNumber} Issued`,
          message: `[Simulated WhatsApp] Dear ${selectedLead.customerName}, your ${calcResult.systemCapacityKw} kW rooftop solar quotation (${quotationNumber}, valid until ${validUntilDate}) with net investment ₹${calcResult.netCustomerCostInr.toLocaleString('en-IN')} is ready for review.`,
        });
      }

      setFeedbackBanner(
        `Saved ${quotationNumber} (${initialStatus}, valid until ${validUntilDate}) for ${selectedLead.customerName} using deterministic backend calculation.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `quotations/${quotationId}`);
    } finally {
      setSavingQuote(false);
    }
  };

  const handleStatusUpdate = async (quote: SolarQuotationDoc, nextStatus: QuotationStatus) => {
    if (!firebaseUser) return;
    setBusyQuotationId(quote.id);
    setFeedbackBanner(null);

    try {
      await updateDoc(doc(db, 'quotations', quote.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === 'APPROVED') {
        const contact = leadContacts[quote.leadId];
        const maskedPhone = contact?.mobileNumber
          ? `+91-XXXXXX${contact.mobileNumber.slice(-4)}`
          : '+91-XXXXXX0000';

        await logSimulatedNotification({
          recipientUid: quote.ownerUid,
          assignedStaffUids: quote.assignedStaffUids,
          channel: 'WHATSAPP_SIMULATION',
          eventType: 'QUOTATION_APPROVED',
          referenceCode: quote.quotationNumber,
          maskedRecipientPhone: maskedPhone,
          title: `Quotation ${quote.quotationNumber} Approved`,
          message: `[Simulated WhatsApp] Solar quotation ${quote.quotationNumber} (${quote.systemCapacityKw} kW) has been approved and is ready to convert into an installation project.`,
        });
      }

      setFeedbackBanner(`Quotation ${quote.quotationNumber} marked as ${nextStatus}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quotations/${quote.id}`);
    } finally {
      setBusyQuotationId(null);
    }
  };

  const handleConvertQuoteToProject = async (quote: SolarQuotationDoc) => {
    if (!firebaseUser) return;
    setBusyQuotationId(quote.id);
    setFeedbackBanner(null);

    const projectId = `prj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cityCode = quote.city.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, 'NGP');
    const projectNumber = `PRJ-${cityCode}-${Math.floor(10000 + Math.random() * 89999)}`;
    // Unguessable 36-char token matching ^[a-zA-Z0-9_\-]+$ and length 24..64
    const trackingToken = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 12)}_${Math.random().toString(36).slice(2, 10)}`;
    const nowIso = new Date().toISOString();

    const staffList = Array.from(
      new Set([...quote.assignedStaffUids, firebaseUser.uid])
    ).slice(0, 10);

    try {
      const batch = writeBatch(db);

      // 1. Project Master Document
      batch.set(doc(db, 'projects', projectId), {
        projectNumber,
        quotationId: quote.id,
        leadId: quote.leadId,
        ownerUid: quote.ownerUid,
        assignedStaffUids: staffList,
        customerName: quote.customerName,
        city: quote.city,
        pincode: quote.pincode,
        systemCapacityKw: quote.systemCapacityKw,
        netCustomerCostInr: quote.netCustomerCostInr,
        applicableSubsidyInr: quote.applicableSubsidyInr,
        currentStage: 'QUOTATION_APPROVED',
        stageIndex: 1,
        pendingActivities:
          'Record 20% advance booking payment (Simulation) and lock engineering slot.',
        isDelayed: false,
        delayReason: '',
        trackingToken,
        stageStartedAt: nowIso,
        completionMonthKey: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2. Atomic Public Capability Tracking Document (Pillar 7 ExistsAfter Guarantee)
      batch.set(doc(db, 'public_tracking', trackingToken), {
        trackingToken,
        projectId,
        projectNumber,
        customerMask: maskCustomerName(quote.customerName),
        city: quote.city,
        systemCapacityKw: quote.systemCapacityKw,
        currentStage: 'QUOTATION_APPROVED',
        stageIndex: 1,
        completedStageIndices: [1],
        pendingActivities:
          'Awaiting booking advance confirmation to schedule engineering survey.',
        isDelayed: false,
        delaySummary: '',
        ownerUid: quote.ownerUid,
        assignedStaffUids: staffList,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 3. Initial Project History Audit Entry
      const histId = `hst_${Date.now()}`;
      batch.set(doc(db, 'projects', projectId, 'history', histId), {
        projectId,
        ownerUid: quote.ownerUid,
        assignedStaffUids: staffList,
        fromStage: 'QUOTATION_ISSUED',
        toStage: 'QUOTATION_APPROVED',
        stageIndex: 1,
        remarks: `Converted from approved quotation ${quote.quotationNumber}.`,
        updatedByUid: firebaseUser.uid,
        updatedByName: profile?.displayName || firebaseUser.email || 'Sales Engineer',
        createdAt: serverTimestamp(),
      });

      // 4. Mark Quotation & Lead as CONVERTED
      batch.update(doc(db, 'quotations', quote.id), {
        status: 'CONVERTED',
        updatedAt: serverTimestamp(),
      });

      const matchingLead = leads.find((l) => l.id === quote.leadId);
      if (matchingLead && matchingLead.leadStage !== 'CONVERTED') {
        batch.update(doc(db, 'leads', quote.leadId), {
          leadStage: 'CONVERTED',
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();

      const contact = leadContacts[quote.leadId];
      const maskedPhone = contact?.mobileNumber
        ? `+91-XXXXXX${contact.mobileNumber.slice(-4)}`
        : '+91-XXXXXX0000';

      await logSimulatedNotification({
        recipientUid: quote.ownerUid,
        assignedStaffUids: staffList,
        channel: 'WHATSAPP_SIMULATION',
        eventType: 'PROJECT_STAGE_UPDATED',
        referenceCode: projectNumber,
        maskedRecipientPhone: maskedPhone,
        title: `Solar Project ${projectNumber} Initiated`,
        message: `[Simulated WhatsApp] Congratulations ${quote.customerName}! Project ${projectNumber} (${quote.systemCapacityKw} kW) is live. Track status anytime at /track/${trackingToken}`,
      });

      navigate(`/projects?projectId=${encodeURIComponent(projectId)}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `projects/${projectId}`);
    } finally {
      setBusyQuotationId(null);
    }
  };

  const handleDownloadPdf = async (quote: SolarQuotationDoc) => {
    if (!firebaseUser) return;
    setBusyQuotationId(quote.id);
    try {
      const itemsRef = collection(db, 'quotations', quote.id, 'items');
      const itemsQuery =
        isSales && isBootstrappedAdmin
          ? query(itemsRef)
          : isSales
            ? query(itemsRef, where('assignedStaffUids', 'array-contains', firebaseUser.uid))
            : query(itemsRef, where('ownerUid', '==', firebaseUser.uid));

      const snap = await getDocs(itemsQuery);
      const lineItems: QuotationLineItemDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<QuotationLineItemDoc, 'id'>),
      }));
      const leadNum = leads.find((l) => l.id === quote.leadId)?.leadNumber;
      downloadQuotationPdf(quote, lineItems, leadNum);
    } catch {
      const leadNum = leads.find((l) => l.id === quote.leadId)?.leadNumber;
      downloadQuotationPdf(quote, [], leadNum);
    } finally {
      setBusyQuotationId(null);
    }
  };

  const previewComparisonOptions = useMemo(
    () => (previewQuote ? buildSnapshotComparisonOptions(previewQuote) : []),
    [previewQuote]
  );

  return (
    <AppShell
      title={isSales ? 'Solar Quotation Builder & Proposals' : dict.navQuotations}
      breadcrumb={isSales ? 'Deterministic Pricing & Subsidy Engine' : 'Homeowner Proposals'}
    >
      <div className="space-y-6">
        {/* Configurable Subsidy Disclaimer Notice */}
        <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/70 rounded-xl p-4 flex items-start gap-3 text-xs text-sky-950 dark:text-sky-200">
          <ShieldAlert className="w-4 h-4 text-sky-800 dark:text-sky-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Deterministic Solar Financial Engine:</span> Yearly
            generation (
            <span className="font-mono">
              Capacity × {appliedSnapshot.annualGenPerKw || 1400} units
            </span>
            ), gross price, configurable subsidy rules with effective dates, net customer cost,
            annual savings, and simple payback are calculated strictly on the backend—never by AI.
          </div>
        </div>

        {feedbackBanner && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
              {feedbackBanner}
            </span>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="font-semibold text-emerald-900 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Sales Staff Interactive Quotation Builder */}
        {isSales && (
          <>
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Configuration Inputs */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Configure Rooftop Solar Quotation
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Select a qualified lead, validity window, and hardware package. Changing
                    quotation date automatically evaluates historical vs current rule versions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Customer Lead
                    </label>
                    <select
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    >
                      {leads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.leadNumber} — {lead.customerName} ({lead.city}, {lead.ownershipType},{' '}
                          {lead.recommendationLabel})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedLead && (
                    <div className="sm:col-span-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong className="text-slate-900 dark:text-slate-100">
                          {selectedLead.customerName}
                        </strong>{' '}
                        · {selectedLead.city} ({selectedLead.pincode}) ·{' '}
                        {selectedLead.ownershipType === 'OWNER' ? 'Homeowner' : 'Tenant'} ·{' '}
                        {selectedLead.roofType.replace('_', ' ')}
                      </span>
                      <span className="font-mono tabular-nums">
                        Bill: ₹{selectedLead.avgMonthlyBillInr.toLocaleString('en-IN')} ·{' '}
                        {selectedLead.averageUnitsKwh} kWh · Score {selectedLead.leadScore}/100
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Quotation Date (Effective Rule Lookup)
                    </label>
                    <input
                      type="date"
                      value={quotationDate}
                      onChange={(e) => setQuotationDate(e.target.value)}
                      className="w-full text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      {dict.validityWindowLabel}
                    </label>
                    <select
                      value={validityDays}
                      onChange={(e) => setValidityDays(Number(e.target.value))}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    >
                      <option value={14}>14 Days (Valid until {addDaysIso(quotationDate, 14)})</option>
                      <option value={21}>21 Days (Valid until {addDaysIso(quotationDate, 21)})</option>
                      <option value={30}>30 Days (Valid until {addDaysIso(quotationDate, 30)})</option>
                      <option value={45}>45 Days (Valid until {addDaysIso(quotationDate, 45)})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Selected System Capacity (kW)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={0.5}
                      value={systemCapacityKw}
                      onChange={(e) => setSystemCapacityKw(Number(e.target.value))}
                      className="w-full text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Consumer Connection Class
                    </label>
                    <select
                      value={isResidentialTariff ? 'RESIDENTIAL' : 'COMMERCIAL'}
                      onChange={(e) => setIsResidentialTariff(e.target.value === 'RESIDENTIAL')}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    >
                      <option value="RESIDENTIAL">
                        LT-I Residential (Subsidy Eligible for Owner)
                      </option>
                      <option value="COMMERCIAL">
                        LT-II Commercial / Shop (No Residential Subsidy)
                      </option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Solar PV Module & Inverter Package
                    </label>
                    <select
                      value={selectedPanelCode}
                      onChange={(e) => setSelectedPanelCode(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2.5 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    >
                      {panelRules.map((rule) => (
                        <option key={rule.id} value={rule.code}>
                          {rule.title} — ₹
                          {Number(rule.parameters.pricePerKwInr || 0).toLocaleString('en-IN')}/kW (v
                          {rule.versionNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Applicable Electricity Tariff Rule
                    </label>
                    <select
                      value={selectedTariffCode}
                      onChange={(e) => setSelectedTariffCode(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    >
                      {tariffRules.map((rule) => (
                        <option key={rule.id} value={rule.code}>
                          {rule.title} (₹{Number(rule.parameters.tariffPerUnitInr || 9.2)}/unit)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Elevated Structure / BOS Adjustment (₹)
                    </label>
                    <input
                      type="number"
                      step={500}
                      value={installationAdjustmentInr}
                      onChange={(e) => setInstallationAdjustmentInr(Number(e.target.value))}
                      className="w-full text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Equipment Discount / Add-on Adjustment (₹, +/-)
                    </label>
                    <input
                      type="number"
                      step={500}
                      value={equipmentAdjustmentInr}
                      onChange={(e) => setEquipmentAdjustmentInr(Number(e.target.value))}
                      className="w-full text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Deterministic Backend Calculation Sheet */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Selected Option Breakdown
                    </h3>
                    {calculating && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Calculating...
                      </span>
                    )}
                  </div>

                  {calcError && (
                    <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg p-3.5 text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{calcError}</span>
                    </div>
                  )}

                  {calcResult && !calcError && (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">
                          1. Solar System Capacity
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {calcResult.systemCapacityKw} kW
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">
                          2. Est. Annual Generation ({calcResult.systemCapacityKw} ×{' '}
                          {Number(appliedSnapshot.annualGenPerKw || 1400).toLocaleString('en-IN')})
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {calcResult.annualGenerationUnits.toLocaleString('en-IN')} units/yr
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">
                          3. Gross Installation Price (Equip + BOS)
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          ₹{calcResult.totalInstallationCostInr.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <div>
                          <div className="text-emerald-900 dark:text-emerald-400 font-medium">
                            4. Applicable Government Subsidy*
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {selectedLead?.ownershipType === 'TENANT'
                              ? '₹0 (Tenant connection ineligible for homeowner DBT)'
                              : `${appliedSnapshot.subsidyRuleTitle || 'Sample Slab'} (v${appliedSnapshot.subsidyRuleVersion || 1})`}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-emerald-800 dark:text-emerald-400">
                          - ₹{calcResult.applicableSubsidyInr.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-lg px-3.5 py-3 flex items-center justify-between">
                        <span className="font-semibold text-emerald-950 dark:text-emerald-200">
                          5. Net Customer Cost (After Subsidy)
                        </span>
                        <span className="text-xl font-bold font-mono tabular-nums text-emerald-950 dark:text-emerald-200">
                          ₹{calcResult.netCustomerCostInr.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="text-slate-600 dark:text-slate-400">
                          6. Est. Annual Savings (@ ₹{calcResult.electricityTariffInr}/unit)
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          ₹{calcResult.estimatedAnnualSavingsInr.toLocaleString('en-IN')} / yr
                        </span>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-600 dark:text-slate-400">
                          7. Estimated Simple Payback
                        </span>
                        <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                          {calcResult.estimatedPaybackYears} Years
                        </span>
                      </div>

                      <div className="pt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        Valid Until: {validUntilPreview} · Rule Window:{' '}
                        {String(appliedSnapshot.subsidyEffectiveFrom || '')} to{' '}
                        {String(appliedSnapshot.subsidyEffectiveTo || '')}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={savingQuote || !calcResult || Boolean(calcError)}
                    onClick={() => void handleCreateQuotation('ISSUED')}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {savingQuote ? 'Saving Proposal...' : dict.issueQuotationBtn}
                  </button>
                  <button
                    type="button"
                    disabled={savingQuote || !calcResult || Boolean(calcError)}
                    onClick={() => void handleCreateQuotation('DRAFT')}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {dict.saveDraftBtn}
                  </button>
                </div>
              </div>
            </section>

            {/* Multi-Option Comparison Matrix (1 kW, 2 kW, 3 kW & Suitable Alternative) */}
            {comparisonOptions.length > 0 && !calcError && (
              <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {dict.multiOptionTitle}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {dict.multiOptionSub}
                    </p>
                  </div>
                  <span className="text-xs text-sky-800 dark:text-sky-300 font-medium">
                    Included automatically in downloadable PDF quotations
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <th className="py-3 px-4">System Option</th>
                        <th className="py-3 px-4 text-right">Yearly Generation</th>
                        <th className="py-3 px-4 text-right">Gross Price</th>
                        <th className="py-3 px-4 text-right">Subsidy*</th>
                        <th className="py-3 px-4 text-right">Net Cost</th>
                        <th className="py-3 px-4 text-right">Annual Savings</th>
                        <th className="py-3 px-4 text-right">Payback</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                      {comparisonOptions.map((opt) => (
                        <tr
                          key={opt.optionKey}
                          className={`transition-colors ${
                            opt.isSelected
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/35'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {opt.optionLabel}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {opt.isRecommended ? 'Recommended for Lead Consumption' : 'Standard Tier'}
                              {opt.isSelected ? ' · Currently Selected' : ''}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            {opt.annualGenerationUnits.toLocaleString('en-IN')} kWh
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            ₹{opt.totalInstallationCostInr.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-800 dark:text-emerald-400 font-medium">
                            -₹{opt.applicableSubsidyInr.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                            ₹{opt.netCustomerCostInr.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                            ₹{opt.estimatedAnnualSavingsInr.toLocaleString('en-IN')}/yr
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-sky-900 dark:text-sky-300">
                            {opt.estimatedPaybackYears} yrs
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSystemCapacityKw(opt.systemCapacityKw)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                opt.isSelected
                                  ? 'bg-emerald-900 dark:bg-emerald-700 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              {opt.isSelected ? 'Selected' : `Use ${opt.systemCapacityKw} kW`}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        {/* Saved Quotations Ledger & PDF / Project Conversion Actions */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {isSales ? 'Generated Solar Quotations' : 'My Solar Proposals & PDF Downloads'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Historical quotations retain their original locked rule snapshot even when admin
                subsidy or tariff rules are updated.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {quotations.length} proposals
            </span>
          </div>

          {dataLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : quotations.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No solar quotations generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-3.5 px-4">Proposal # & Validity</th>
                    <th className="py-3.5 px-4">Customer & System</th>
                    <th className="py-3.5 px-4">Gross / Subsidy / Net</th>
                    <th className="py-3.5 px-4">Savings & Payback</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">PDF, Approval & Conversion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm align-top">
                  {quotations.map((q) => {
                    const busy = busyQuotationId === q.id;
                    return (
                      <tr
                        key={q.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100">
                            {q.quotationNumber}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                            Issued: {q.quotationDate}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-sky-800 dark:text-sky-300">
                            Valid Until: {q.validUntilDate}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {q.customerName}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                            <span className="font-mono tabular-nums font-semibold">
                              {q.systemCapacityKw} kW
                            </span>{' '}
                            · {q.panelTypeLabel}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {q.annualGenerationUnits.toLocaleString('en-IN')} units/yr · {q.city}
                          </div>
                        </td>

                        <td className="py-4 px-4 font-mono tabular-nums">
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Gross: ₹{q.totalInstallationCostInr.toLocaleString('en-IN')}
                          </div>
                          <div className="text-xs text-emerald-800 dark:text-emerald-400">
                            Subsidy: -₹{q.applicableSubsidyInr.toLocaleString('en-IN')}
                          </div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            Net: ₹{q.netCustomerCostInr.toLocaleString('en-IN')}
                          </div>
                        </td>

                        <td className="py-4 px-4 font-mono tabular-nums">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            ₹{q.estimatedAnnualSavingsInr.toLocaleString('en-IN')}/yr
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Payback: {q.estimatedPaybackYears} yrs
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <span
                            className={`text-xs font-semibold ${
                              q.status === 'APPROVED' || q.status === 'CONVERTED'
                                ? 'text-emerald-900 dark:text-emerald-400'
                                : q.status === 'REJECTED'
                                  ? 'text-red-700 dark:text-red-400'
                                  : 'text-sky-900 dark:text-sky-300'
                            }`}
                          >
                            {q.status}
                          </span>
                          <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
                            Rule v{String(q.appliedRuleSnapshot.subsidyRuleVersion || 1)}
                          </div>
                        </td>

                        <td className="py-4 px-4 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewQuote(previewQuote?.id === q.id ? null : q)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {previewQuote?.id === q.id ? 'Hide Options' : 'Compare & Preview'}
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDownloadPdf(q)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-sky-950 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF
                            </button>

                            {(q.status === 'ISSUED' || q.status === 'DRAFT') && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleStatusUpdate(q, 'APPROVED')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <FileCheck2 className="w-3.5 h-3.5" />
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleStatusUpdate(q, 'REJECTED')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Revise
                                </button>
                              </>
                            )}

                            {isSales && q.status === 'APPROVED' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleConvertQuoteToProject(q)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <FolderPlus className="w-3.5 h-3.5" />
                                Convert to Project
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Commercial Proposal Sheet & Locked Multi-Option Preview */}
        {previewQuote && (
          <section className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-400">
                  SuryaSetu Solar EPC Solutions · Nagpur, Maharashtra
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  Commercial Rooftop Solar Quotation — {previewQuote.quotationNumber}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Quotation Date: {previewQuote.quotationDate} · Valid Until:{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {previewQuote.validUntilDate}
                  </strong>{' '}
                  · Customer Approval Status:{' '}
                  <strong className="text-slate-800 dark:text-slate-100">
                    {previewQuote.status}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadPdf(previewQuote)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Download Branded PDF
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700">
                <div className="text-xs text-slate-500 dark:text-slate-400">Customer & Site</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {previewQuote.customerName}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {previewQuote.city} - {previewQuote.pincode} ({previewQuote.ownershipType})
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Selected Plant & Annual Yield
                </div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {previewQuote.systemCapacityKw} kW ·{' '}
                  {previewQuote.annualGenerationUnits.toLocaleString('en-IN')} kWh/yr
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                  {previewQuote.panelTypeLabel}
                </div>
              </div>
              <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/70">
                <div className="text-xs text-emerald-900 dark:text-emerald-300">
                  Net Customer Cost (Post-Subsidy)
                </div>
                <div className="font-mono tabular-nums font-bold text-emerald-950 dark:text-emerald-200 text-lg mt-1">
                  ₹{previewQuote.netCustomerCostInr.toLocaleString('en-IN')}
                </div>
                <div className="text-xs font-mono tabular-nums text-emerald-800 dark:text-emerald-400">
                  Gross ₹{previewQuote.totalInstallationCostInr.toLocaleString('en-IN')} − Subsidy ₹
                  {previewQuote.applicableSubsidyInr.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="p-3.5 bg-sky-50/60 dark:bg-sky-950/40 rounded-lg border border-sky-200 dark:border-sky-800/70">
                <div className="text-xs text-sky-900 dark:text-sky-300">
                  Annual Savings & Payback
                </div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 text-lg mt-1">
                  ₹{previewQuote.estimatedAnnualSavingsInr.toLocaleString('en-IN')}/yr
                </div>
                <div className="text-xs font-mono tabular-nums text-sky-900 dark:text-sky-300">
                  Estimated Payback: {previewQuote.estimatedPaybackYears} Years
                </div>
              </div>
            </div>

            {/* Locked Historical 1 kW / 2 kW / 3 kW / Alternative Comparison Matrix */}
            <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Locked Proposal Options Comparison (1 kW · 2 kW · 3 kW · Suitable Alternative)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-4">Option</th>
                      <th className="py-2.5 px-4 text-right">Annual Generation</th>
                      <th className="py-2.5 px-4 text-right">Gross Price</th>
                      <th className="py-2.5 px-4 text-right">Subsidy*</th>
                      <th className="py-2.5 px-4 text-right">Net Cost</th>
                      <th className="py-2.5 px-4 text-right">Payback</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono tabular-nums">
                    {previewComparisonOptions.map((opt) => (
                      <tr
                        key={opt.optionKey}
                        className={
                          opt.isSelected
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/35 font-semibold'
                            : ''
                        }
                      >
                        <td className="py-2.5 px-4 font-sans text-slate-900 dark:text-slate-100">
                          {opt.optionLabel} {opt.isSelected ? '(Selected)' : ''}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">
                          {opt.annualGenerationUnits.toLocaleString('en-IN')} kWh
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">
                          ₹{opt.totalInstallationCostInr.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 text-right text-emerald-800 dark:text-emerald-400">
                          -₹{opt.applicableSubsidyInr.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-900 dark:text-slate-100">
                          ₹{opt.netCustomerCostInr.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 text-right text-sky-900 dark:text-sky-300">
                          {opt.estimatedPaybackYears} yrs
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
              <p>
                <strong className="text-slate-700 dark:text-slate-300">Terms & Warranty:</strong>{' '}
                25-year PV module performance warranty; 8-year grid-tie inverter warranty; turnkey
                MSEDCL net-metering documentation included.
              </p>
              <p>
                <strong className="text-slate-700 dark:text-slate-300">
                  Historical Rule Audit Snapshot:
                </strong>{' '}
                Computed under{' '}
                {String(
                  previewQuote.appliedRuleSnapshot.subsidyRuleTitle || 'Sample Residential Rule'
                )}{' '}
                (v{String(previewQuote.appliedRuleSnapshot.subsidyRuleVersion || 1)}, effective{' '}
                {String(
                  previewQuote.appliedRuleSnapshot.subsidyEffectiveFrom ||
                    previewQuote.quotationDate
                )}{' '}
                to{' '}
                {String(previewQuote.appliedRuleSnapshot.subsidyEffectiveTo || '2027-12-31')}).
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
