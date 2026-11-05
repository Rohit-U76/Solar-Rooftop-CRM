import type {
  AdminConfigRuleDoc,
  ClarityStatus,
  OwnershipType,
  ProjectStage,
  QualificationCategory,
  RoofType,
} from '../types/domain.ts';
import { PROJECT_STAGES } from '../types/domain.ts';

// ============================================================================
// 1. Vidarbha & Maharashtra Pincode Serviceability Lookup
// ============================================================================

export interface PincodeServiceInfo {
  pincode: string;
  city: string;
  district: string;
  isPrimaryVidarbhaZone: boolean;
  isSecondaryMaharashtraZone: boolean;
  serviceable: boolean;
}

const VIDARBHA_PINCODE_MAP: Record<string, { city: string; district: string }> = {
  '440': { city: 'Nagpur', district: 'Nagpur' },
  '441': { city: 'Kamptee / Hingna', district: 'Nagpur Rural & Bhandara' },
  '442': { city: 'Wardha / Chandrapur', district: 'Wardha & Chandrapur' },
  '443': { city: 'Khamgaon / Buldhana', district: 'Buldhana' },
  '444': { city: 'Amravati / Akola', district: 'Amravati & Akola' },
  '445': { city: 'Yavatmal / Washim', district: 'Yavatmal' },
};

export function resolvePincodeService(pincode: string): PincodeServiceInfo {
  const clean = (pincode || '').trim();
  const prefix3 = clean.slice(0, 3);
  const prefix1 = clean.slice(0, 1);

  if (VIDARBHA_PINCODE_MAP[prefix3]) {
    return {
      pincode: clean,
      city: VIDARBHA_PINCODE_MAP[prefix3].city,
      district: VIDARBHA_PINCODE_MAP[prefix3].district,
      isPrimaryVidarbhaZone: true,
      isSecondaryMaharashtraZone: false,
      serviceable: true,
    };
  }

  if (prefix1 === '4' && clean.length === 6) {
    return {
      pincode: clean,
      city: 'Maharashtra (Extended)',
      district: 'Maharashtra',
      isPrimaryVidarbhaZone: false,
      isSecondaryMaharashtraZone: true,
      serviceable: true,
    };
  }

  return {
    pincode: clean,
    city: 'Outside Service Zone',
    district: 'Non-Vidarbha',
    isPrimaryVidarbhaZone: false,
    isSecondaryMaharashtraZone: false,
    serviceable: false,
  };
}

// ============================================================================
// 2. Customer Lead Form & File Upload Validation
// ============================================================================

export interface LeadFormValidationInput {
  customerName: string;
  mobileNumber: string;
  email?: string;
  ownershipType: OwnershipType;
  roofType: RoofType;
  rooftopAreaSqFt: number;
  avgMonthlyBillInr: number;
  pincode: string;
  dpdpConsent: boolean;
  fileMimeType?: string;
  fileSizeBytes?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_BILL_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateLeadSubmission(input: LeadFormValidationInput): ValidationResult {
  const errors: Record<string, string> = {};

  const name = (input.customerName || '').trim();
  if (name.length < 2 || name.length > 100) {
    errors.customerName = 'Customer name must be between 2 and 100 characters.';
  }

  const mobile = (input.mobileNumber || '').trim();
  if (!/^[6-9][0-9]{9}$/.test(mobile)) {
    errors.mobileNumber = 'Enter a valid 10-digit Indian mobile number starting with 6–9.';
  }

  const email = (input.email || '').trim();
  if (email.length > 0 && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160)) {
    errors.email = 'Enter a valid email address or leave optional field blank.';
  }

  if (!['OWNER', 'TENANT'].includes(input.ownershipType)) {
    errors.ownershipType = 'Select whether you are a property owner or tenant.';
  }

  if (!['RCC', 'METAL_SHEET', 'TILED', 'OTHER'].includes(input.roofType)) {
    errors.roofType = 'Select a valid rooftop structure type.';
  }

  if (!Number.isFinite(input.rooftopAreaSqFt) || input.rooftopAreaSqFt < 50 || input.rooftopAreaSqFt > 100000) {
    errors.rooftopAreaSqFt = 'Available shadow-free rooftop area must be between 50 and 100,000 sq ft.';
  }

  if (!Number.isFinite(input.avgMonthlyBillInr) || input.avgMonthlyBillInr < 100 || input.avgMonthlyBillInr > 1000000) {
    errors.avgMonthlyBillInr = 'Average monthly electricity bill must be between ₹100 and ₹10,00,000.';
  }

  if (!/^[0-9]{6}$/.test((input.pincode || '').trim())) {
    errors.pincode = 'Enter a valid 6-digit postal pincode.';
  }

  if (!input.dpdpConsent) {
    errors.dpdpConsent = 'Consent to process electricity bill and contact details under DPDP Act 2023 is required.';
  }

  if (input.fileMimeType !== undefined) {
    if (!ALLOWED_IMAGE_MIMES.includes(input.fileMimeType)) {
      errors.billImage = 'Unsupported image format. Upload JPEG, PNG, or WebP.';
    }
  }

  if (input.fileSizeBytes !== undefined) {
    if (input.fileSizeBytes <= 0 || input.fileSizeBytes > MAX_BILL_FILE_BYTES) {
      errors.billImage = 'Electricity bill image must be between 1 KB and 5 MB.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ============================================================================
// 3. Bill Extraction Verification & Completeness Check
// ============================================================================

export interface ExtractedBillPayload {
  consumerNumber: string;
  discomName: string;
  tariffCategory: string;
  sanctionedLoadKw: number;
  monthlyUnitsKwh: number;
  billingAmountInr: number;
  billingPeriod: string;
  confidenceScore: number;
}

export function validateExtractionConfirmation(payload: ExtractedBillPayload): ValidationResult {
  const errors: Record<string, string> = {};

  if (!payload.consumerNumber || payload.consumerNumber.trim().length < 4) {
    errors.consumerNumber = 'Consumer number is required before confirming bill extraction.';
  }
  if (!payload.discomName || payload.discomName.trim().length < 2) {
    errors.discomName = 'Distribution company (DISCOM) name is required.';
  }
  if (!payload.tariffCategory || payload.tariffCategory.trim().length < 2) {
    errors.tariffCategory = 'Tariff category (e.g. LT-I Residential) is required.';
  }
  if (!Number.isFinite(payload.sanctionedLoadKw) || payload.sanctionedLoadKw <= 0 || payload.sanctionedLoadKw > 500) {
    errors.sanctionedLoadKw = 'Sanctioned load must be greater than 0 kW.';
  }
  if (!Number.isFinite(payload.monthlyUnitsKwh) || payload.monthlyUnitsKwh <= 0 || payload.monthlyUnitsKwh > 200000) {
    errors.monthlyUnitsKwh = 'Monthly electricity units must be greater than 0 kWh.';
  }
  if (!Number.isFinite(payload.billingAmountInr) || payload.billingAmountInr <= 0 || payload.billingAmountInr > 1000000) {
    errors.billingAmountInr = 'Billing amount must be greater than ₹0.';
  }
  if (!payload.billingPeriod || payload.billingPeriod.trim().length < 3) {
    errors.billingPeriod = 'Billing period is required.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function classifyBillExtractionClarity(input: {
  confidenceScore: number;
  monthlyUnitsKwh: number;
  billingAmountInr: number;
  reportedClarity?: ClarityStatus;
}): { clarityStatus: ClarityStatus; confidenceScore: number; requiresReupload: boolean } {
  const confidence = Math.max(0, Math.min(100, Math.round(Number(input.confidenceScore ?? 0))));
  const units = Math.max(0, Number(input.monthlyUnitsKwh ?? 0));
  const amount = Math.max(0, Number(input.billingAmountInr ?? 0));

  if (
    input.reportedClarity === 'UNCLEAR_REUPLOAD' ||
    confidence < 35 ||
    (units === 0 && amount === 0)
  ) {
    return {
      clarityStatus: 'UNCLEAR_REUPLOAD',
      confidenceScore: confidence,
      requiresReupload: true,
    };
  }

  if (input.reportedClarity === 'CLEAR' && confidence >= 75 && units > 0 && amount > 0) {
    return {
      clarityStatus: 'CLEAR',
      confidenceScore: confidence,
      requiresReupload: false,
    };
  }

  return {
    clarityStatus: 'LOW_CONFIDENCE',
    confidenceScore: confidence,
    requiresReupload: false,
  };
}

export function maskConsumerNumber(consumerNumber: string): string {
  const clean = (consumerNumber || '').trim();
  if (!clean) return 'Unverified';
  if (clean.length <= 4) return clean;
  const visibleTail = clean.slice(-4);
  return `${'•'.repeat(Math.min(8, clean.length - 4))}${visibleTail}`;
}

export function maskMobileNumber(mobileNumber: string): string {
  const clean = (mobileNumber || '').replace(/\D/g, '');
  if (clean.length < 4) return 'DPDP Protected';
  return `+91 ••••••${clean.slice(-4)}`;
}

// ============================================================================
// 4. Transparent Deterministic Lead Scoring & Solar Sizing Engine
// ============================================================================

export interface LeadScoringInput {
  ownershipType: OwnershipType;
  avgMonthlyBillInr: number;
  rooftopAreaSqFt: number;
  sanctionedLoadKw: number;
  pincode: string;
  monthlyUnitsKwh: number;
  roofType?: RoofType;
  annualGenPerKw?: number;
}

export interface LeadScoringOutput {
  totalScore: number;
  category: QualificationCategory;
  recommendedCapacityKw: number;
  recommendationLabel: string;
  ownershipPoints: number;
  billPoints: number;
  roofAreaPoints: number;
  loadPoints: number;
  pincodePoints: number;
  consumptionPoints: number;
  recommendationReason: string;
  nextRecommendedAction: string;
  suggestedSurveyStatus: 'SURVEY_SCHEDULED' | 'CALL_SCHEDULED' | 'HOLD_TENANT_CONSENT';
}

const ROOF_TYPE_LABELS: Record<RoofType, string> = {
  RCC: 'RCC flat terrace',
  METAL_SHEET: 'GI metal sheet roof',
  TILED: 'sloped tiled roof',
  OTHER: 'custom elevated roof structure',
};

export function evaluateLeadQualification(input: LeadScoringInput): LeadScoringOutput {
  const annualGenPerKw = input.annualGenPerKw && input.annualGenPerKw > 0 ? input.annualGenPerKw : 1400;
  const serviceInfo = resolvePincodeService(input.pincode);
  const effectiveRoofType: RoofType = input.roofType ?? 'RCC';

  // 1. Ownership (max 20)
  const ownershipPoints = input.ownershipType === 'OWNER' ? 20 : 4;

  // 2. Monthly Bill (max 28)
  let billPoints = 3;
  if (input.avgMonthlyBillInr >= 3000) billPoints = 28;
  else if (input.avgMonthlyBillInr >= 2000) billPoints = 20;
  else if (input.avgMonthlyBillInr >= 1200) billPoints = 12;
  else if (input.avgMonthlyBillInr >= 800) billPoints = 6;

  // 3. Consumption Units (max 18)
  const effectiveUnits =
    input.monthlyUnitsKwh > 0
      ? input.monthlyUnitsKwh
      : Math.round(input.avgMonthlyBillInr / 9.2);

  let consumptionPoints = 2;
  if (effectiveUnits >= 300) consumptionPoints = 18;
  else if (effectiveUnits >= 200) consumptionPoints = 13;
  else if (effectiveUnits >= 120) consumptionPoints = 7;

  // 4. Available Rooftop Area & Roof Structure Type (max 14; ~100 sq ft per kW)
  let areaBasePoints = 2;
  if (input.rooftopAreaSqFt >= 350) areaBasePoints = 12;
  else if (input.rooftopAreaSqFt >= 220) areaBasePoints = 8;
  else if (input.rooftopAreaSqFt >= 110) areaBasePoints = 5;

  let roofTypeBonus = 0;
  if (effectiveRoofType === 'RCC') roofTypeBonus = 2;
  else if (effectiveRoofType === 'METAL_SHEET') roofTypeBonus = 1;

  const roofAreaPoints = Math.min(14, areaBasePoints + roofTypeBonus);

  // 5. Sanctioned Load (max 10)
  const effectiveLoad =
    input.sanctionedLoadKw > 0 ? input.sanctionedLoadKw : Math.max(1, Math.round(effectiveUnits / 100));
  let loadPoints = 2;
  if (effectiveLoad >= 3) loadPoints = 10;
  else if (effectiveLoad >= 2) loadPoints = 7;
  else if (effectiveLoad >= 1) loadPoints = 4;

  // 6. Pincode & Vidarbha Service Availability (max 10)
  let pincodePoints = 0;
  if (serviceInfo.isPrimaryVidarbhaZone) pincodePoints = 10;
  else if (serviceInfo.isSecondaryMaharashtraZone) pincodePoints = 4;

  const rawSum =
    ownershipPoints + billPoints + consumptionPoints + roofAreaPoints + loadPoints + pincodePoints;

  // Tenant business rule: Tenants are NEVER automatically rejected; they receive a phone qualification call
  // for landlord NOC & MSEDCL consumer title verification before physical survey.
  if (input.ownershipType === 'TENANT') {
    const cappedTenantScore = Math.min(38, rawSum);
    return {
      totalScore: cappedTenantScore,
      category: 'LOW',
      recommendedCapacityKw: 0,
      recommendationLabel: 'Not yet recommended',
      ownershipPoints,
      billPoints,
      roofAreaPoints,
      loadPoints,
      pincodePoints,
      consumptionPoints,
      recommendationReason: `Tenant enquiry in ${serviceInfo.city} (${ROOF_TYPE_LABELS[effectiveRoofType]}) with ₹${input.avgMonthlyBillInr.toLocaleString('en-IN')}/mo bill (${effectiveUnits} kWh). Rooftop solar net-metering and residential subsidy require property owner NOC and MSEDCL consumer title verification before sizing confirmation.`,
      nextRecommendedAction:
        'Schedule a 10-minute phone qualification call to verify landlord NOC readiness instead of automatic rejection or immediate physical site survey.',
      suggestedSurveyStatus: 'HOLD_TENANT_CONSENT',
    };
  }

  // Outside serviceable Maharashtra zone: courtesy phone qualification call, never silent rejection
  if (!serviceInfo.serviceable) {
    const outOfZoneScore = Math.min(35, rawSum);
    return {
      totalScore: outOfZoneScore,
      category: 'LOW',
      recommendedCapacityKw: 0,
      recommendationLabel: 'Outside Vidarbha service area',
      ownershipPoints,
      billPoints,
      roofAreaPoints,
      loadPoints,
      pincodePoints,
      consumptionPoints,
      recommendationReason: `Pincode ${input.pincode} is outside SuryaSetu's primary Vidarbha & Maharashtra installation network.`,
      nextRecommendedAction:
        'Schedule a brief phone qualification call to confirm installation address or refer to regional EPC partner.',
      suggestedSurveyStatus: 'CALL_SCHEDULED',
    };
  }

  // Owner solar capacity calculation:
  // Yearly consumption = effectiveUnits * 12; Yearly generation per kW = annualGenPerKw (default 1,400 units)
  const rawDemandKw = (effectiveUnits * 12) / annualGenPerKw;
  const maxRoofSupportedKw = Math.max(1, Math.floor(input.rooftopAreaSqFt / 100));
  const recommendedCapacityKw = Math.max(1, Math.min(Math.round(rawDemandKw), maxRoofSupportedKw));
  const recommendationLabel = `${recommendedCapacityKw} kW`;

  // Category classification rules
  let category: QualificationCategory = 'LOW';
  if (input.avgMonthlyBillInr < 1000 || effectiveUnits < 110) {
    // Low electricity bill business rule: offer starter 1 kW guidance + phone qualification call, keep priority LOW
    category = 'LOW';
  } else if (rawSum >= 75) {
    category = 'HIGH';
  } else if (rawSum >= 52) {
    category = 'MEDIUM';
  } else {
    category = 'LOW';
  }

  let nextRecommendedAction =
    'Schedule a phone qualification call to review tariff eligibility, roof mounting, and payback expectations before dispatching a site survey.';
  let suggestedSurveyStatus: 'SURVEY_SCHEDULED' | 'CALL_SCHEDULED' = 'CALL_SCHEDULED';

  if (category === 'HIGH') {
    nextRecommendedAction = `Assign Nagpur field engineer for priority rooftop site survey and shadow check for ${recommendedCapacityKw} kW plant on ${ROOF_TYPE_LABELS[effectiveRoofType]}.`;
    suggestedSurveyStatus = 'SURVEY_SCHEDULED';
  } else if (category === 'MEDIUM') {
    nextRecommendedAction = `Conduct phone qualification call to confirm sanctioned load (${effectiveLoad} kW), ${ROOF_TYPE_LABELS[effectiveRoofType]} access, and book rooftop survey.`;
    suggestedSurveyStatus = 'CALL_SCHEDULED';
  }

  const roofLimitedNote =
    Math.round(rawDemandKw) > maxRoofSupportedKw
      ? ` Capacity constrained to ${maxRoofSupportedKw} kW by ${input.rooftopAreaSqFt} sq ft available area.`
      : '';

  const roofMountingNote =
    effectiveRoofType === 'TILED' || effectiveRoofType === 'OTHER'
      ? ` Mounting on ${ROOF_TYPE_LABELS[effectiveRoofType]} requires elevated rafter/fabrication assessment.`
      : effectiveRoofType === 'METAL_SHEET'
        ? ` Suitable for rail-clamp mounting on ${ROOF_TYPE_LABELS[effectiveRoofType]}.`
        : '';

  const lowBillNote =
    input.avgMonthlyBillInr < 1000 || effectiveUnits < 110
      ? ` Monthly usage (${effectiveUnits} kWh, ₹${input.avgMonthlyBillInr}) is modest, so a compact ${recommendedCapacityKw} kW starter system is recommended with a phone qualification call prior to physical survey.`
      : ` Consumption of ${effectiveUnits} kWh/month (₹${input.avgMonthlyBillInr.toLocaleString('en-IN')}) in ${serviceInfo.city} on ${ROOF_TYPE_LABELS[effectiveRoofType]} aligns well with a ${recommendedCapacityKw} kW rooftop system generating ~${(recommendedCapacityKw * annualGenPerKw).toLocaleString('en-IN')} units/year.`;

  return {
    totalScore: Math.min(100, rawSum),
    category,
    recommendedCapacityKw,
    recommendationLabel,
    ownershipPoints,
    billPoints,
    roofAreaPoints,
    loadPoints,
    pincodePoints,
    consumptionPoints,
    recommendationReason: `Homeowner in ${serviceInfo.city} (${input.pincode}).${lowBillNote}${roofLimitedNote}${roofMountingNote}`,
    nextRecommendedAction,
    suggestedSurveyStatus,
  };
}

// ============================================================================
// 5. Effective-Date Rule Selection & Deterministic Quotation Math
// ============================================================================

export function selectEffectiveRule<
  T extends Pick<AdminConfigRuleDoc, 'effectiveFrom' | 'effectiveTo' | 'isActive' | 'versionNumber' | 'code'>
>(rules: T[], quotationDate: string, codeFilter?: string): T {
  const candidates = rules.filter((r) => {
    if (!r.isActive) return false;
    if (codeFilter && r.code !== codeFilter) return false;
    return r.effectiveFrom <= quotationDate && quotationDate <= r.effectiveTo;
  });

  if (candidates.length === 0) {
    throw new Error(
      `No active configuration rule found covering quotation date ${quotationDate}${codeFilter ? ` for ${codeFilter}` : ''}. Please verify rule effective dates in Admin Configuration.`
    );
  }

  return candidates.sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

export interface SubsidyRuleParams {
  firstTierMaxKw: number; // Sample default: 2
  firstTierRateInr: number; // Sample default: 30000
  secondTierMaxKw: number; // Sample default: 3
  secondTierRateInr: number; // Sample default: 18000
  maxSubsidyCapInr: number; // Sample default: 78000
  residentialOnly: boolean;
}

export function calculateApplicableSubsidy(
  capacityKw: number,
  ownershipType: OwnershipType,
  isResidentialTariff: boolean,
  rule: SubsidyRuleParams
): number {
  if (capacityKw <= 0) return 0;
  if (ownershipType !== 'OWNER') return 0;
  if (rule.residentialOnly && !isResidentialTariff) return 0;

  const tier1Kw = Math.min(capacityKw, rule.firstTierMaxKw);
  const tier1Subsidy = tier1Kw * rule.firstTierRateInr;

  const tier2Kw = Math.max(0, Math.min(capacityKw, rule.secondTierMaxKw) - rule.firstTierMaxKw);
  const tier2Subsidy = tier2Kw * rule.secondTierRateInr;

  const rawSubsidy = tier1Subsidy + tier2Subsidy;
  return Math.round(Math.min(rule.maxSubsidyCapInr, rawSubsidy));
}

export interface QuotationCalculationInput {
  systemCapacityKw: number;
  ownershipType: OwnershipType;
  isResidentialTariff: boolean;
  panelPricePerKwInr: number;
  annualGenPerKw: number; // Default: 1,400 units/kW, configurable by administrators
  installationPerKwInr: number;
  bosAndNetMeteringFlatInr: number;
  customEquipmentAdjustmentInr?: number;
  electricityTariffInr: number;
  selfConsumptionRatio?: number; // Default 1.0 under net metering
  subsidyRule: SubsidyRuleParams;
}

export interface QuotationCalculationResult {
  systemCapacityKw: number;
  annualGenerationUnits: number;
  equipmentCostInr: number;
  installationChargesInr: number;
  totalInstallationCostInr: number;
  applicableSubsidyInr: number;
  netCustomerCostInr: number;
  electricityTariffInr: number;
  selfConsumptionUnits: number;
  estimatedAnnualSavingsInr: number;
  estimatedPaybackYears: number;
}

export function calculateSolarQuotation(input: QuotationCalculationInput): QuotationCalculationResult {
  if (!Number.isFinite(input.systemCapacityKw) || input.systemCapacityKw <= 0) {
    throw new Error('Solar system capacity must be greater than 0 kW.');
  }
  if (!Number.isFinite(input.electricityTariffInr) || input.electricityTariffInr <= 0) {
    throw new Error('Applicable electricity tariff must be greater than ₹0/unit.');
  }

  const annualGenPerKw = input.annualGenPerKw > 0 ? input.annualGenPerKw : 1400;
  // Deterministic formula: Yearly Generation = System Capacity (kW) × annualGenPerKw (default 1,400 units)
  const annualGenerationUnits = Math.round(input.systemCapacityKw * annualGenPerKw);

  const equipmentCostInr = Math.max(
    0,
    Math.round(
      input.systemCapacityKw * input.panelPricePerKwInr + (input.customEquipmentAdjustmentInr ?? 0)
    )
  );
  const installationChargesInr = Math.max(
    0,
    Math.round(input.systemCapacityKw * input.installationPerKwInr + input.bosAndNetMeteringFlatInr)
  );

  const totalInstallationCostInr = equipmentCostInr + installationChargesInr;

  const applicableSubsidyInr = calculateApplicableSubsidy(
    input.systemCapacityKw,
    input.ownershipType,
    input.isResidentialTariff,
    input.subsidyRule
  );

  // Deterministic formula: Net Cost = Gross Installation Cost − Applicable Subsidy
  const netCustomerCostInr = Math.max(0, totalInstallationCostInr - applicableSubsidyInr);

  const selfConsumptionRatio =
    input.selfConsumptionRatio !== undefined &&
    input.selfConsumptionRatio > 0 &&
    input.selfConsumptionRatio <= 1
      ? input.selfConsumptionRatio
      : 1.0;

  const selfConsumptionUnits = Math.round(annualGenerationUnits * selfConsumptionRatio);

  // Deterministic formula: Annual Savings = Estimated Solar Self-Consumption × Applicable Electricity Tariff
  const estimatedAnnualSavingsInr = Math.round(selfConsumptionUnits * input.electricityTariffInr);

  // Deterministic formula: Payback Period = Net Cost ÷ Estimated Annual Savings
  const estimatedPaybackYears =
    estimatedAnnualSavingsInr > 0
      ? Number((netCustomerCostInr / estimatedAnnualSavingsInr).toFixed(1))
      : 0;

  return {
    systemCapacityKw: input.systemCapacityKw,
    annualGenerationUnits,
    equipmentCostInr,
    installationChargesInr,
    totalInstallationCostInr,
    applicableSubsidyInr,
    netCustomerCostInr,
    electricityTariffInr: input.electricityTariffInr,
    selfConsumptionUnits,
    estimatedAnnualSavingsInr,
    estimatedPaybackYears,
  };
}

export interface QuotationComparisonOption extends QuotationCalculationResult {
  optionKey: string;
  optionLabel: string;
  isRecommended: boolean;
  isSelected: boolean;
}

/**
 * Deterministically builds 1 kW, 2 kW, 3 kW, and a Suitable Alternative solar option
 * (e.g. lead's recommended kW when >3, custom selected kW, or 5 kW commercial/high-load option).
 */
export function buildMultiOptionComparison(
  baseInput: QuotationCalculationInput,
  recommendedCapacityKw?: number
): QuotationComparisonOption[] {
  const recKw = recommendedCapacityKw && recommendedCapacityKw > 0 ? recommendedCapacityKw : 0;
  const selKw = baseInput.systemCapacityKw;

  let alternativeKw = 5;
  let alternativeSubtitle = 'High-Load Alternative';

  if (recKw > 0 && ![1, 2, 3].includes(recKw)) {
    alternativeKw = recKw;
    alternativeSubtitle = 'Recommended Alternative';
  } else if (selKw > 0 && ![1, 2, 3].includes(selKw)) {
    alternativeKw = selKw;
    alternativeSubtitle = 'Selected Alternative';
  } else {
    alternativeKw = 5;
    alternativeSubtitle = 'Suitable Alternative';
  }

  const tiers: Array<{ kw: number; key: string; label: string }> = [
    { kw: 1, key: '1kw', label: '1 kW Starter' },
    { kw: 2, key: '2kw', label: '2 kW Compact' },
    { kw: 3, key: '3kw', label: '3 kW Standard' },
    { kw: alternativeKw, key: `alt_${alternativeKw}kw`, label: `${alternativeKw} kW ${alternativeSubtitle}` },
  ];

  return tiers.map((tier) => {
    const calc = calculateSolarQuotation({
      ...baseInput,
      systemCapacityKw: tier.kw,
    });
    return {
      ...calc,
      optionKey: tier.key,
      optionLabel: tier.label,
      isRecommended: recKw > 0 && Math.abs(recKw - tier.kw) < 0.01,
      isSelected: Math.abs(selKw - tier.kw) < 0.01,
    };
  });
}

// ============================================================================
// 6. Project Stage Transitions & Delay Detection
// ============================================================================

export function validateProjectStageTransition(
  currentStage: ProjectStage,
  nextStage: ProjectStage,
  allowAdminJump = false
): { valid: boolean; reason?: string; nextIndex: number } {
  const currDef = PROJECT_STAGES.find((s) => s.code === currentStage);
  const nextDef = PROJECT_STAGES.find((s) => s.code === nextStage);

  if (!currDef || !nextDef) {
    return { valid: false, reason: 'Unrecognized project lifecycle stage.', nextIndex: 1 };
  }

  if (currentStage === 'PROJECT_COMPLETED' && !allowAdminJump) {
    return {
      valid: false,
      reason: 'Completed projects are locked and cannot transition further without administrator override.',
      nextIndex: currDef.index,
    };
  }

  if (!allowAdminJump && nextDef.index !== currDef.index + 1 && nextDef.index !== currDef.index) {
    return {
      valid: false,
      reason: `Projects must advance sequentially from "${currDef.label}" to Stage ${currDef.index + 1}.`,
      nextIndex: currDef.index,
    };
  }

  return { valid: true, nextIndex: nextDef.index };
}

export function evaluateProjectDelay(
  currentStage: ProjectStage,
  stageStartedIso: string,
  nowDate: Date = new Date()
): { isDelayed: boolean; daysInStage: number; slaDays: number } {
  const def = PROJECT_STAGES.find((s) => s.code === currentStage);
  if (!def || currentStage === 'PROJECT_COMPLETED') {
    return { isDelayed: false, daysInStage: 0, slaDays: 0 };
  }
  const startedMs = Date.parse(stageStartedIso);
  if (Number.isNaN(startedMs)) {
    return { isDelayed: false, daysInStage: 0, slaDays: def.slaDays };
  }
  const daysInStage = Math.max(0, Math.floor((nowDate.getTime() - startedMs) / (1000 * 60 * 60 * 24)));
  return {
    isDelayed: def.slaDays > 0 && daysInStage > def.slaDays,
    daysInStage,
    slaDays: def.slaDays,
  };
}

// ============================================================================
// 7. Backend RBAC & Administrative Governance Helpers
// ============================================================================

export const BOOTSTRAPPED_ADMIN_EMAIL = 'rohitumdale@gmail.com';

export function checkAdminAccess(params: {
  requesterUid: string;
  requesterEmail?: string;
  emailVerified?: boolean;
  requesterRole?: 'HOMEOWNER' | 'SALES_STAFF' | 'ADMIN';
}): { allowed: boolean; reason?: string } {
  if (!params.requesterUid) {
    return { allowed: false, reason: 'Authentication required.' };
  }
  if (params.emailVerified === false) {
    return { allowed: false, reason: 'Verified email token is required.' };
  }
  const isBootstrapped =
    params.emailVerified === true &&
    params.requesterEmail?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  if (isBootstrapped || params.requesterRole === 'ADMIN') {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: 'Administrator privileges required to modify pricing or subsidy rules.',
  };
}

export function checkBackendAccess(params: {
  requesterUid: string;
  requesterEmail?: string;
  emailVerified?: boolean;
  requesterRole?: 'HOMEOWNER' | 'SALES_STAFF' | 'ADMIN';
  resourceOwnerUid?: string;
  assignedStaffUids?: string[];
  requireStaff?: boolean;
  requireAdmin?: boolean;
}): { allowed: boolean; reason?: string } {
  if (!params.requesterUid) {
    return { allowed: false, reason: 'Authentication required.' };
  }
  if (params.emailVerified === false) {
    return { allowed: false, reason: 'Verified email token is required.' };
  }

  const isBootstrapped =
    params.emailVerified === true &&
    params.requesterEmail?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  if (params.requireAdmin) {
    return checkAdminAccess(params);
  }

  const isStaffOrAdmin =
    isBootstrapped ||
    params.requesterRole === 'ADMIN' ||
    params.requesterRole === 'SALES_STAFF' ||
    Boolean(params.assignedStaffUids?.includes(params.requesterUid));

  if (params.requireStaff && !isStaffOrAdmin) {
    return { allowed: false, reason: 'Sales Staff or Administrator authorization required.' };
  }

  if (params.resourceOwnerUid) {
    if (params.resourceOwnerUid === params.requesterUid || isStaffOrAdmin) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'Access restricted to document owner or assigned sales team.' };
  }

  return { allowed: true };
}

