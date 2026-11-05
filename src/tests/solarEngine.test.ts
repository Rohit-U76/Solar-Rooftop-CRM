import { describe, expect, it } from 'vitest';
import {
  buildMultiOptionComparison,
  calculateApplicableSubsidy,
  calculateSolarQuotation,
  checkAdminAccess,
  checkBackendAccess,
  classifyBillExtractionClarity,
  evaluateLeadQualification,
  evaluateProjectDelay,
  maskConsumerNumber,
  maskMobileNumber,
  MAX_BILL_FILE_BYTES,
  selectEffectiveRule,
  validateExtractionConfirmation,
  validateLeadSubmission,
  validateProjectStageTransition,
  type SubsidyRuleParams,
} from '../shared/solarEngine.ts';
import {
  validateDocumentMagicBytes,
  validateImageMagicBytes,
} from '../server/geminiService.ts';

const SAMPLE_SUBSIDY_RULE: SubsidyRuleParams = {
  firstTierMaxKw: 2,
  firstTierRateInr: 30000,
  secondTierMaxKw: 3,
  secondTierRateInr: 18000,
  maxSubsidyCapInr: 78000,
  residentialOnly: true,
};

describe('SuryaSetu Deterministic Solar Engine & Business Rules', () => {
  // 1. Lead Form Validation
  describe('1. Lead Form & Bill File Validation', () => {
    it('accepts a valid Nagpur homeowner solar enquiry', () => {
      const res = validateLeadSubmission({
        customerName: 'Prashant Wankhede',
        mobileNumber: '9823011223',
        email: 'prashant@example.com',
        ownershipType: 'OWNER',
        roofType: 'RCC',
        rooftopAreaSqFt: 450,
        avgMonthlyBillInr: 3200,
        pincode: '440022',
        dpdpConsent: true,
        fileMimeType: 'image/jpeg',
        fileSizeBytes: 850_000,
      });
      expect(res.valid).toBe(true);
      expect(Object.keys(res.errors)).toHaveLength(0);
    });

    it('rejects invalid mobile numbers, invalid pincodes, unsupported image formats, and oversized files', () => {
      const bad = validateLeadSubmission({
        customerName: 'A',
        mobileNumber: '12345',
        email: 'not-an-email',
        ownershipType: 'OWNER',
        roofType: 'RCC',
        rooftopAreaSqFt: 20,
        avgMonthlyBillInr: 50,
        pincode: '4400',
        dpdpConsent: false,
        fileMimeType: 'application/pdf',
        fileSizeBytes: MAX_BILL_FILE_BYTES + 1024,
      });
      expect(bad.valid).toBe(false);
      expect(bad.errors.customerName).toBeDefined();
      expect(bad.errors.mobileNumber).toBeDefined();
      expect(bad.errors.email).toBeDefined();
      expect(bad.errors.rooftopAreaSqFt).toBeDefined();
      expect(bad.errors.avgMonthlyBillInr).toBeDefined();
      expect(bad.errors.pincode).toBeDefined();
      expect(bad.errors.dpdpConsent).toBeDefined();
      expect(bad.errors.billImage).toBeDefined();
    });
  });

  // 2. Electricity Bill Extraction Confirmation Validation & Blurry Image Detection
  describe('2. Bill Extraction Verification & Blurry/Unreadable Image Detection', () => {
    it('never silently accepts missing or zeroed extracted bill fields', () => {
      const incomplete = validateExtractionConfirmation({
        consumerNumber: '',
        discomName: 'MSEDCL',
        tariffCategory: 'LT-I Residential',
        sanctionedLoadKw: 0,
        monthlyUnitsKwh: 0,
        billingAmountInr: 3200,
        billingPeriod: 'Jan 2025',
        confidenceScore: 42,
      });
      expect(incomplete.valid).toBe(false);
      expect(incomplete.errors.consumerNumber).toBeDefined();
      expect(incomplete.errors.sanctionedLoadKw).toBeDefined();
      expect(incomplete.errors.monthlyUnitsKwh).toBeDefined();
    });

    it('accepts complete human-verified MSEDCL bill details', () => {
      const ok = validateExtractionConfirmation({
        consumerNumber: '410018293401',
        discomName: 'MSEDCL Mahavitaran',
        tariffCategory: 'LT-I Residential',
        sanctionedLoadKw: 4,
        monthlyUnitsKwh: 340,
        billingAmountInr: 3200,
        billingPeriod: 'Jan 2025',
        confidenceScore: 94,
      });
      expect(ok.valid).toBe(true);
    });

    it('detects blurry or unreadable electricity bills and requests re-upload', () => {
      const blurry = classifyBillExtractionClarity({
        confidenceScore: 22,
        monthlyUnitsKwh: 0,
        billingAmountInr: 0,
        reportedClarity: 'UNCLEAR_REUPLOAD',
      });
      expect(blurry.clarityStatus).toBe('UNCLEAR_REUPLOAD');
      expect(blurry.requiresReupload).toBe(true);

      const zeroFields = classifyBillExtractionClarity({
        confidenceScore: 60,
        monthlyUnitsKwh: 0,
        billingAmountInr: 0,
        reportedClarity: 'CLEAR',
      });
      expect(zeroFields.clarityStatus).toBe('UNCLEAR_REUPLOAD');
      expect(zeroFields.requiresReupload).toBe(true);

      const moderate = classifyBillExtractionClarity({
        confidenceScore: 62,
        monthlyUnitsKwh: 290,
        billingAmountInr: 2800,
        reportedClarity: 'LOW_CONFIDENCE',
      });
      expect(moderate.clarityStatus).toBe('LOW_CONFIDENCE');
      expect(moderate.requiresReupload).toBe(false);

      const clear = classifyBillExtractionClarity({
        confidenceScore: 93,
        monthlyUnitsKwh: 340,
        billingAmountInr: 3200,
        reportedClarity: 'CLEAR',
      });
      expect(clear.clarityStatus).toBe('CLEAR');
      expect(clear.requiresReupload).toBe(false);
    });
  });

  // 3 & 4. Lead Scoring & Solar Capacity Recommendation (Exact Sample Cohort + Roof Type)
  describe('3 & 4. Lead Qualification & Solar Sizing (LD-30881, LD-30902, LD-30915 + Roof Type)', () => {
    it('scores LD-30881 (Prashant Wankhede, Owner, RCC, ₹3,200, 340 units) as HIGH with 3 kW recommended', () => {
      const out = evaluateLeadQualification({
        ownershipType: 'OWNER',
        avgMonthlyBillInr: 3200,
        rooftopAreaSqFt: 450,
        sanctionedLoadKw: 4,
        pincode: '440022',
        monthlyUnitsKwh: 340,
        roofType: 'RCC',
      });
      expect(out.category).toBe('HIGH');
      expect(out.totalScore).toBeGreaterThanOrEqual(75);
      expect(out.recommendedCapacityKw).toBe(3);
      expect(out.recommendationLabel).toBe('3 kW');
      expect(out.suggestedSurveyStatus).toBe('SURVEY_SCHEDULED');
    });

    it('scores LD-30902 (Rohit Meshram, Tenant, ₹1,900, 210 units) as LOW & "Not yet recommended" with phone call instead of rejection', () => {
      const out = evaluateLeadQualification({
        ownershipType: 'TENANT',
        avgMonthlyBillInr: 1900,
        rooftopAreaSqFt: 300,
        sanctionedLoadKw: 2,
        pincode: '440012',
        monthlyUnitsKwh: 210,
        roofType: 'RCC',
      });
      expect(out.category).toBe('LOW');
      expect(out.recommendedCapacityKw).toBe(0);
      expect(out.recommendationLabel).toBe('Not yet recommended');
      expect(out.suggestedSurveyStatus).toBe('HOLD_TENANT_CONSENT');
      expect(out.nextRecommendedAction.toLowerCase()).toContain('call');
    });

    it('scores LD-30915 (Ayesha Siddiqui, Owner, ₹650, 85 units) as LOW with 1 kW starter recommendation & phone qualification call', () => {
      const out = evaluateLeadQualification({
        ownershipType: 'OWNER',
        avgMonthlyBillInr: 650,
        rooftopAreaSqFt: 250,
        sanctionedLoadKw: 1,
        pincode: '440013',
        monthlyUnitsKwh: 85,
        roofType: 'RCC',
      });
      expect(out.category).toBe('LOW');
      expect(out.recommendedCapacityKw).toBe(1);
      expect(out.recommendationLabel).toBe('1 kW');
      expect(out.suggestedSurveyStatus).toBe('CALL_SCHEDULED');
      expect(out.nextRecommendedAction.toLowerCase()).toContain('call');
    });

    it('evaluates roofType (RCC vs METAL_SHEET vs TILED) in roofAreaPoints and mounting notes', () => {
      const rcc = evaluateLeadQualification({
        ownershipType: 'OWNER',
        avgMonthlyBillInr: 2600,
        rooftopAreaSqFt: 320,
        sanctionedLoadKw: 3,
        pincode: '440015',
        monthlyUnitsKwh: 280,
        roofType: 'RCC',
      });
      const metal = evaluateLeadQualification({
        ownershipType: 'OWNER',
        avgMonthlyBillInr: 2600,
        rooftopAreaSqFt: 320,
        sanctionedLoadKw: 3,
        pincode: '440015',
        monthlyUnitsKwh: 280,
        roofType: 'METAL_SHEET',
      });
      const tiled = evaluateLeadQualification({
        ownershipType: 'OWNER',
        avgMonthlyBillInr: 2600,
        rooftopAreaSqFt: 320,
        sanctionedLoadKw: 3,
        pincode: '440015',
        monthlyUnitsKwh: 280,
        roofType: 'TILED',
      });

      expect(rcc.roofAreaPoints).toBeGreaterThan(metal.roofAreaPoints);
      expect(metal.roofAreaPoints).toBeGreaterThan(tiled.roofAreaPoints);
      expect(rcc.roofAreaPoints).toBeLessThanOrEqual(25);
      expect(tiled.recommendationReason.toLowerCase()).toContain('tiled');
    });

    it('caps recommended solar capacity when shadow-free roof area is limited', () => {
      const constrained = evaluateLeadQualification({
        ownershipType: 'OWNER',
        avgMonthlyBillInr: 6500,
        rooftopAreaSqFt: 210, // Supports max 2 kW (~100 sq ft/kW)
        sanctionedLoadKw: 5,
        pincode: '440010',
        monthlyUnitsKwh: 680,
      });
      expect(constrained.recommendedCapacityKw).toBe(2);
    });
  });

  // 5. Subsidy Calculation
  describe('5. Configurable Sample Subsidy Slab Calculation', () => {
    it('calculates ₹30,000 for 1 kW, ₹60,000 for 2 kW, ₹78,000 for 3 kW, and caps 5 kW at ₹78,000', () => {
      expect(calculateApplicableSubsidy(1, 'OWNER', true, SAMPLE_SUBSIDY_RULE)).toBe(30000);
      expect(calculateApplicableSubsidy(2, 'OWNER', true, SAMPLE_SUBSIDY_RULE)).toBe(60000);
      expect(calculateApplicableSubsidy(3, 'OWNER', true, SAMPLE_SUBSIDY_RULE)).toBe(78000);
      expect(calculateApplicableSubsidy(5, 'OWNER', true, SAMPLE_SUBSIDY_RULE)).toBe(78000);
    });

    it('returns ₹0 subsidy for tenants or non-residential commercial connections when residentialOnly is true', () => {
      expect(calculateApplicableSubsidy(3, 'TENANT', true, SAMPLE_SUBSIDY_RULE)).toBe(0);
      expect(calculateApplicableSubsidy(3, 'OWNER', false, SAMPLE_SUBSIDY_RULE)).toBe(0);

      // When admin configures residentialOnly = false, commercial property owners qualify
      const broaderRule: SubsidyRuleParams = { ...SAMPLE_SUBSIDY_RULE, residentialOnly: false };
      expect(calculateApplicableSubsidy(3, 'OWNER', false, broaderRule)).toBe(78000);
    });
  });

  // 6. Effective-Date Rule Selection
  describe('6. Effective-Date Configuration Rule Selection', () => {
    const sampleRules = [
      {
        code: 'RES_SAMPLE_SLAB',
        versionNumber: 1,
        effectiveFrom: '2024-01-01',
        effectiveTo: '2024-12-31',
        isActive: true,
        maxCap: 72000,
      },
      {
        code: 'RES_SAMPLE_SLAB',
        versionNumber: 2,
        effectiveFrom: '2025-01-01',
        effectiveTo: '2027-12-31',
        isActive: true,
        maxCap: 78000,
      },
    ];

    it('selects historical v1 rule for 2024 quotation dates and v2 rule for 2025+ dates', () => {
      const r2024 = selectEffectiveRule(sampleRules, '2024-08-15', 'RES_SAMPLE_SLAB');
      expect(r2024.versionNumber).toBe(1);
      expect(r2024.maxCap).toBe(72000);

      const r2025 = selectEffectiveRule(sampleRules, '2025-03-10', 'RES_SAMPLE_SLAB');
      expect(r2025.versionNumber).toBe(2);
      expect(r2025.maxCap).toBe(78000);
    });

    it('throws a clear error when quotation date falls outside active rule effective windows', () => {
      expect(() => selectEffectiveRule(sampleRules, '2023-05-01', 'RES_SAMPLE_SLAB')).toThrow(
        /No active configuration rule found/
      );
    });
  });

  // 7, 8 & 9. Annual Generation, Multi-Option Matrix, Net Cost, Payback & Snapshot Immutability
  describe('7, 8 & 9. Deterministic Quotation Math, Multi-Option Comparison & Snapshot Immutability', () => {
    it('computes Yearly Generation = Capacity × 1,400 (or admin-configured units/kW), Net Cost, Annual Savings, and Payback accurately', () => {
      const qDefault = calculateSolarQuotation({
        systemCapacityKw: 3,
        ownershipType: 'OWNER',
        isResidentialTariff: true,
        panelPricePerKwInr: 45000, // 1,35,000
        annualGenPerKw: 1400,
        installationPerKwInr: 10000, // 30,000
        bosAndNetMeteringFlatInr: 13000, // +13,000 => installationCharges = 43,000; gross = 1,78,000
        electricityTariffInr: 9.5,
        subsidyRule: SAMPLE_SUBSIDY_RULE, // 78,000
      });

      expect(qDefault.annualGenerationUnits).toBe(4200); // 3 * 1400
      expect(qDefault.totalInstallationCostInr).toBe(178000);
      expect(qDefault.applicableSubsidyInr).toBe(78000);
      expect(qDefault.netCustomerCostInr).toBe(100000); // 178000 - 78000
      expect(qDefault.estimatedAnnualSavingsInr).toBe(39900); // 4200 * 9.5
      expect(qDefault.estimatedPaybackYears).toBe(2.5); // 100000 / 39900 = 2.506 -> 2.5

      // Administrator configures high-efficiency bifacial benchmark (1,500 units/kW/year)
      const qAdminConfigured = calculateSolarQuotation({
        systemCapacityKw: 3,
        ownershipType: 'OWNER',
        isResidentialTariff: true,
        panelPricePerKwInr: 45000,
        annualGenPerKw: 1500,
        installationPerKwInr: 10000,
        bosAndNetMeteringFlatInr: 13000,
        electricityTariffInr: 9.5,
        subsidyRule: SAMPLE_SUBSIDY_RULE,
      });
      expect(qAdminConfigured.annualGenerationUnits).toBe(4500);
      expect(qAdminConfigured.estimatedAnnualSavingsInr).toBe(42750);
    });

    it('builds 1 kW, 2 kW, 3 kW, and Suitable Alternative comparison options deterministically', () => {
      const options = buildMultiOptionComparison(
        {
          systemCapacityKw: 3,
          ownershipType: 'OWNER',
          isResidentialTariff: true,
          panelPricePerKwInr: 50000,
          annualGenPerKw: 1400,
          installationPerKwInr: 8000,
          bosAndNetMeteringFlatInr: 12000,
          electricityTariffInr: 9.0,
          subsidyRule: SAMPLE_SUBSIDY_RULE,
        },
        3
      );

      expect(options).toHaveLength(4);
      expect(options.map((o) => o.systemCapacityKw)).toEqual([1, 2, 3, 5]);
      expect(options.map((o) => o.annualGenerationUnits)).toEqual([1400, 2800, 4200, 7000]);
      expect(options.map((o) => o.applicableSubsidyInr)).toEqual([30000, 60000, 78000, 78000]);
      expect(options[2].isRecommended).toBe(true);
      expect(options[2].isSelected).toBe(true);
    });

    it('preserves historical quotation snapshot values when future admin rule versions change', () => {
      const initialQuote = calculateSolarQuotation({
        systemCapacityKw: 3,
        ownershipType: 'OWNER',
        isResidentialTariff: true,
        panelPricePerKwInr: 45000,
        annualGenPerKw: 1400,
        installationPerKwInr: 10000,
        bosAndNetMeteringFlatInr: 13000,
        electricityTariffInr: 9.0,
        subsidyRule: SAMPLE_SUBSIDY_RULE,
      });

      const savedSnapshot = Object.freeze({
        subsidyRuleVersion: 1,
        netCustomerCostInr: initialQuote.netCustomerCostInr,
        applicableSubsidyInr: initialQuote.applicableSubsidyInr,
      });

      const futureSubsidyRule: SubsidyRuleParams = {
        ...SAMPLE_SUBSIDY_RULE,
        maxSubsidyCapInr: 50000,
      };
      const futureQuote = calculateSolarQuotation({
        systemCapacityKw: 3,
        ownershipType: 'OWNER',
        isResidentialTariff: true,
        panelPricePerKwInr: 48000,
        annualGenPerKw: 1400,
        installationPerKwInr: 10000,
        bosAndNetMeteringFlatInr: 13000,
        electricityTariffInr: 9.0,
        subsidyRule: futureSubsidyRule,
      });

      expect(savedSnapshot.applicableSubsidyInr).toBe(78000);
      expect(futureQuote.applicableSubsidyInr).toBe(50000);
      expect(savedSnapshot.netCustomerCostInr).not.toBe(futureQuote.netCustomerCostInr);
    });
  });

  // 10. Project Status Transitions & Delay SLA Detection
  describe('10. 10-Stage Project Lifecycle Transitions & SLA Delay Check', () => {
    it('allows sequential forward transitions across Advance Payment, Installation, DISCOM & Subsidy Credited', () => {
      const step2 = validateProjectStageTransition(
        'QUOTATION_APPROVED',
        'ADVANCE_PAYMENT_RECEIVED',
        false
      );
      expect(step2.valid).toBe(true);
      expect(step2.nextIndex).toBe(2);

      const discomStep = validateProjectStageTransition(
        'INSTALLATION_COMPLETED',
        'NET_METERING_DISCOM',
        false
      );
      expect(discomStep.valid).toBe(true);

      const subsidyStep = validateProjectStageTransition(
        'SUBSIDY_SUBMITTED',
        'SUBSIDY_CREDITED',
        false
      );
      expect(subsidyStep.valid).toBe(true);

      const skipped = validateProjectStageTransition(
        'QUOTATION_APPROVED',
        'INSTALLATION_COMPLETED',
        false
      );
      expect(skipped.valid).toBe(false);
    });

    it('locks completed projects from further non-admin transitions and flags overdue SLA stages', () => {
      const locked = validateProjectStageTransition(
        'PROJECT_COMPLETED',
        'SUBSIDY_CREDITED',
        false
      );
      expect(locked.valid).toBe(false);

      const delayedCheck = evaluateProjectDelay(
        'NET_METERING_DISCOM',
        '2025-01-01T00:00:00.000Z',
        new Date('2025-01-20T00:00:00.000Z')
      );
      expect(delayedCheck.isDelayed).toBe(true);
      expect(delayedCheck.daysInStage).toBe(19);
    });
  });

  // 11. Role-Based Access Control, PII Masking & File Signature Security
  describe('11. Backend RBAC, Admin Governance, PII Masking & Magic-Byte Validation', () => {
    it('denies unauthenticated or unverified requests and restricts staff-only & admin-only endpoints', () => {
      expect(checkBackendAccess({ requesterUid: '' }).allowed).toBe(false);
      expect(
        checkBackendAccess({
          requesterUid: 'u1',
          emailVerified: false,
          requesterRole: 'HOMEOWNER',
        }).allowed
      ).toBe(false);

      // Homeowner cannot invoke staff-only quotation calculation
      expect(
        checkBackendAccess({
          requesterUid: 'homeowner_1',
          emailVerified: true,
          requesterRole: 'HOMEOWNER',
          requireStaff: true,
        }).allowed
      ).toBe(false);

      // Homeowner cannot read another homeowner's resource
      expect(
        checkBackendAccess({
          requesterUid: 'homeowner_1',
          emailVerified: true,
          requesterRole: 'HOMEOWNER',
          resourceOwnerUid: 'homeowner_2',
        }).allowed
      ).toBe(false);

      // Standard Sales Staff cannot invoke Admin-only pricing/subsidy rule governance
      expect(
        checkAdminAccess({
          requesterUid: 'staff_1',
          emailVerified: true,
          requesterRole: 'SALES_STAFF',
        }).allowed
      ).toBe(false);
      expect(
        checkBackendAccess({
          requesterUid: 'staff_1',
          emailVerified: true,
          requesterRole: 'SALES_STAFF',
          requireAdmin: true,
        }).allowed
      ).toBe(false);
    });

    it('grants access to document owner, assigned sales staff, and verified administrator', () => {
      expect(
        checkBackendAccess({
          requesterUid: 'homeowner_1',
          emailVerified: true,
          requesterRole: 'HOMEOWNER',
          resourceOwnerUid: 'homeowner_1',
        }).allowed
      ).toBe(true);

      expect(
        checkBackendAccess({
          requesterUid: 'staff_1',
          emailVerified: true,
          requesterRole: 'SALES_STAFF',
          resourceOwnerUid: 'homeowner_1',
          assignedStaffUids: ['staff_1'],
          requireStaff: true,
        }).allowed
      ).toBe(true);

      expect(
        checkAdminAccess({
          requesterUid: 'admin_uid',
          requesterEmail: 'rohitumdale@gmail.com',
          emailVerified: true,
        }).allowed
      ).toBe(true);

      expect(
        checkAdminAccess({
          requesterUid: 'role_admin_uid',
          emailVerified: true,
          requesterRole: 'ADMIN',
        }).allowed
      ).toBe(true);
    });

    it('masks consumer numbers and mobile numbers by default and validates binary file signatures', () => {
      expect(maskConsumerNumber('410018293401')).toBe('••••••••3401');
      expect(maskMobileNumber('9823011223')).toBe('+91 ••••••1223');

      const validPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj');
      const validPng = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ]);
      const spoofedExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');

      expect(validateDocumentMagicBytes(validPdf, 'application/pdf')).toBe(true);
      expect(validateImageMagicBytes(validPng, 'image/png')).toBe(true);
      expect(validateDocumentMagicBytes(spoofedExe, 'application/pdf')).toBe(false);
      expect(validateImageMagicBytes(spoofedExe, 'image/jpeg')).toBe(false);
    });
  });
});
