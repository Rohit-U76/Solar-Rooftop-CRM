import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ArrowRight, CheckCircle2, FileImage, Loader2, Upload } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import {
  runBackendLeadEvaluation,
  runGeminiBillExtraction,
  uploadElectricityBillFile,
} from '../lib/apiClient.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import {
  MAX_BILL_FILE_BYTES,
  resolvePincodeService,
  validateLeadSubmission,
} from '../shared/solarEngine.ts';
import {
  SAMPLE_BILL_ASSETS,
  type OwnershipType,
  type RoofType,
} from '../types/domain.ts';

async function createBlurryTestBillFile(): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 480;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 480, 600);
    ctx.filter = 'blur(8px)';
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('BLURRY PAPER BILL PHOTO', 60, 140);
    ctx.fillRect(50, 190, 360, 24);
    ctx.fillRect(50, 240, 290, 24);
    ctx.fillRect(50, 290, 340, 24);
  }
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob([], { type: 'image/jpeg' })), 'image/jpeg', 0.65);
  });
  return new File([blob], 'Blurry_Unreadable_Test_Bill.jpg', { type: 'image/jpeg' });
}

export function LeadSubmissionPage() {
  const { firebaseUser, language, logSimulatedNotification } = useAuthData();
  const dict = t(language);
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [ownershipType, setOwnershipType] = useState<OwnershipType>('OWNER');
  const [roofType, setRoofType] = useState<RoofType>('RCC');
  const [rooftopAreaSqFt, setRooftopAreaSqFt] = useState<string>('400');
  const [avgMonthlyBillInr, setAvgMonthlyBillInr] = useState<string>('3200');
  const [pincode, setPincode] = useState<string>('440010');
  const [dpdpConsent, setDpdpConsent] = useState<boolean>(true);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [samplePreset, setSamplePreset] = useState<
    'none' | 'prashant' | 'rohit' | 'ayesha' | 'blurry'
  >('none');
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [statusStep, setStatusStep] = useState<string>('');
  const [submittedLead, setSubmittedLead] = useState<{
    docId: string;
    leadNumber: string;
    scoreCategory: string;
    recommendedLabel: string;
  } | null>(null);

  const pincodeInfo = useMemo(() => resolvePincodeService(pincode), [pincode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors((prev) => ({
        ...prev,
        billImage: 'Invalid file type. Please choose a JPEG, PNG, or WebP image.',
      }));
      return;
    }

    if (file.size > MAX_BILL_FILE_BYTES) {
      setErrors((prev) => ({
        ...prev,
        billImage: 'File exceeds 5 MB limit. Please upload a smaller or compressed photo.',
      }));
      return;
    }

    setErrors((prev) => {
      const next = { ...prev };
      delete next.billImage;
      return next;
    });
    setSamplePreset('none');
    setSelectedFile(file);
    setLocalPreviewUrl(URL.createObjectURL(file));
  };

  const applySampleBillPreset = async (preset: 'prashant' | 'rohit' | 'ayesha' | 'blurry') => {
    setSamplePreset(preset);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.billImage;
      return next;
    });

    if (preset === 'blurry') {
      const blurryFile = await createBlurryTestBillFile();
      setSelectedFile(blurryFile);
      setLocalPreviewUrl(URL.createObjectURL(blurryFile));
      if (!customerName) {
        setCustomerName('Vikas Deshpande');
        setMobileNumber('9823412095');
        setOwnershipType('OWNER');
        setAvgMonthlyBillInr('2400');
        setRooftopAreaSqFt('320');
        setPincode('440015');
      }
      return;
    }

    setSelectedFile(null);
    const url = SAMPLE_BILL_ASSETS[preset];
    setLocalPreviewUrl(url);

    if (preset === 'prashant' && !customerName) {
      setCustomerName('Aniket Kulkarni');
      setMobileNumber('9823412090');
      setOwnershipType('OWNER');
      setRoofType('RCC');
      setAvgMonthlyBillInr('3200');
      setRooftopAreaSqFt('420');
      setPincode('440010');
    } else if (preset === 'rohit' && !customerName) {
      setCustomerName('Saurabh Gadkari');
      setMobileNumber('9823412091');
      setOwnershipType('TENANT');
      setRoofType('RCC');
      setAvgMonthlyBillInr('1900');
      setRooftopAreaSqFt('260');
      setPincode('440010');
    } else if (preset === 'ayesha' && !customerName) {
      setCustomerName('Meenal Joshi');
      setMobileNumber('9823412092');
      setOwnershipType('OWNER');
      setRoofType('METAL_SHEET');
      setAvgMonthlyBillInr('650');
      setRooftopAreaSqFt('200');
      setPincode('440001');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;

    const validation = validateLeadSubmission({
      customerName,
      mobileNumber,
      email,
      ownershipType,
      roofType,
      rooftopAreaSqFt: Number(rooftopAreaSqFt),
      avgMonthlyBillInr: Number(avgMonthlyBillInr),
      pincode,
      dpdpConsent,
      fileMimeType: selectedFile
        ? selectedFile.type
        : samplePreset !== 'none'
          ? 'image/jpeg'
          : undefined,
      fileSizeBytes: selectedFile
        ? selectedFile.size
        : samplePreset !== 'none'
          ? 240000
          : undefined,
    });

    if (!selectedFile && samplePreset === 'none') {
      validation.valid = false;
      validation.errors.billImage =
        'Please upload an electricity bill photo or select a synthetic sample bill.';
    }

    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    setUploadProgress(10);

    try {
      // Step 1: Secure Bill Upload (or synthetic sample reference)
      let storageRef = '';
      let mimeType: 'image/jpeg' | 'image/png' | 'image/webp' = 'image/jpeg';
      let fileSizeBytes = 240000;
      let fileName = `Sample_${samplePreset}_bill.jpg`;

      if (selectedFile) {
        setStatusStep('Uploading & verifying electricity bill image...');
        const uploaded = await uploadElectricityBillFile({
          file: selectedFile,
          onProgress: setUploadProgress,
        });
        storageRef = uploaded.storageRef;
        mimeType = uploaded.mimeType;
        fileSizeBytes = uploaded.fileSizeBytes;
        fileName = uploaded.fileName;
      } else if (samplePreset !== 'none' && samplePreset !== 'blurry') {
        storageRef = SAMPLE_BILL_ASSETS[samplePreset];
        setUploadProgress(100);
      }

      // Step 2: Live Gemini Vision Analysis
      setStatusStep('Analysing electricity bill via Gemini Vision...');
      const visionRes = await runGeminiBillExtraction(storageRef);
      const ext = visionRes.extraction;

      const effectiveMonthlyBill =
        ext.billingAmountInr > 0 ? ext.billingAmountInr : Number(avgMonthlyBillInr);
      const effectiveMonthlyUnits =
        ext.monthlyUnitsKwh > 0 ? ext.monthlyUnitsKwh : Math.round(effectiveMonthlyBill / 9.0);
      const effectiveLoadKw = ext.sanctionedLoadKw > 0 ? ext.sanctionedLoadKw : 2;

      // Step 3: Deterministic Backend Qualification + AI Explanation
      setStatusStep('Computing deterministic rooftop qualification & sizing...');
      const evaluation = await runBackendLeadEvaluation({
        ownershipType,
        avgMonthlyBillInr: effectiveMonthlyBill,
        rooftopAreaSqFt: Number(rooftopAreaSqFt),
        sanctionedLoadKw: effectiveLoadKw,
        pincode: pincode.trim(),
        monthlyUnitsKwh: effectiveMonthlyUnits,
        roofType,
        includeAiExplanation: true,
      });

      // Step 4: Atomic Firestore Persistence across Leads, Isolated PII, Bills, Extractions & Scores
      setStatusStep('Saving qualified solar enquiry...');
      const randomNum = Math.floor(31000 + Math.random() * 68000);
      const leadNumber = `LD-${randomNum}`;
      const leadDocId = `ld_${randomNum}_${firebaseUser.uid.slice(0, 6)}`;
      const billDocId = `bill_${leadDocId}`;
      const extDocId = `ext_${leadDocId}`;
      const scoreDocId = `scr_${leadDocId}`;
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const nowTs = serverTimestamp();

      const batch = writeBatch(db);

      batch.set(doc(db, 'leads', leadDocId), {
        leadNumber,
        ownerUid: firebaseUser.uid,
        assignedStaffUids: [firebaseUser.uid],
        customerName: customerName.trim(),
        ownershipType,
        roofType,
        rooftopAreaSqFt: Number(rooftopAreaSqFt),
        avgMonthlyBillInr: effectiveMonthlyBill,
        averageUnitsKwh: effectiveMonthlyUnits,
        sanctionedLoadKw: effectiveLoadKw,
        pincode: pincode.trim(),
        city: pincodeInfo.city,
        qualificationCategory: evaluation.category,
        leadScore: evaluation.totalScore,
        recommendedCapacityKw: evaluation.recommendedCapacityKw,
        recommendationLabel: evaluation.recommendationLabel,
        surveyStatus:
          ext.clarityStatus === 'UNCLEAR_REUPLOAD'
            ? 'PENDING_REVIEW'
            : evaluation.suggestedSurveyStatus,
        leadStage: 'BILL_UPLOADED',
        monthKey,
        isSampleSeed: false,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      batch.set(doc(db, 'lead_contacts', leadDocId), {
        leadId: leadDocId,
        ownerUid: firebaseUser.uid,
        assignedStaffUids: [firebaseUser.uid],
        mobileNumber: mobileNumber.trim(),
        email: email.trim(),
        dpdpConsent: true,
        retentionDays: 365,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      batch.set(doc(db, 'electricity_bills', billDocId), {
        leadId: leadDocId,
        ownerUid: firebaseUser.uid,
        assignedStaffUids: [firebaseUser.uid],
        fileName,
        mimeType,
        fileSizeBytes,
        storageRef,
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      batch.set(doc(db, 'bill_extractions', extDocId), {
        leadId: leadDocId,
        billId: billDocId,
        ownerUid: firebaseUser.uid,
        assignedStaffUids: [firebaseUser.uid],
        consumerNumber: ext.consumerNumber,
        discomName: ext.discomName,
        tariffCategory: ext.tariffCategory,
        sanctionedLoadKw: ext.sanctionedLoadKw,
        monthlyUnitsKwh: ext.monthlyUnitsKwh,
        billingAmountInr: ext.billingAmountInr,
        billingPeriod: ext.billingPeriod,
        confidenceScore: ext.confidenceScore,
        clarityStatus: ext.clarityStatus,
        verificationStatus:
          ext.clarityStatus === 'UNCLEAR_REUPLOAD' ? 'REUPLOAD_REQUIRED' : 'PENDING_VERIFICATION',
        extractionNotes: (ext.extractionNotes || '').slice(0, 600),
        verifiedByUid: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      batch.set(doc(db, 'lead_scores', scoreDocId), {
        leadId: leadDocId,
        ownerUid: firebaseUser.uid,
        assignedStaffUids: [firebaseUser.uid],
        totalScore: evaluation.totalScore,
        category: evaluation.category,
        recommendedCapacityKw: evaluation.recommendedCapacityKw,
        recommendationLabel: evaluation.recommendationLabel,
        ownershipPoints: evaluation.ownershipPoints,
        billPoints: evaluation.billPoints,
        roofAreaPoints: evaluation.roofAreaPoints,
        loadPoints: evaluation.loadPoints,
        pincodePoints: evaluation.pincodePoints,
        consumptionPoints: evaluation.consumptionPoints,
        recommendationReason: (
          evaluation.recommendationReason || 'Evaluated by deterministic sizing engine.'
        ).slice(0, 1000),
        nextRecommendedAction: (evaluation.nextRecommendedAction || '').slice(0, 300),
        isOverridden: false,
        overrideReason: '',
        overriddenByUid: '',
        createdAt: nowTs,
        updatedAt: nowTs,
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `leads/${leadDocId}`);
      }

      const maskedPhone = `+91-${mobileNumber.trim().slice(0, 5)}-***${mobileNumber.trim().slice(-2)}`;
      await logSimulatedNotification({
        recipientUid: firebaseUser.uid,
        assignedStaffUids: [firebaseUser.uid],
        channel: 'WHATSAPP_SIMULATION',
        eventType: 'LEAD_CREATED',
        referenceCode: leadNumber,
        maskedRecipientPhone: maskedPhone,
        title: `Simulated WhatsApp: Enquiry ${leadNumber} Received`,
        message: `[SIMULATION] Namaskar ${customerName.trim()}, your SuryaSetu rooftop solar enquiry ${leadNumber} (${evaluation.recommendationLabel}) has been registered. Please review & confirm your AI-extracted electricity bill details.`,
      });

      setSubmittedLead({
        docId: leadDocId,
        leadNumber,
        scoreCategory: evaluation.category,
        recommendedLabel: evaluation.recommendationLabel,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to submit solar enquiry.';
      setErrors({ form: msg });
    } finally {
      setSubmitting(false);
      setStatusStep('');
    }
  };

  if (submittedLead) {
    return (
      <AppShell title="Enquiry Confirmation" breadcrumb="Customer Lead Form">
        <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-400 mb-1">
            Enquiry Successfully Registered
          </p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Reference ID:{' '}
            <span className="font-mono tabular-nums">{submittedLead.leadNumber}</span>
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
            Gemini Vision has analysed your uploaded electricity bill. Next, please inspect the
            extracted meter details side-by-side with your bill image to confirm accuracy.
          </p>

          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left mb-6">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Initial Qualification
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {submittedLead.scoreCategory} Priority
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Preliminary Sizing</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-emerald-900 dark:text-emerald-400 mt-0.5">
                {submittedLead.recommendedLabel}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/leads/${submittedLead.docId}/analysis`)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              Verify Extracted Bill & View Score
              <ArrowRight className="w-4 h-4" />
            </button>
            <Link
              to="/homeowner"
              className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Back to My Overview
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={dict.navEnquiry} breadcrumb="Lead Intake">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {dict.leadFormHeading}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {dict.leadFormSubheading}
          </p>
        </div>

        {errors.form && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
            {errors.form}
          </div>
        )}

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 space-y-6"
        >
          {/* Section 1: Applicant Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.customerNameLabel}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Prashant Wankhede"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              />
              {errors.customerName && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.customerName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.mobileLabel}
              </label>
              <input
                type="tel"
                maxLength={10}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="9823012345"
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              />
              {errors.mobileNumber && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.mobileNumber}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.emailOptionalLabel}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              />
              {errors.email && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.pincodeLabel}
              </label>
              <input
                type="text"
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                placeholder="440010"
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {pincode.length === 6
                  ? `${pincodeInfo.city} · ${
                      pincodeInfo.isPrimaryVidarbhaZone
                        ? 'Vidarbha Priority Zone'
                        : pincodeInfo.serviceable
                          ? 'Extended MH Zone'
                          : 'Outside Service Area (Phone Call Qualification)'
                    }`
                  : 'Serving Nagpur (440xxx) & Vidarbha districts'}
              </div>
              {errors.pincode && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.pincode}</p>
              )}
            </div>
          </div>

          {/* Section 2: Property & Roof Profile */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.ownershipStatusLabel}
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(['OWNER', 'TENANT'] as OwnershipType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setOwnershipType(type)}
                    className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      ownershipType === type
                        ? 'bg-white dark:bg-slate-900 text-emerald-950 dark:text-emerald-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {type === 'OWNER' ? dict.ownerLabel : dict.tenantLabel}
                  </button>
                ))}
              </div>
              {ownershipType === 'TENANT' && (
                <p className="text-xs text-sky-800 dark:text-sky-300 mt-1.5">
                  Tenants are never rejected automatically; our advisor will schedule a brief call
                  for landlord NOC guidance.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.roofTypeLabel}
              </label>
              <select
                value={roofType}
                onChange={(e) => setRoofType(e.target.value as RoofType)}
                className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              >
                <option value="RCC">Concrete Flat Terrace (RCC)</option>
                <option value="METAL_SHEET">Industrial / GI Metal Sheet</option>
                <option value="TILED">Clay / Sloped Tiled Roof</option>
                <option value="OTHER">Other / Elevated Fabrication</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.roofAreaLabel}
              </label>
              <input
                type="number"
                min={50}
                max={100000}
                value={rooftopAreaSqFt}
                onChange={(e) => setRooftopAreaSqFt(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Approx. 100 sq ft required per 1 kW solar capacity.
              </p>
              {errors.rooftopAreaSqFt && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.rooftopAreaSqFt}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {dict.monthlyBillLabel}
              </label>
              <input
                type="number"
                min={100}
                max={1000000}
                value={avgMonthlyBillInr}
                onChange={(e) => setAvgMonthlyBillInr(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-800 dark:focus:border-emerald-500"
              />
              {errors.avgMonthlyBillInr && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {errors.avgMonthlyBillInr}
                </p>
              )}
            </div>
          </div>

          {/* Section 3: Electricity Bill Photo Upload & Quick Sample Selector */}
          <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Electricity Bill Photo Upload *
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">{dict.billUploadHint}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400">Test presets:</span>
                <button
                  type="button"
                  onClick={() => void applySampleBillPreset('prashant')}
                  className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer whitespace-nowrap shrink-0 ${
                    samplePreset === 'prashant'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-700 dark:border-emerald-500 text-emerald-950 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  ₹3,200 Owner
                </button>
                <button
                  type="button"
                  onClick={() => void applySampleBillPreset('rohit')}
                  className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer whitespace-nowrap shrink-0 ${
                    samplePreset === 'rohit'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-700 dark:border-emerald-500 text-emerald-950 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  ₹1,900 Tenant
                </button>
                <button
                  type="button"
                  onClick={() => void applySampleBillPreset('ayesha')}
                  className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer whitespace-nowrap shrink-0 ${
                    samplePreset === 'ayesha'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-700 dark:border-emerald-500 text-emerald-950 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  ₹650 Low Bill
                </button>
                <button
                  type="button"
                  onClick={() => void applySampleBillPreset('blurry')}
                  className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer whitespace-nowrap shrink-0 ${
                    samplePreset === 'blurry'
                      ? 'bg-red-50 dark:bg-red-950/60 border-red-400 dark:border-red-500 text-red-900 dark:text-red-200'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Blurry Bill Test
                </button>
              </div>
            </div>

            <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-800 dark:hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 dark:bg-slate-800/40">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {selectedFile ? selectedFile.name : 'Click to choose electricity bill photo'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Ensure Consumer Number, Sanctioned Load, Units (kWh), and Total Amount are legible
              </div>
            </label>

            {errors.billImage && (
              <p className="text-xs text-red-600 dark:text-red-400">{errors.billImage}</p>
            )}

            {uploadProgress > 0 && submitting && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
                  <span>{statusStep || 'Uploading...'}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-800 dark:bg-emerald-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {localPreviewUrl && (
              <div className="p-4 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex flex-col sm:flex-row items-start gap-4">
                <img
                  src={localPreviewUrl}
                  alt="Selected electricity bill preview"
                  referrerPolicy="no-referrer"
                  className="w-32 h-40 object-cover rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0"
                />
                <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                    <FileImage className="w-4 h-4 text-emerald-800 dark:text-emerald-400" />
                    Bill Preview Ready for Gemini Vision Extraction
                  </div>
                  <p>
                    {selectedFile
                      ? `${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(0)} KB`
                      : `Synthetic Sample Utility Bill (${samplePreset.toUpperCase()})`}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    Upon submission, Gemini Vision will read printed consumption fields and open the
                    side-by-side confirmation screen.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* DPDP Act 2023 Consent */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={dpdpConsent}
                onChange={(e) => setDpdpConsent(e.target.checked)}
                className="mt-0.5 accent-emerald-900 dark:accent-emerald-500"
              />
              <span>{dict.dpdpConsentLabel}</span>
            </label>
            {errors.dpdpConsent && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.dpdpConsent}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {statusStep || 'Processing Enquiry...'}
                </>
              ) : (
                <>
                  {dict.submitAndScanBtn}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
