import { describe, expect, it } from 'vitest';
import {
  calculateApplicableSubsidy,
  calculateSolarQuotation,
  checkBackendAccess,
  evaluateLeadQualification,
  evaluateProjectDelay,
  MAX_BILL_FILE_BYTES,
  selectEffectiveRule,
  validateExtractionConfirmation,
  validateLeadSubmission,
  validateProjectStageTransition,
  type SubsidyRuleParams,
} from '../shared/solarEngine.ts';

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

  // 2. Electricity Bill Extraction Confirmation Validation
  describe('2. Bill Extraction Verification Completeness', () => {
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
  });

  // 3 & 4. Lead Scoring & Solar Capacity Recommendation (Exact Sample Cohort)
  describe('3 & 4. Lead Qualification & Solar Sizing (LD-30881, LD-30902, LD-30915)', () => {
    it('scores LD-30881 (Prashant Wankhede, Owner, ₹3,200, 340 units) as HIGH with 3 kW recommended', () => {
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

    it('scores LD-30902 (Rohit Meshram, Tenant, ₹1,900, 210 units) as LOW & "Not yet recommended" without rejecting', () => {
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

    it('scores LD-30915 (Ayesha Siddiqui, Owner, ₹650, 85 units) as LOW with 1 kW starter recommendation & call', () => {
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

    it('returns ₹0 subsidy for tenants or non-residential commercial connections', () => {
      expect(calculateApplicableSubsidy(3, 'TENANT', true, SAMPLE_SUBSIDY_RULE)).toBe(0);
      expect(calculateApplicableSubsidy(3, 'OWNER', false, SAMPLE_SUBSIDY_RULE)).toBe(0);
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

  // 7, 8 & 9. Annual Generation, Net Cost, Payback & Snapshot Immutability
  describe('7, 8 & 9. Deterministic Quotation Math & Snapshot Immutability', () => {
    it('computes Yearly Generation = Capacity × 1,400, Net Cost, Annual Savings, and Payback accurately', () => {
      const q = calculateSolarQuotation({
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

      expect(q.annualGenerationUnits).toBe(4200); // 3 * 1400
      expect(q.totalInstallationCostInr).toBe(178000);
      expect(q.applicableSubsidyInr).toBe(78000);
      expect(q.netCustomerCostInr).toBe(100000); // 178000 - 78000
      expect(q.estimatedAnnualSavingsInr).toBe(39900); // 4200 * 9.5
      expect(q.estimatedPaybackYears).toBe(2.5); // 100000 / 39900 = 2.506 -> 2.5
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

      // Admin publishes a modified future rule
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
    it('allows sequential forward transitions and blocks stage skipping for standard staff', () => {
      const okStep = validateProjectStageTransition(
        'QUOTATION_APPROVED',
        'ADVANCE_PAYMENT_RECEIVED',
        false
      );
      expect(okStep.valid).toBe(true);
      expect(okStep.nextIndex).toBe(2);

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

  // 11. Role-Based Access Control
  describe('11. Backend Role-Based Access Control (RBAC)', () => {
    it('denies unauthenticated or unverified requests and restricts staff-only endpoints', () => {
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
    });

    it('grants access to document owner, assigned sales staff, and verified bootstrapped admin', () => {
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
        checkBackendAccess({
          requesterUid: 'admin_uid',
          requesterEmail: 'rohitumdale@gmail.com',
          emailVerified: true,
          resourceOwnerUid: 'someone_else',
          requireStaff: true,
        }).allowed
      ).toBe(true);
    });
  });
});
