import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { ProtectedBillImage } from '../components/ProtectedBillImage.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import {
  runBackendLeadEvaluation,
  runGeminiBillExtraction,
  uploadElectricityBillFile,
} from '../lib/apiClient.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import {
  maskConsumerNumber,
  MAX_BILL_FILE_BYTES,
  validateExtractionConfirmation,
} from '../shared/solarEngine.ts';
import type { ClarityStatus, QualificationCategory } from '../types/domain.ts';

export function BillAnalysisPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const navigate = useNavigate();
  const {
    firebaseUser,
    workspaceMode,
    language,
    dataLoading,
    leads,
    bills,
    extractions,
    scores,
    logSimulatedNotification,
  } = useAuthData();
  const dict = t(language);

  const lead = leads.find((l) => l.id === leadId);
  const bill = leadId ? bills[leadId] : undefined;
  const extraction = leadId ? extractions[leadId] : undefined;
  const score = leadId ? scores[leadId] : undefined;

  // Editable bill extraction fields
  const [consumerNumber, setConsumerNumber] = useState('');
  const [discomName, setDiscomName] = useState('');
  const [tariffCategory, setTariffCategory] = useState('');
  const [sanctionedLoadKw, setSanctionedLoadKw] = useState('0');
  const [monthlyUnitsKwh, setMonthlyUnitsKwh] = useState('0');
  const [billingAmountInr, setBillingAmountInr] = useState('0');
  const [billingPeriod, setBillingPeriod] = useState('');

  // Clarity, confidence & PII protection state
  const [activeClarityStatus, setActiveClarityStatus] = useState<ClarityStatus>('CLEAR');
  const [activeConfidenceScore, setActiveConfidenceScore] = useState<number>(0);
  const [showFullConsumer, setShowFullConsumer] = useState<boolean>(false);
  const [manualBlurryAttested, setManualBlurryAttested] = useState<boolean>(false);

  // Staff override form
  const [overrideCategory, setOverrideCategory] = useState<QualificationCategory>('MEDIUM');
  const [overrideCapacityKw, setOverrideCapacityKw] = useState<string>('3');
  const [overrideReason, setOverrideReason] = useState<string>('');

  const [scanning, setScanning] = useState(false);
  const [savingConfirm, setSavingConfirm] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bannerMsg, setBannerMsg] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (extraction) {
      setConsumerNumber(extraction.consumerNumber || '');
      setDiscomName(extraction.discomName || '');
      setTariffCategory(extraction.tariffCategory || '');
      setSanctionedLoadKw(String(extraction.sanctionedLoadKw ?? 0));
      setMonthlyUnitsKwh(String(extraction.monthlyUnitsKwh ?? 0));
      setBillingAmountInr(String(extraction.billingAmountInr ?? 0));
      setBillingPeriod(extraction.billingPeriod || '');
      setActiveClarityStatus(extraction.clarityStatus);
      setActiveConfidenceScore(extraction.confidenceScore ?? 0);
      if (!extraction.consumerNumber) {
        setShowFullConsumer(true);
      }
    }
  }, [extraction]);

  useEffect(() => {
    if (score) {
      setOverrideCategory(score.category);
      setOverrideCapacityKw(String(score.recommendedCapacityKw));
      setOverrideReason(score.overrideReason || '');
    }
  }, [score]);

  if (dataLoading && !lead) {
    return (
      <AppShell title="Bill Analysis & Lead Score" breadcrumb="Leads">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 space-y-4">
          <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded w-1/3 animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-72 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-72 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!lead) {
    return (
      <AppShell title="Bill Analysis & Lead Score" breadcrumb="Leads">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Lead record not found or access restricted.
          </p>
          <Link
            to={workspaceMode === 'SALES' ? '/leads' : '/homeowner'}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg"
          >
            Return to Leads
          </Link>
        </div>
      </AppShell>
    );
  }

  const handleLiveRescan = async () => {
    if (!bill) return;
    setScanning(true);
    setBannerMsg(null);
    try {
      const res = await runGeminiBillExtraction(bill.storageRef);
      const ext = res.extraction;
      setConsumerNumber(ext.consumerNumber);
      setDiscomName(ext.discomName);
      setTariffCategory(ext.tariffCategory);
      setSanctionedLoadKw(String(ext.sanctionedLoadKw));
      setMonthlyUnitsKwh(String(ext.monthlyUnitsKwh));
      setBillingAmountInr(String(ext.billingAmountInr));
      setBillingPeriod(ext.billingPeriod);
      setActiveClarityStatus(ext.clarityStatus);
      setActiveConfidenceScore(ext.confidenceScore);

      if (res.warningMessage) {
        setBannerMsg({ type: 'warning', text: res.warningMessage });
      } else if (ext.clarityStatus === 'UNCLEAR_REUPLOAD') {
        setManualBlurryAttested(false);
        setBannerMsg({
          type: 'error',
          text: 'Gemini Vision detected a blurry or unreadable bill image. Please upload a clearer bill photo or manually verify every field below.',
        });
      } else if (ext.clarityStatus === 'LOW_CONFIDENCE') {
        setBannerMsg({
          type: 'warning',
          text: `Extraction completed with ${ext.confidenceScore}% confidence. Marked for mandatory manual verification.`,
        });
      } else {
        setBannerMsg({
          type: 'success',
          text: `Live Gemini Vision scan completed (${ext.confidenceScore}% confidence). Review and confirm values below.`,
        });
      }
    } catch (err: unknown) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Vision scan failed.',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleReuploadBill = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bill || !extraction || !firebaseUser) return;

    if (
      file.size > MAX_BILL_FILE_BYTES ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    ) {
      setBannerMsg({
        type: 'error',
        text: 'Replacement bill must be a valid JPEG, PNG, or WebP under 5 MB.',
      });
      return;
    }

    setScanning(true);
    setBannerMsg(null);
    try {
      const uploaded = await uploadElectricityBillFile({ file });
      await updateDoc(doc(db, 'electricity_bills', bill.id), {
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        fileSizeBytes: uploaded.fileSizeBytes,
        storageRef: uploaded.storageRef,
        updatedAt: serverTimestamp(),
      });

      const vision = await runGeminiBillExtraction(uploaded.storageRef);
      const ext = vision.extraction;
      setConsumerNumber(ext.consumerNumber);
      setDiscomName(ext.discomName);
      setTariffCategory(ext.tariffCategory);
      setSanctionedLoadKw(String(ext.sanctionedLoadKw));
      setMonthlyUnitsKwh(String(ext.monthlyUnitsKwh));
      setBillingAmountInr(String(ext.billingAmountInr));
      setBillingPeriod(ext.billingPeriod);
      setActiveClarityStatus(ext.clarityStatus);
      setActiveConfidenceScore(ext.confidenceScore);

      if (ext.clarityStatus === 'UNCLEAR_REUPLOAD') {
        setManualBlurryAttested(false);
        setBannerMsg({
          type: 'warning',
          text: `Replacement photo uploaded, but image clarity remains low (${ext.confidenceScore}%). Upload a sharper photo or attest manual entry.`,
        });
      } else {
        setBannerMsg({
          type: 'success',
          text: `Replacement bill uploaded and scanned (${ext.confidenceScore}% confidence). Verify and confirm the extracted fields.`,
        });
      }
    } catch (err: unknown) {
      setBannerMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Replacement upload failed.',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleConfirmExtractionAndScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraction || !score || !firebaseUser) return;

    if (activeClarityStatus === 'UNCLEAR_REUPLOAD' && !manualBlurryAttested) {
      setBannerMsg({
        type: 'error',
        text: 'Blurry/unreadable bill detected: please upload a clearer replacement photo or check the manual verification box below after entering accurate values.',
      });
      return;
    }

    const payload = {
      consumerNumber: consumerNumber.trim(),
      discomName: discomName.trim(),
      tariffCategory: tariffCategory.trim(),
      sanctionedLoadKw: Number(sanctionedLoadKw),
      monthlyUnitsKwh: Number(monthlyUnitsKwh),
      billingAmountInr: Number(billingAmountInr),
      billingPeriod: billingPeriod.trim(),
      confidenceScore: activeConfidenceScore,
    };

    const validation = validateExtractionConfirmation(payload);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      if (validation.errors.consumerNumber) {
        setShowFullConsumer(true);
      }
      return;
    }

    setFieldErrors({});
    setSavingConfirm(true);
    setBannerMsg(null);

    try {
      const verStatus = workspaceMode === 'SALES' ? 'STAFF_VERIFIED' : 'USER_CONFIRMED';

      await updateDoc(doc(db, 'bill_extractions', extraction.id), {
        consumerNumber: payload.consumerNumber,
        discomName: payload.discomName,
        tariffCategory: payload.tariffCategory,
        sanctionedLoadKw: payload.sanctionedLoadKw,
        monthlyUnitsKwh: payload.monthlyUnitsKwh,
        billingAmountInr: payload.billingAmountInr,
        billingPeriod: payload.billingPeriod,
        verificationStatus: verStatus,
        extractionNotes: `Verified by ${workspaceMode === 'SALES' ? 'Sales Engineer' : 'Homeowner'} on ${new Date().toISOString().slice(0, 10)} (Confidence ${activeConfidenceScore}%).`,
        verifiedByUid: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });

      // Recompute deterministic qualification using confirmed bill numbers + roofType
      const evalRes = await runBackendLeadEvaluation({
        ownershipType: lead.ownershipType,
        avgMonthlyBillInr: payload.billingAmountInr,
        rooftopAreaSqFt: lead.rooftopAreaSqFt,
        sanctionedLoadKw: payload.sanctionedLoadKw,
        pincode: lead.pincode,
        monthlyUnitsKwh: payload.monthlyUnitsKwh,
        roofType: lead.roofType,
        includeAiExplanation: true,
      });

      if (!score.isOverridden) {
        await updateDoc(doc(db, 'lead_scores', score.id), {
          totalScore: evalRes.totalScore,
          category: evalRes.category,
          recommendedCapacityKw: evalRes.recommendedCapacityKw,
          recommendationLabel: evalRes.recommendationLabel,
          ownershipPoints: evalRes.ownershipPoints,
          billPoints: evalRes.billPoints,
          roofAreaPoints: evalRes.roofAreaPoints,
          loadPoints: evalRes.loadPoints,
          pincodePoints: evalRes.pincodePoints,
          consumptionPoints: evalRes.consumptionPoints,
          recommendationReason:
            (evalRes.recommendationReason || '').slice(0, 1000) ||
            'Deterministic solar sizing evaluated.',
          nextRecommendedAction: (evalRes.nextRecommendedAction || '').slice(0, 300),
          updatedAt: serverTimestamp(),
        });
      }

      if (lead.leadStage !== 'CONVERTED') {
        await updateDoc(doc(db, 'leads', lead.id), {
          averageUnitsKwh: payload.monthlyUnitsKwh,
          sanctionedLoadKw: payload.sanctionedLoadKw,
          avgMonthlyBillInr: payload.billingAmountInr,
          qualificationCategory: evalRes.category,
          leadScore: evalRes.totalScore,
          recommendedCapacityKw: evalRes.recommendedCapacityKw,
          recommendationLabel: evalRes.recommendationLabel,
          surveyStatus: evalRes.suggestedSurveyStatus,
          leadStage: lead.leadStage === 'QUOTED' ? 'QUOTED' : 'QUALIFIED',
          updatedAt: serverTimestamp(),
        });
      }

      await logSimulatedNotification({
        recipientUid: lead.ownerUid,
        assignedStaffUids: lead.assignedStaffUids,
        channel: 'SMS_SIMULATION',
        eventType: 'BILL_VERIFIED',
        referenceCode: lead.leadNumber,
        maskedRecipientPhone: '+91-98230-***00',
        title: `Simulated SMS: Bill Verified for ${lead.leadNumber}`,
        message: `[SIMULATION] Electricity bill (${payload.monthlyUnitsKwh} kWh, ₹${payload.billingAmountInr}) confirmed. Qualification: ${evalRes.category} (${evalRes.totalScore}/100), Recommended Plant: ${evalRes.recommendationLabel}.`,
      });

      setShowFullConsumer(false);
      setBannerMsg({
        type: 'success',
        text: 'Electricity bill details confirmed and deterministic solar qualification updated.',
      });
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.UPDATE, `bill_extractions/${extraction.id}`);
    } finally {
      setSavingConfirm(false);
    }
  };

  const handleStaffOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!score || !firebaseUser) return;
    if (overrideReason.trim().length < 5) {
      setBannerMsg({
        type: 'error',
        text: 'Sales override requires a recorded engineering/commercial reason (minimum 5 characters).',
      });
      return;
    }

    setSavingOverride(true);
    const capNum = Math.max(0, Number(overrideCapacityKw));
    const label = capNum > 0 ? `${capNum} kW` : 'Not yet recommended';

    try {
      await updateDoc(doc(db, 'lead_scores', score.id), {
        totalScore: score.totalScore,
        category: overrideCategory,
        recommendedCapacityKw: capNum,
        recommendationLabel: label,
        recommendationReason: score.recommendationReason,
        nextRecommendedAction: (
          overrideCategory === 'HIGH'
            ? `Sales Override: Proceed with priority site survey for ${label}.`
            : `Sales Override: Follow up per recorded note (${overrideReason.trim()}).`
        ).slice(0, 300),
        isOverridden: true,
        overrideReason: overrideReason.trim().slice(0, 500),
        overriddenByUid: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });

      if (lead.leadStage !== 'CONVERTED') {
        await updateDoc(doc(db, 'leads', lead.id), {
          qualificationCategory: overrideCategory,
          recommendedCapacityKw: capNum,
          recommendationLabel: label,
          updatedAt: serverTimestamp(),
        });
      }

      setBannerMsg({
        type: 'success',
        text: 'Sales staff recommendation override recorded with audit reason.',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lead_scores/${score.id}`);
    } finally {
      setSavingOverride(false);
    }
  };

  return (
    <AppShell
      title={`${lead.leadNumber} · ${lead.customerName}`}
      breadcrumb="AI Bill Analysis & Qualification"
    >
      <div className="space-y-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {lead.ownershipType === 'OWNER' ? dict.ownerLabel : dict.tenantLabel} ·{' '}
              {lead.roofType.replace('_', ' ')} ({lead.rooftopAreaSqFt} sq ft) · {lead.city} (
              {lead.pincode})
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {dict.billVerifyHeading}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleLiveRescan()}
              disabled={scanning || !bill}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {scanning ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Run Live Gemini Vision Scan
            </button>

            {workspaceMode === 'SALES' && (
              <button
                type="button"
                onClick={() => navigate(`/quotations/builder?leadId=${lead.id}`)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Calculator className="w-3.5 h-3.5" />
                Open Quotation Builder
              </button>
            )}
          </div>
        </div>

        {/* Status / Blurry Image Re-Upload Alert */}
        {activeClarityStatus === 'UNCLEAR_REUPLOAD' && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-xs text-red-900 dark:text-red-200">
                <div className="font-semibold">
                  {dict.unclearBillTitle} ({activeConfidenceScore}% Confidence)
                </div>
                <p className="mt-0.5">{dict.unclearBillDesc}</p>
              </div>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-red-700 dark:bg-red-600 rounded-lg hover:bg-red-800 dark:hover:bg-red-500 cursor-pointer whitespace-nowrap shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Upload Clearer Photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleReuploadBill(e)}
                className="hidden"
              />
            </label>
          </div>
        )}

        {activeClarityStatus === 'LOW_CONFIDENCE' && (
          <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">
                Flagged for Manual Verification ({activeConfidenceScore}% Confidence):
              </span>{' '}
              {extraction?.extractionNotes ||
                'Please cross-check every extracted value against the original bill image before confirming.'}
            </div>
          </div>
        )}

        {bannerMsg && (
          <div
            className={`p-3.5 rounded-lg border text-xs ${
              bannerMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70 text-emerald-950 dark:text-emerald-200'
                : bannerMsg.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/70 text-amber-900 dark:text-amber-200'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/70 text-red-800 dark:text-red-200'
            }`}
          >
            {bannerMsg.text}
          </div>
        )}

        {/* Side-by-Side Original Bill Image & Extracted Editable Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Original Bill Image */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {dict.originalBillTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {bill?.fileName || 'Protected Document'} · Extraction Confidence{' '}
                  <span
                    className={`font-mono tabular-nums font-semibold ${
                      activeConfidenceScore >= 75
                        ? 'text-emerald-800 dark:text-emerald-400'
                        : activeConfidenceScore >= 35
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {activeConfidenceScore}%
                  </span>
                </p>
              </div>
              <label className="text-xs font-semibold text-sky-800 dark:text-sky-300 hover:underline cursor-pointer whitespace-nowrap shrink-0">
                Replace Photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void handleReuploadBill(e)}
                  className="hidden"
                />
              </label>
            </div>

            <ProtectedBillImage
              storageRef={bill?.storageRef || ''}
              alt={`Electricity bill for ${lead.customerName}`}
              workspaceMode={workspaceMode}
            />
          </div>

          {/* Right: Extracted Fields Confirmation Form */}
          <form
            onSubmit={(e) => void handleConfirmExtractionAndScore(e)}
            className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {dict.extractedBillTitle}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inspect, edit any misread characters, and confirm to lock consumption inputs.
                </p>
              </div>
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {extraction?.verificationStatus === 'STAFF_VERIFIED'
                  ? 'Staff Verified'
                  : extraction?.verificationStatus === 'USER_CONFIRMED'
                    ? 'Customer Confirmed'
                    : activeClarityStatus === 'UNCLEAR_REUPLOAD'
                      ? 'Re-upload Requested'
                      : 'Pending Confirmation'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Consumer Number *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowFullConsumer((v) => !v)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-800 dark:text-sky-300 hover:underline cursor-pointer"
                  >
                    {showFullConsumer ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        Mask
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        Show / Edit
                      </>
                    )}
                  </button>
                </div>
                {showFullConsumer ? (
                  <input
                    type="text"
                    value={consumerNumber}
                    onChange={(e) => setConsumerNumber(e.target.value)}
                    placeholder="e.g. 410018293401"
                    className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                  />
                ) : (
                  <div className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span>{maskConsumerNumber(consumerNumber)}</span>
                    <span className="text-[11px] font-sans text-slate-400 dark:text-slate-500">
                      DPDP Protected
                    </span>
                  </div>
                )}
                {fieldErrors.consumerNumber && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.consumerNumber}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Distribution Company (DISCOM) *
                </label>
                <input
                  type="text"
                  value={discomName}
                  onChange={(e) => setDiscomName(e.target.value)}
                  placeholder="MSEDCL (Mahavitaran)"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                />
                {fieldErrors.discomName && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.discomName}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tariff Category *
                </label>
                <input
                  type="text"
                  value={tariffCategory}
                  onChange={(e) => setTariffCategory(e.target.value)}
                  placeholder="LT-I Residential"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                />
                {fieldErrors.tariffCategory && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.tariffCategory}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sanctioned Load (kW) *
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={sanctionedLoadKw}
                  onChange={(e) => setSanctionedLoadKw(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                />
                {fieldErrors.sanctionedLoadKw && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.sanctionedLoadKw}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Monthly Electricity Units (kWh) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={monthlyUnitsKwh}
                  onChange={(e) => setMonthlyUnitsKwh(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                />
                {fieldErrors.monthlyUnitsKwh && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.monthlyUnitsKwh}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Billing Amount (₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={billingAmountInr}
                  onChange={(e) => setBillingAmountInr(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                />
                {fieldErrors.billingAmountInr && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.billingAmountInr}
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Billing Period *
                </label>
                <input
                  type="text"
                  value={billingPeriod}
                  onChange={(e) => setBillingPeriod(e.target.value)}
                  placeholder="e.g. 15-MAY-2026 to 14-JUN-2026"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
                />
                {fieldErrors.billingPeriod && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {fieldErrors.billingPeriod}
                  </p>
                )}
              </div>
            </div>

            {activeClarityStatus === 'UNCLEAR_REUPLOAD' && (
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50/70 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 text-xs text-red-900 dark:text-red-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualBlurryAttested}
                  onChange={(e) => setManualBlurryAttested(e.target.checked)}
                  className="mt-0.5 accent-red-700 dark:accent-red-500"
                />
                <span>
                  I cannot upload a clearer bill photo right now and confirm I have manually entered
                  and verified Consumer Number, Tariff, Sanctioned Load, and Monthly Units from the
                  physical paper bill.
                </span>
              </label>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Confirming recalculates lead score & solar sizing deterministically.
              </span>
              <button
                type="submit"
                disabled={savingConfirm}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {savingConfirm ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {workspaceMode === 'SALES' ? dict.verifyLockBtn : dict.confirmBillBtn}
              </button>
            </div>
          </form>
        </div>

        {/* Module 3: Transparent Lead Qualification & Solar Recommendation */}
        {score && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Transparent Lead Qualification & Rooftop Sizing
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Rule-based backend evaluation across ownership, bill, consumption, roof area &amp;
                  type ({lead.roofType.replace('_', ' ')}), sanctioned load, and Vidarbha pincode.
                </p>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Lead Score</div>
                  <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {score.totalScore}
                    <span className="text-sm font-normal text-slate-400 dark:text-slate-500">
                      /100
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Qualification</div>
                  <div
                    className={`text-lg font-bold ${
                      score.category === 'HIGH'
                        ? 'text-emerald-800 dark:text-emerald-400'
                        : score.category === 'MEDIUM'
                          ? 'text-sky-800 dark:text-sky-300'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {score.category}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Recommended Solar
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-emerald-900 dark:text-emerald-400">
                    {score.recommendationLabel}
                  </div>
                </div>
              </div>
            </div>

            {/* 6-Factor Transparent Point Breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Ownership</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {score.ownershipPoints} / 20
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Monthly Bill</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {score.billPoints} / 28
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Units (kWh)</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {score.consumptionPoints} / 18
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div
                  className="text-slate-500 dark:text-slate-400 truncate"
                  title={`Area & ${lead.roofType}`}
                >
                  Roof ({lead.roofType.replace('_', ' ')})
                </div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {score.roofAreaPoints} / 14
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Sanctioned Load</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {score.loadPoints} / 10
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
                <div className="text-slate-500 dark:text-slate-400">Vidarbha Zone</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {score.pincodePoints} / 10
                </div>
              </div>
            </div>

            {/* Explanation & Next Recommended Action */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Reason for Recommendation
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {score.recommendationReason}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/70">
                <div className="text-xs font-semibold text-sky-950 dark:text-sky-200 mb-1">
                  Next Recommended Action (Low-Score Leads Never Auto-Rejected)
                </div>
                <p className="text-sm text-sky-950 dark:text-sky-100 leading-relaxed">
                  {score.nextRecommendedAction}
                </p>
                {score.isOverridden && (
                  <p className="text-xs text-sky-900 dark:text-sky-300 mt-2 pt-2 border-t border-sky-200 dark:border-sky-800">
                    Sales Override Note: {score.overrideReason}
                  </p>
                )}
              </div>
            </div>

            {/* Sales Staff Override Control */}
            {workspaceMode === 'SALES' && (
              <form
                onSubmit={(e) => void handleStaffOverride(e)}
                className="pt-5 border-t border-slate-200 dark:border-slate-800"
              >
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">
                  Sales Engineer Recommendation Override (Requires Recorded Audit Reason)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-3">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Override Priority
                    </label>
                    <select
                      value={overrideCategory}
                      onChange={(e) => setOverrideCategory(e.target.value as QualificationCategory)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    >
                      <option value="HIGH">HIGH</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Capacity (kW)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={overrideCapacityKw}
                      onChange={(e) => setOverrideCapacityKw(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Recorded Override Reason *
                    </label>
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Landlord written NOC verified during phone call"
                      className="w-full px-3 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="submit"
                      disabled={savingOverride}
                      className="w-full py-2 px-3 text-xs font-semibold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {savingOverride ? 'Saving...' : 'Apply Override'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
