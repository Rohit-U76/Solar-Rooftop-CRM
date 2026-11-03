import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  calculateSolarQuotation,
  evaluateLeadQualification,
} from '../shared/solarEngine.ts';
import { SAMPLE_BILL_ASSETS } from '../types/domain.ts';

/**
 * Seeds the Vidarbha sample cohort (LD-30881, LD-30902, LD-30915 + regional leads,
 * versioned admin rules, deterministic quotations, and 10-stage solar projects).
 *
 * Writes are partitioned into dependency-ordered mini-batches so each batch stays
 * strictly under Cloud Firestore's 20-document-access-call (`exists` / `existsAfter` / `get`)
 * security rule limit per atomic batch while preserving cross-document atomicity.
 */
export async function ensureWorkspaceSeeded(
  uid: string,
  userEmail?: string | null
): Promise<boolean> {
  const isGlobalAdmin =
    Boolean(userEmail) && userEmail!.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const ruleScope = isGlobalAdmin ? 'global' : uid;

  const suffix = isGlobalAdmin ? 'hq' : uid.slice(0, 8);
  const staffList = [uid];
  const expectedProjectIds = [
    `prj_30881_${suffix}`,
    `prj_30961_${suffix}`,
    `prj_30928_${suffix}`,
  ];

  // Check existing projects for this workspace
  const existingProjectIds = new Set<string>();
  try {
    const existingProjectsQuery = isGlobalAdmin
      ? query(
          collection(db, 'projects'),
          where('projectNumber', 'in', ['PRJ-NGP-30881', 'PRJ-KMP-30961', 'PRJ-WRD-30928'])
        )
      : query(collection(db, 'projects'), where('assignedStaffUids', 'array-contains', uid));
    const projSnap = await getDocs(existingProjectsQuery);
    projSnap.forEach((d) => existingProjectIds.add(d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'projects');
  }

  // Check existing leads & lead_scores so partial runs resume cleanly
  let hasExistingLeads = false;
  const existingScoreIds = new Set<string>();
  try {
    const existingLeadsQuery = isGlobalAdmin
      ? query(collection(db, 'leads'), where('leadNumber', '==', 'LD-30881'))
      : query(collection(db, 'leads'), where('assignedStaffUids', 'array-contains', uid));
    const leadSnap = await getDocs(existingLeadsQuery);
    hasExistingLeads = !leadSnap.empty;

    const existingScoresQuery = isGlobalAdmin
      ? query(collection(db, 'lead_scores'), where('ownerUid', '==', uid))
      : query(collection(db, 'lead_scores'), where('assignedStaffUids', 'array-contains', uid));
    const scoreSnap = await getDocs(existingScoresQuery);
    scoreSnap.forEach((d) => existingScoreIds.add(d.id));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'leads');
  }

  const allProjectsPresent = expectedProjectIds.every((id) => existingProjectIds.has(id));
  const allScoresPresent = [
    `scr_ld_30881_${suffix}`,
    `scr_ld_30902_${suffix}`,
    `scr_ld_30915_${suffix}`,
    `scr_ld_30928_${suffix}`,
    `scr_ld_30944_${suffix}`,
    `scr_ld_30961_${suffix}`,
  ].every((id) => existingScoreIds.has(id));

  if (hasExistingLeads && allScoresPresent && allProjectsPresent) {
    return false;
  }

  const sampleLeads = [
    {
      key: `ld_30881_${suffix}`,
      leadNumber: 'LD-30881',
      customerName: 'Prashant Wankhede',
      mobileNumber: '9823030881',
      email: 'prashant.wankhede.sample@example.in',
      ownershipType: 'OWNER' as const,
      roofType: 'RCC' as const,
      rooftopAreaSqFt: 450,
      avgMonthlyBillInr: 3200,
      averageUnitsKwh: 340,
      sanctionedLoadKw: 4,
      pincode: '440010',
      city: 'Nagpur',
      surveyStatus: 'SURVEY_COMPLETED' as const,
      leadStage: 'CONVERTED' as const,
      monthKey: '2026-09',
      billAsset: SAMPLE_BILL_ASSETS.prashant,
      consumerNumber: '410018293401',
      billingPeriod: '15-MAY-2026 to 14-JUN-2026',
      confidenceScore: 96,
      clarityStatus: 'CLEAR' as const,
      verificationStatus: 'STAFF_VERIFIED' as const,
    },
    {
      key: `ld_30902_${suffix}`,
      leadNumber: 'LD-30902',
      customerName: 'Rohit Meshram',
      mobileNumber: '9823030902',
      email: 'rohit.meshram.sample@example.in',
      ownershipType: 'TENANT' as const,
      roofType: 'RCC' as const,
      rooftopAreaSqFt: 260,
      avgMonthlyBillInr: 1900,
      averageUnitsKwh: 210,
      sanctionedLoadKw: 2,
      pincode: '440010',
      city: 'Nagpur',
      surveyStatus: 'HOLD_TENANT_CONSENT' as const,
      leadStage: 'QUALIFIED' as const,
      monthKey: '2026-10',
      billAsset: SAMPLE_BILL_ASSETS.rohit,
      consumerNumber: '410019442108',
      billingPeriod: '01-SEP-2026 to 30-SEP-2026',
      confidenceScore: 92,
      clarityStatus: 'CLEAR' as const,
      verificationStatus: 'USER_CONFIRMED' as const,
    },
    {
      key: `ld_30915_${suffix}`,
      leadNumber: 'LD-30915',
      customerName: 'Ayesha Siddiqui',
      mobileNumber: '9823030915',
      email: 'ayesha.siddiqui.sample@example.in',
      ownershipType: 'OWNER' as const,
      roofType: 'RCC' as const,
      rooftopAreaSqFt: 210,
      avgMonthlyBillInr: 650,
      averageUnitsKwh: 85,
      sanctionedLoadKw: 1,
      pincode: '440001',
      city: 'Nagpur',
      surveyStatus: 'CALL_SCHEDULED' as const,
      leadStage: 'QUALIFIED' as const,
      monthKey: '2026-10',
      billAsset: SAMPLE_BILL_ASSETS.ayesha,
      consumerNumber: '410015520934',
      billingPeriod: '05-SEP-2026 to 04-OCT-2026',
      confidenceScore: 91,
      clarityStatus: 'CLEAR' as const,
      verificationStatus: 'USER_CONFIRMED' as const,
    },
    {
      key: `ld_30928_${suffix}`,
      leadNumber: 'LD-30928',
      customerName: 'Vikramaditya Deshmukh',
      mobileNumber: '9823030928',
      email: 'v.deshmukh.sample@example.in',
      ownershipType: 'OWNER' as const,
      roofType: 'RCC' as const,
      rooftopAreaSqFt: 580,
      avgMonthlyBillInr: 4650,
      averageUnitsKwh: 480,
      sanctionedLoadKw: 5,
      pincode: '442001',
      city: 'Wardha / Chandrapur',
      surveyStatus: 'SURVEY_COMPLETED' as const,
      leadStage: 'CONVERTED' as const,
      monthKey: '2026-08',
      billAsset: SAMPLE_BILL_ASSETS.prashant,
      consumerNumber: '410022819044',
      billingPeriod: '01-AUG-2026 to 31-AUG-2026',
      confidenceScore: 94,
      clarityStatus: 'CLEAR' as const,
      verificationStatus: 'STAFF_VERIFIED' as const,
    },
    {
      key: `ld_30944_${suffix}`,
      leadNumber: 'LD-30944',
      customerName: 'Sunita Ingole',
      mobileNumber: '9823030944',
      email: 'sunita.ingole.sample@example.in',
      ownershipType: 'OWNER' as const,
      roofType: 'METAL_SHEET' as const,
      rooftopAreaSqFt: 340,
      avgMonthlyBillInr: 2350,
      averageUnitsKwh: 255,
      sanctionedLoadKw: 3,
      pincode: '444601',
      city: 'Amravati / Akola',
      surveyStatus: 'SURVEY_SCHEDULED' as const,
      leadStage: 'QUOTED' as const,
      monthKey: '2026-10',
      billAsset: SAMPLE_BILL_ASSETS.rohit,
      consumerNumber: '410030944112',
      billingPeriod: '10-SEP-2026 to 09-OCT-2026',
      confidenceScore: 68,
      clarityStatus: 'LOW_CONFIDENCE' as const,
      verificationStatus: 'PENDING_VERIFICATION' as const,
    },
    {
      key: `ld_30961_${suffix}`,
      leadNumber: 'LD-30961',
      customerName: 'Nilesh Bawankule',
      mobileNumber: '9823030961',
      email: 'nilesh.b.sample@example.in',
      ownershipType: 'OWNER' as const,
      roofType: 'RCC' as const,
      rooftopAreaSqFt: 410,
      avgMonthlyBillInr: 3450,
      averageUnitsKwh: 365,
      sanctionedLoadKw: 4,
      pincode: '441110',
      city: 'Kamptee / Hingna',
      surveyStatus: 'SURVEY_COMPLETED' as const,
      leadStage: 'CONVERTED' as const,
      monthKey: '2026-11',
      billAsset: SAMPLE_BILL_ASSETS.prashant,
      consumerNumber: '410044111089',
      billingPeriod: '01-OCT-2026 to 31-OCT-2026',
      confidenceScore: 95,
      clarityStatus: 'CLEAR' as const,
      verificationStatus: 'STAFF_VERIFIED' as const,
    },
  ];

  if (!hasExistingLeads) {
    // ========================================================================
    // Batch 1: Admin Rules (7) + Root Leads (6) + Notifications (2) [0 DB reads]
    // ========================================================================
    const batch1 = writeBatch(db);
    const ts1 = serverTimestamp();

    const adminRules = [
      {
        id: `rule_panel_mono_${suffix}`,
        ruleCategory: 'SOLAR_OPTION',
        workspaceScope: ruleScope,
        title: 'Waaree / Tata 545Wp Mono PERC Half-Cut Package',
        code: 'MONO_PERC_545',
        versionNumber: 2,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2028-12-31',
        isActive: true,
        parameters: {
          pricePerKwInr: 43000,
          annualGenPerKw: 1400,
          efficiencyPct: 21.3,
          warrantyYears: 25,
        },
        notes: 'Standard residential RCC & elevated roof package for Nagpur region (1,400 units/kW/yr).',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        id: `rule_panel_topcon_${suffix}`,
        ruleCategory: 'SOLAR_OPTION',
        workspaceScope: ruleScope,
        title: 'Adani / Premier 580Wp N-Type TOPCon Bifacial Package',
        code: 'TOPCON_BIFACIAL_580',
        versionNumber: 1,
        effectiveFrom: '2025-04-01',
        effectiveTo: '2028-12-31',
        isActive: true,
        parameters: {
          pricePerKwInr: 47500,
          annualGenPerKw: 1400,
          efficiencyPct: 22.6,
          warrantyYears: 30,
        },
        notes: 'High-temperature Vidarbha summer optimized N-Type bifacial modules.',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        id: `rule_subsidy_2024_hist_${suffix}`,
        ruleCategory: 'SUBSIDY_RULE',
        workspaceScope: ruleScope,
        title: 'Legacy Rooftop Sample Subsidy Slab (Archived FY24)',
        code: 'SAMPLE_SUBSIDY_SLAB',
        versionNumber: 1,
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-12-31',
        isActive: true,
        parameters: {
          firstTierMaxKw: 2,
          firstTierRateInr: 18000,
          secondTierMaxKw: 3,
          secondTierRateInr: 9000,
          maxSubsidyCapInr: 45000,
          residentialOnly: true,
        },
        notes: 'Historical sample rule retained for auditability of older quotations.',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        id: `rule_subsidy_current_${suffix}`,
        ruleCategory: 'SUBSIDY_RULE',
        workspaceScope: ruleScope,
        title: 'Residential Rooftop Sample Subsidy Rule (INR 30k/18k Slab)',
        code: 'SAMPLE_SUBSIDY_SLAB',
        versionNumber: 2,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2028-12-31',
        isActive: true,
        parameters: {
          firstTierMaxKw: 2,
          firstTierRateInr: 30000,
          secondTierMaxKw: 3,
          secondTierRateInr: 18000,
          maxSubsidyCapInr: 78000,
          residentialOnly: true,
        },
        notes: 'Configurable sample rule from brief: INR 30,000/kW first 2 kW + INR 18,000 3rd kW, max INR 78,000. Verify live portal entitlements prior to customer issuance.',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        id: `rule_pricing_std_${suffix}`,
        ruleCategory: 'PRICING_RULE',
        workspaceScope: ruleScope,
        title: 'Vidarbha Turnkey BOS, GI Structure & Net-Metering Charges',
        code: 'VIDARBHA_STD_BOS',
        versionNumber: 1,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2028-12-31',
        isActive: true,
        parameters: {
          installationPerKwInr: 11000,
          bosFlatInr: 12000,
          selfConsumptionRatio: 1.0,
        },
        notes: 'Includes hot-dip GI structure, ACDB/DCDB, earthing pits, lightning arrestor, and MSEDCL net-meter liaison.',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        id: `rule_tariff_lt1_${suffix}`,
        ruleCategory: 'ELECTRICITY_TARIFF',
        workspaceScope: ruleScope,
        title: 'MSEDCL LT-I Residential Blended Slab Tariff',
        code: 'MSEDCL_LT1_RES',
        versionNumber: 1,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2028-12-31',
        isActive: true,
        parameters: {
          tariffPerUnitInr: 9.0,
          fixedMonthlyInr: 128,
        },
        notes: 'Blended residential tariff assumption for 150–400 unit MSEDCL domestic consumers.',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
      {
        id: `rule_tariff_lt2_${suffix}`,
        ruleCategory: 'ELECTRICITY_TARIFF',
        workspaceScope: ruleScope,
        title: 'MSEDCL LT-II Small Commercial Shop / Clinic Tariff',
        code: 'MSEDCL_LT2_COM',
        versionNumber: 1,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2028-12-31',
        isActive: true,
        parameters: {
          tariffPerUnitInr: 11.5,
          fixedMonthlyInr: 290,
        },
        notes: 'Applicable to small businesses, clinics, and offices across Nagpur & Vidarbha.',
        createdByUid: uid,
        createdAt: ts1,
        updatedAt: ts1,
      },
    ];

    for (const r of adminRules) {
      const { id, ...rest } = r;
      batch1.set(doc(db, 'admin_rules', id), rest);
    }

    for (const item of sampleLeads) {
      const score = evaluateLeadQualification({
        ownershipType: item.ownershipType,
        avgMonthlyBillInr: item.avgMonthlyBillInr,
        rooftopAreaSqFt: item.rooftopAreaSqFt,
        sanctionedLoadKw: item.sanctionedLoadKw,
        pincode: item.pincode,
        monthlyUnitsKwh: item.averageUnitsKwh,
        roofType: item.roofType,
        annualGenPerKw: 1400,
      });

      batch1.set(doc(db, 'leads', item.key), {
        leadNumber: item.leadNumber,
        ownerUid: uid,
        assignedStaffUids: staffList,
        customerName: item.customerName,
        ownershipType: item.ownershipType,
        roofType: item.roofType,
        rooftopAreaSqFt: item.rooftopAreaSqFt,
        avgMonthlyBillInr: item.avgMonthlyBillInr,
        averageUnitsKwh: item.averageUnitsKwh,
        sanctionedLoadKw: item.sanctionedLoadKw,
        pincode: item.pincode,
        city: item.city,
        qualificationCategory: score.category,
        leadScore: score.totalScore,
        recommendedCapacityKw: score.recommendedCapacityKw,
        recommendationLabel: score.recommendationLabel,
        surveyStatus: item.surveyStatus,
        leadStage: item.leadStage,
        monthKey: item.monthKey,
        isSampleSeed: true,
        createdAt: ts1,
        updatedAt: ts1,
      });
    }

    batch1.set(doc(db, 'notifications', `notif_1_${suffix}`), {
      recipientUid: uid,
      assignedStaffUids: staffList,
      channel: 'WHATSAPP_SIMULATION',
      eventType: 'PROJECT_STAGE_UPDATED',
      referenceCode: 'PRJ-NGP-30881',
      maskedRecipientPhone: '+91-98230-***81',
      title: 'Simulated WhatsApp: Installation Started (PRJ-NGP-30881)',
      message:
        '[SIMULATION] Namaskar Prashant Wankhede ji, rooftop structure & module installation for your 3 kW SuryaSetu plant has started. Track live status via your customer portal link.',
      isRead: false,
      isSimulation: true,
      createdAt: ts1,
      updatedAt: ts1,
    });

    batch1.set(doc(db, 'notifications', `notif_2_${suffix}`), {
      recipientUid: uid,
      assignedStaffUids: staffList,
      channel: 'SMS_SIMULATION',
      eventType: 'LEAD_SCORED',
      referenceCode: 'LD-30902',
      maskedRecipientPhone: '+91-98230-***02',
      title: 'Simulated SMS: Landlord NOC Advisory Scheduled (LD-30902)',
      message:
        '[SIMULATION] SuryaSetu Nagpur: Thank you Rohit Meshram for enquiry LD-30902. Our solar advisor will call for a 10-min landlord NOC & meter check.',
      isRead: false,
      isSimulation: true,
      createdAt: ts1,
      updatedAt: ts1,
    });

    try {
      await batch1.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leads');
    }
  }

  // ==========================================================================
  // Batches 2a..2c: Child PII, Bills, Extractions & Scores (2 leads / batch = 8 exists() calls)
  // ==========================================================================
  const missingChildLeads = sampleLeads.filter(
    (item) => !existingScoreIds.has(`scr_${item.key}`)
  );

  for (let idx = 0; idx < missingChildLeads.length; idx += 2) {
    const slice = missingChildLeads.slice(idx, idx + 2);
    const childBatch = writeBatch(db);
    const childTs = serverTimestamp();

      for (const item of slice) {
        const score = evaluateLeadQualification({
          ownershipType: item.ownershipType,
          avgMonthlyBillInr: item.avgMonthlyBillInr,
          rooftopAreaSqFt: item.rooftopAreaSqFt,
          sanctionedLoadKw: item.sanctionedLoadKw,
          pincode: item.pincode,
          monthlyUnitsKwh: item.averageUnitsKwh,
          roofType: item.roofType,
          annualGenPerKw: 1400,
        });

        childBatch.set(doc(db, 'lead_contacts', item.key), {
          leadId: item.key,
          ownerUid: uid,
          assignedStaffUids: staffList,
          mobileNumber: item.mobileNumber,
          email: item.email,
          dpdpConsent: true,
          retentionDays: 365,
          createdAt: childTs,
          updatedAt: childTs,
        });

        const billId = `bill_${item.key}`;
        childBatch.set(doc(db, 'electricity_bills', billId), {
          leadId: item.key,
          ownerUid: uid,
          assignedStaffUids: staffList,
          fileName: `${item.leadNumber}_Synthetic_MSEDCL_Bill.jpg`,
          mimeType: 'image/jpeg',
          fileSizeBytes: 245000,
          storageRef: item.billAsset,
          createdAt: childTs,
          updatedAt: childTs,
        });

        childBatch.set(doc(db, 'bill_extractions', `ext_${item.key}`), {
          leadId: item.key,
          billId,
          ownerUid: uid,
          assignedStaffUids: staffList,
          consumerNumber: item.consumerNumber,
          discomName: 'MSEDCL / Vidarbha Power Distribution (Synthetic Sample)',
          tariffCategory: 'LT-I Residential',
          sanctionedLoadKw: item.sanctionedLoadKw,
          monthlyUnitsKwh: item.averageUnitsKwh,
          billingAmountInr: item.avgMonthlyBillInr,
          billingPeriod: item.billingPeriod,
          confidenceScore: item.confidenceScore,
          clarityStatus: item.clarityStatus,
          verificationStatus: item.verificationStatus,
          extractionNotes:
            item.clarityStatus === 'LOW_CONFIDENCE'
              ? 'Slightly angled bill photo; please manually verify meter load before finalising quotation.'
              : 'Synthetic sample electricity bill verified cleanly.',
          verifiedByUid: item.verificationStatus === 'PENDING_VERIFICATION' ? '' : uid,
          createdAt: childTs,
          updatedAt: childTs,
        });

        childBatch.set(doc(db, 'lead_scores', `scr_${item.key}`), {
          leadId: item.key,
          ownerUid: uid,
          assignedStaffUids: staffList,
          totalScore: score.totalScore,
          category: score.category,
          recommendedCapacityKw: score.recommendedCapacityKw,
          recommendationLabel: score.recommendationLabel,
          ownershipPoints: score.ownershipPoints,
          billPoints: score.billPoints,
          roofAreaPoints: score.roofAreaPoints,
          loadPoints: score.loadPoints,
          pincodePoints: score.pincodePoints,
          consumptionPoints: score.consumptionPoints,
          recommendationReason: score.recommendationReason,
          nextRecommendedAction: score.nextRecommendedAction,
          isOverridden: false,
          overrideReason: '',
          overriddenByUid: '',
          createdAt: childTs,
          updatedAt: childTs,
        });
      }

    try {
      await childBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'lead_scores');
    }
  }

  // ==========================================================================
  // Batch 3: Quotations (4 docs -> <= 8 DB reads since parent leads exist)
  // ==========================================================================
  const subsidyParams = {
    firstTierMaxKw: 2,
    firstTierRateInr: 30000,
    secondTierMaxKw: 3,
    secondTierRateInr: 18000,
    maxSubsidyCapInr: 78000,
    residentialOnly: true,
  };

  const q1Calc = calculateSolarQuotation({
    systemCapacityKw: 3,
    ownershipType: 'OWNER',
    isResidentialTariff: true,
    panelPricePerKwInr: 43000,
    annualGenPerKw: 1400,
    installationPerKwInr: 11000,
    bosAndNetMeteringFlatInr: 12000,
    electricityTariffInr: 9.0,
    subsidyRule: subsidyParams,
  });

  const q2Calc = calculateSolarQuotation({
    systemCapacityKw: 2,
    ownershipType: 'OWNER',
    isResidentialTariff: true,
    panelPricePerKwInr: 43000,
    annualGenPerKw: 1400,
    installationPerKwInr: 11000,
    bosAndNetMeteringFlatInr: 12000,
    electricityTariffInr: 9.0,
    subsidyRule: subsidyParams,
  });

  const q3Calc = calculateSolarQuotation({
    systemCapacityKw: 4,
    ownershipType: 'OWNER',
    isResidentialTariff: true,
    panelPricePerKwInr: 47500,
    annualGenPerKw: 1400,
    installationPerKwInr: 11000,
    bosAndNetMeteringFlatInr: 12000,
    electricityTariffInr: 9.0,
    subsidyRule: subsidyParams,
  });

  const q1Id = `qt_30881_${suffix}`;
  const q2Id = `qt_30944_${suffix}`;
  const q3Id = `qt_30928_${suffix}`;
  const q4Id = `qt_30961_${suffix}`;

  let hasExistingQuotes = false;
  try {
    const qSnap = await getDocs(
      isGlobalAdmin
        ? query(collection(db, 'quotations'), where('quotationNumber', '==', 'QT-2026-30881'))
        : query(collection(db, 'quotations'), where('assignedStaffUids', 'array-contains', uid))
    );
    hasExistingQuotes = !qSnap.empty;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'quotations');
  }

  if (!hasExistingQuotes) {
    const quotesBatch = writeBatch(db);
    const qTs = serverTimestamp();

    const ruleSnapshot = {
      subsidyRuleTitle: 'Residential Rooftop Sample Subsidy Rule (INR 30k/18k Slab)',
      subsidyRuleVersion: 2,
      subsidyEffectiveFrom: '2025-01-01',
      subsidyEffectiveTo: '2028-12-31',
      annualGenPerKw: 1400,
      tariffPerUnitInr: 9.0,
    };

    quotesBatch.set(doc(db, 'quotations', q1Id), {
      quotationNumber: 'QT-2026-30881',
      leadId: `ld_30881_${suffix}`,
      ownerUid: uid,
      assignedStaffUids: staffList,
      customerName: 'Prashant Wankhede',
      city: 'Nagpur',
      pincode: '440010',
      ownershipType: 'OWNER',
      systemCapacityKw: 3,
      panelTypeLabel: 'Waaree / Tata 545Wp Mono PERC Half-Cut Package',
      annualGenerationUnits: q1Calc.annualGenerationUnits,
      equipmentCostInr: q1Calc.equipmentCostInr,
      installationChargesInr: q1Calc.installationChargesInr,
      totalInstallationCostInr: q1Calc.totalInstallationCostInr,
      applicableSubsidyInr: q1Calc.applicableSubsidyInr,
      netCustomerCostInr: q1Calc.netCustomerCostInr,
      electricityTariffInr: 9.0,
      selfConsumptionUnits: q1Calc.selfConsumptionUnits,
      estimatedAnnualSavingsInr: q1Calc.estimatedAnnualSavingsInr,
      estimatedPaybackYears: q1Calc.estimatedPaybackYears,
      quotationDate: '2026-10-12',
      validUntilDate: '2026-11-26',
      appliedRuleSnapshot: ruleSnapshot,
      status: 'CONVERTED',
      createdByUid: uid,
      createdAt: qTs,
      updatedAt: qTs,
    });

    quotesBatch.set(doc(db, 'quotations', q2Id), {
      quotationNumber: 'QT-2026-30944',
      leadId: `ld_30944_${suffix}`,
      ownerUid: uid,
      assignedStaffUids: staffList,
      customerName: 'Sunita Ingole',
      city: 'Amravati / Akola',
      pincode: '444601',
      ownershipType: 'OWNER',
      systemCapacityKw: 2,
      panelTypeLabel: 'Waaree / Tata 545Wp Mono PERC Half-Cut Package',
      annualGenerationUnits: q2Calc.annualGenerationUnits,
      equipmentCostInr: q2Calc.equipmentCostInr,
      installationChargesInr: q2Calc.installationChargesInr,
      totalInstallationCostInr: q2Calc.totalInstallationCostInr,
      applicableSubsidyInr: q2Calc.applicableSubsidyInr,
      netCustomerCostInr: q2Calc.netCustomerCostInr,
      electricityTariffInr: 9.0,
      selfConsumptionUnits: q2Calc.selfConsumptionUnits,
      estimatedAnnualSavingsInr: q2Calc.estimatedAnnualSavingsInr,
      estimatedPaybackYears: q2Calc.estimatedPaybackYears,
      quotationDate: '2026-10-28',
      validUntilDate: '2026-11-28',
      appliedRuleSnapshot: ruleSnapshot,
      status: 'ISSUED',
      createdByUid: uid,
      createdAt: qTs,
      updatedAt: qTs,
    });

    quotesBatch.set(doc(db, 'quotations', q3Id), {
      quotationNumber: 'QT-2026-30928',
      leadId: `ld_30928_${suffix}`,
      ownerUid: uid,
      assignedStaffUids: staffList,
      customerName: 'Vikramaditya Deshmukh',
      city: 'Wardha / Chandrapur',
      pincode: '442001',
      ownershipType: 'OWNER',
      systemCapacityKw: 4,
      panelTypeLabel: 'Adani / Premier 580Wp N-Type TOPCon Bifacial Package',
      annualGenerationUnits: q3Calc.annualGenerationUnits,
      equipmentCostInr: q3Calc.equipmentCostInr,
      installationChargesInr: q3Calc.installationChargesInr,
      totalInstallationCostInr: q3Calc.totalInstallationCostInr,
      applicableSubsidyInr: q3Calc.applicableSubsidyInr,
      netCustomerCostInr: q3Calc.netCustomerCostInr,
      electricityTariffInr: 9.0,
      selfConsumptionUnits: q3Calc.selfConsumptionUnits,
      estimatedAnnualSavingsInr: q3Calc.estimatedAnnualSavingsInr,
      estimatedPaybackYears: q3Calc.estimatedPaybackYears,
      quotationDate: '2026-08-18',
      validUntilDate: '2026-09-18',
      appliedRuleSnapshot: ruleSnapshot,
      status: 'CONVERTED',
      createdByUid: uid,
      createdAt: qTs,
      updatedAt: qTs,
    });

    quotesBatch.set(doc(db, 'quotations', q4Id), {
      quotationNumber: 'QT-2026-30961',
      leadId: `ld_30961_${suffix}`,
      ownerUid: uid,
      assignedStaffUids: staffList,
      customerName: 'Nilesh Bawankule',
      city: 'Kamptee / Hingna',
      pincode: '441110',
      ownershipType: 'OWNER',
      systemCapacityKw: 3,
      panelTypeLabel: 'Waaree / Tata 545Wp Mono PERC Half-Cut Package',
      annualGenerationUnits: q1Calc.annualGenerationUnits,
      equipmentCostInr: q1Calc.equipmentCostInr,
      installationChargesInr: q1Calc.installationChargesInr,
      totalInstallationCostInr: q1Calc.totalInstallationCostInr,
      applicableSubsidyInr: q1Calc.applicableSubsidyInr,
      netCustomerCostInr: q1Calc.netCustomerCostInr,
      electricityTariffInr: 9.0,
      selfConsumptionUnits: q1Calc.selfConsumptionUnits,
      estimatedAnnualSavingsInr: q1Calc.estimatedAnnualSavingsInr,
      estimatedPaybackYears: q1Calc.estimatedPaybackYears,
      quotationDate: '2026-09-25',
      validUntilDate: '2026-10-25',
      appliedRuleSnapshot: ruleSnapshot,
      status: 'CONVERTED',
      createdByUid: uid,
      createdAt: qTs,
      updatedAt: qTs,
    });

    try {
      await quotesBatch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'quotations');
    }
  }

  // ==========================================================================
  // Batch 4a: Project 1 (Active Stage 5 + Public Tracking + Subcollections)
  // ==========================================================================
  const p1Id = `prj_30881_${suffix}`;
  const tok1 = `trk_ngp30881_${suffix}_a91c4e82f701`;

  if (!existingProjectIds.has(p1Id)) {
    const p1Batch = writeBatch(db);
    const p1Ts = serverTimestamp();

    p1Batch.set(doc(db, 'projects', p1Id), {
      projectNumber: 'PRJ-NGP-30881',
      quotationId: q1Id,
      leadId: `ld_30881_${suffix}`,
      ownerUid: uid,
      assignedStaffUids: staffList,
      customerName: 'Prashant Wankhede',
      city: 'Nagpur',
      pincode: '440010',
      systemCapacityKw: 3,
      netCustomerCostInr: q1Calc.netCustomerCostInr,
      applicableSubsidyInr: q1Calc.applicableSubsidyInr,
      currentStage: 'INSTALLATION_IN_PROGRESS',
      stageIndex: 5,
      pendingActivities: 'Complete DC string conduit termination & inverter earthing check by Friday.',
      isDelayed: false,
      delayReason: '',
      trackingToken: tok1,
      stageStartedAt: '2026-11-01T09:00:00Z',
      completionMonthKey: '',
      createdAt: p1Ts,
      updatedAt: p1Ts,
    });

    p1Batch.set(doc(db, 'public_tracking', tok1), {
      trackingToken: tok1,
      projectId: p1Id,
      projectNumber: 'PRJ-NGP-30881',
      customerMask: 'Prashant W.',
      city: 'Nagpur',
      systemCapacityKw: 3,
      currentStage: 'INSTALLATION_IN_PROGRESS',
      stageIndex: 5,
      completedStageIndices: [1, 2, 3, 4],
      pendingActivities: 'Mounting structure erected; module string wiring and inverter commissioning scheduled.',
      isDelayed: false,
      delaySummary: '',
      ownerUid: uid,
      assignedStaffUids: staffList,
      createdAt: p1Ts,
      updatedAt: p1Ts,
    });

    p1Batch.set(doc(db, 'projects', p1Id, 'payments', `pay_1_${suffix}`), {
      projectId: p1Id,
      ownerUid: uid,
      assignedStaffUids: staffList,
      paymentReference: 'SIM-UPI-881029',
      milestone: 'ADVANCE_BOOKING',
      amountInr: 25000,
      paymentMode: 'SIMULATED_UPI',
      isSimulation: true,
      recordedByUid: uid,
      createdAt: p1Ts,
    });

    p1Batch.set(doc(db, 'projects', p1Id, 'documents', `doc_1_${suffix}`), {
      projectId: p1Id,
      ownerUid: uid,
      assignedStaffUids: staffList,
      docTitle: 'Shankar Nagar RCC Shadow & Structure Survey',
      docType: 'SITE_SURVEY_REPORT',
      fileName: 'Survey_LD30881_ShankarNagar.pdf',
      fileSizeKb: 840,
      uploadedByUid: uid,
      notes: 'Zero southern obstruction; 450 sq ft clear RCC terrace.',
      createdAt: p1Ts,
    });

    p1Batch.set(doc(db, 'projects', p1Id, 'history', `hist_1_${suffix}`), {
      projectId: p1Id,
      ownerUid: uid,
      assignedStaffUids: staffList,
      fromStage: 'INSTALLATION_SCHEDULED',
      toStage: 'INSTALLATION_IN_PROGRESS',
      stageIndex: 5,
      remarks: 'Galvanized mounting frames anchored; 6 x 545Wp modules hoisted to terrace.',
      updatedByUid: uid,
      updatedByName: 'Nagpur Operations Desk',
      createdAt: p1Ts,
    });

    try {
      await p1Batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `projects/${p1Id}`);
    }
  }

  // ==========================================================================
  // Batch 4b: Project 2 (Delayed Stage 7) + Project 3 (Completed Stage 10) [6 DB reads]
  // ==========================================================================
  const p2Id = `prj_30961_${suffix}`;
  const tok2 = `trk_kmp30961_${suffix}_d47b9201c883`;
  const p3Id = `prj_30928_${suffix}`;
  const tok3 = `trk_wrd30928_${suffix}_e12f6630a554`;

  const needP2 = !existingProjectIds.has(p2Id);
  const needP3 = !existingProjectIds.has(p3Id);

  if (needP2 || needP3) {
    const p23Batch = writeBatch(db);
    const p23Ts = serverTimestamp();

    if (needP2) {
      p23Batch.set(doc(db, 'projects', p2Id), {
        projectNumber: 'PRJ-KMP-30961',
        quotationId: q4Id,
        leadId: `ld_30961_${suffix}`,
        ownerUid: uid,
        assignedStaffUids: staffList,
        customerName: 'Nilesh Bawankule',
        city: 'Kamptee / Hingna',
        pincode: '441110',
        systemCapacityKw: 3,
        netCustomerCostInr: q1Calc.netCustomerCostInr,
        applicableSubsidyInr: q1Calc.applicableSubsidyInr,
        currentStage: 'NET_METERING_DISCOM',
        stageIndex: 7,
        pendingActivities: 'Follow up with Hingna Sub-Division Junior Engineer for bi-directional meter testing slot.',
        isDelayed: true,
        delayReason: 'Stuck 16 days awaiting MSEDCL bi-directional meter stock & name-spelling correction on consumer bill.',
        trackingToken: tok2,
        stageStartedAt: '2026-10-16T10:00:00Z',
        completionMonthKey: '',
        createdAt: p23Ts,
        updatedAt: p23Ts,
      });

      p23Batch.set(doc(db, 'public_tracking', tok2), {
        trackingToken: tok2,
        projectId: p2Id,
        projectNumber: 'PRJ-KMP-30961',
        customerMask: 'Nilesh B.',
        city: 'Kamptee / Hingna',
        systemCapacityKw: 3,
        currentStage: 'NET_METERING_DISCOM',
        stageIndex: 7,
        completedStageIndices: [1, 2, 3, 4, 5, 6],
        pendingActivities: 'DISCOM net-meter inspection scheduled with Hingna sub-division.',
        isDelayed: true,
        delaySummary: 'Awaiting DISCOM bi-directional meter testing slot.',
        ownerUid: uid,
        assignedStaffUids: staffList,
        createdAt: p23Ts,
        updatedAt: p23Ts,
      });
    }

    if (needP3) {
      p23Batch.set(doc(db, 'projects', p3Id), {
        projectNumber: 'PRJ-WRD-30928',
        quotationId: q3Id,
        leadId: `ld_30928_${suffix}`,
        ownerUid: uid,
        assignedStaffUids: staffList,
        customerName: 'Vikramaditya Deshmukh',
        city: 'Wardha / Chandrapur',
        pincode: '442001',
        systemCapacityKw: 4,
        netCustomerCostInr: q3Calc.netCustomerCostInr,
        applicableSubsidyInr: q3Calc.applicableSubsidyInr,
        currentStage: 'PROJECT_COMPLETED',
        stageIndex: 10,
        pendingActivities: 'All milestones completed. Monitoring app handed over.',
        isDelayed: false,
        delayReason: '',
        trackingToken: tok3,
        stageStartedAt: '2026-10-20T15:30:00Z',
        completionMonthKey: '2026-10',
        createdAt: p23Ts,
        updatedAt: p23Ts,
      });

      p23Batch.set(doc(db, 'public_tracking', tok3), {
        trackingToken: tok3,
        projectId: p3Id,
        projectNumber: 'PRJ-WRD-30928',
        customerMask: 'Vikramaditya D.',
        city: 'Wardha / Chandrapur',
        systemCapacityKw: 4,
        currentStage: 'PROJECT_COMPLETED',
        stageIndex: 10,
        completedStageIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        pendingActivities: 'Plant commissioned and subsidy credited.',
        isDelayed: false,
        delaySummary: '',
        ownerUid: uid,
        assignedStaffUids: staffList,
        createdAt: p23Ts,
        updatedAt: p23Ts,
      });
    }

    try {
      await p23Batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'projects');
    }
  }

  return true;
}
