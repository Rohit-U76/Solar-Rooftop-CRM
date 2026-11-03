export type UserRole = 'HOMEOWNER' | 'SALES_STAFF' | 'ADMIN';
export type WorkspaceMode = 'HOMEOWNER' | 'SALES';
export type SupportedLanguage = 'en' | 'mr' | 'hi';

export type OwnershipType = 'OWNER' | 'TENANT';
export type RoofType = 'RCC' | 'METAL_SHEET' | 'TILED' | 'OTHER';
export type QualificationCategory = 'HIGH' | 'MEDIUM' | 'LOW';

export type SurveyStatus =
  | 'PENDING_REVIEW'
  | 'CALL_SCHEDULED'
  | 'SURVEY_SCHEDULED'
  | 'SURVEY_COMPLETED'
  | 'HOLD_TENANT_CONSENT';

export type LeadStage =
  | 'NEW'
  | 'BILL_UPLOADED'
  | 'EXTRACTION_CONFIRMED'
  | 'QUALIFIED'
  | 'QUOTED'
  | 'CONVERTED';

export type ClarityStatus = 'CLEAR' | 'LOW_CONFIDENCE' | 'UNCLEAR_REUPLOAD';
export type VerificationStatus =
  | 'PENDING_VERIFICATION'
  | 'USER_CONFIRMED'
  | 'STAFF_VERIFIED'
  | 'REUPLOAD_REQUIRED';

export type QuotationStatus = 'DRAFT' | 'ISSUED' | 'APPROVED' | 'REJECTED' | 'CONVERTED';

export type ProjectStage =
  | 'QUOTATION_APPROVED'
  | 'ADVANCE_PAYMENT_RECEIVED'
  | 'SITE_SURVEY_COMPLETED'
  | 'INSTALLATION_SCHEDULED'
  | 'INSTALLATION_IN_PROGRESS'
  | 'INSTALLATION_COMPLETED'
  | 'NET_METERING_DISCOM'
  | 'SUBSIDY_SUBMITTED'
  | 'SUBSIDY_CREDITED'
  | 'PROJECT_COMPLETED';

export interface ProjectStageDefinition {
  code: ProjectStage;
  index: number;
  label: string;
  customerSummary: string;
  slaDays: number;
}

export const PROJECT_STAGES: ProjectStageDefinition[] = [
  {
    code: 'QUOTATION_APPROVED',
    index: 1,
    label: 'Quotation Approved',
    customerSummary: 'Solar proposal and system specifications approved.',
    slaDays: 2,
  },
  {
    code: 'ADVANCE_PAYMENT_RECEIVED',
    index: 2,
    label: 'Advance Payment Received',
    customerSummary: 'Booking advance recorded (Simulation) for engineering allocation.',
    slaDays: 3,
  },
  {
    code: 'SITE_SURVEY_COMPLETED',
    index: 3,
    label: 'Site Survey Completed',
    customerSummary: 'Shadow analysis, structural check, and cable routing verified.',
    slaDays: 4,
  },
  {
    code: 'INSTALLATION_SCHEDULED',
    index: 4,
    label: 'Installation Scheduled',
    customerSummary: 'Panels, inverter, and mounting kit dispatched to site.',
    slaDays: 5,
  },
  {
    code: 'INSTALLATION_IN_PROGRESS',
    index: 5,
    label: 'Installation In Progress',
    customerSummary: 'Structure erection, module mounting, and DC/AC wiring underway.',
    slaDays: 4,
  },
  {
    code: 'INSTALLATION_COMPLETED',
    index: 6,
    label: 'Installation Completed',
    customerSummary: 'Plant mechanically and electrically tested by commissioning engineer.',
    slaDays: 2,
  },
  {
    code: 'NET_METERING_DISCOM',
    index: 7,
    label: 'Net Metering / DISCOM Process',
    customerSummary: 'Bi-directional net meter application and MSEDCL inspection in progress.',
    slaDays: 10,
  },
  {
    code: 'SUBSIDY_SUBMITTED',
    index: 8,
    label: 'Subsidy Application Submitted',
    customerSummary: 'Commissioning certificate uploaded on national rooftop portal.',
    slaDays: 7,
  },
  {
    code: 'SUBSIDY_CREDITED',
    index: 9,
    label: 'Subsidy Credited',
    customerSummary: 'Direct benefit transfer subsidy credited to homeowner bank account.',
    slaDays: 14,
  },
  {
    code: 'PROJECT_COMPLETED',
    index: 10,
    label: 'Project Completed',
    customerSummary: 'Plant handed over with warranty pack and live generation monitoring.',
    slaDays: 0,
  },
];

export interface UserProfileDoc {
  uid: string;
  displayName: string;
  role: UserRole;
  activeWorkspace: WorkspaceMode;
  preferredLanguage: SupportedLanguage;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SolarLeadDoc {
  id: string;
  leadNumber: string;
  ownerUid: string;
  assignedStaffUids: string[];
  customerName: string;
  ownershipType: OwnershipType;
  roofType: RoofType;
  rooftopAreaSqFt: number;
  avgMonthlyBillInr: number;
  averageUnitsKwh: number;
  sanctionedLoadKw: number;
  pincode: string;
  city: string;
  qualificationCategory: QualificationCategory;
  leadScore: number;
  recommendedCapacityKw: number;
  recommendationLabel: string;
  surveyStatus: SurveyStatus;
  leadStage: LeadStage;
  monthKey: string;
  isSampleSeed: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeadContactPiiDoc {
  id: string;
  leadId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  mobileNumber: string;
  email: string;
  dpdpConsent: boolean;
  retentionDays: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ElectricityBillDoc {
  id: string;
  leadId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSizeBytes: number;
  storageRef: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BillExtractionDoc {
  id: string;
  leadId: string;
  billId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  consumerNumber: string;
  discomName: string;
  tariffCategory: string;
  sanctionedLoadKw: number;
  monthlyUnitsKwh: number;
  billingAmountInr: number;
  billingPeriod: string;
  confidenceScore: number;
  clarityStatus: ClarityStatus;
  verificationStatus: VerificationStatus;
  extractionNotes: string;
  verifiedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LeadScoreDoc {
  id: string;
  leadId: string;
  ownerUid: string;
  assignedStaffUids: string[];
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
  isOverridden: boolean;
  overrideReason: string;
  overriddenByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type RuleCategory = 'SOLAR_OPTION' | 'SUBSIDY_RULE' | 'PRICING_RULE' | 'ELECTRICITY_TARIFF';

export interface AdminConfigRuleDoc {
  id: string;
  ruleCategory: RuleCategory;
  workspaceScope: string;
  title: string;
  code: string;
  versionNumber: number;
  effectiveFrom: string;
  effectiveTo: string;
  isActive: boolean;
  parameters: Record<string, number | string | boolean>;
  notes: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SolarQuotationDoc {
  id: string;
  quotationNumber: string;
  leadId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  customerName: string;
  city: string;
  pincode: string;
  ownershipType: OwnershipType;
  systemCapacityKw: number;
  panelTypeLabel: string;
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
  quotationDate: string;
  validUntilDate: string;
  appliedRuleSnapshot: Record<string, string | number | boolean>;
  status: QuotationStatus;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuotationLineItemDoc {
  id: string;
  quotationId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  itemName: string;
  specification: string;
  quantity: number;
  unitPriceInr: number;
  lineTotalInr: number;
  createdAt?: unknown;
}

export interface SolarProjectDoc {
  id: string;
  projectNumber: string;
  quotationId: string;
  leadId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  customerName: string;
  city: string;
  pincode: string;
  systemCapacityKw: number;
  netCustomerCostInr: number;
  applicableSubsidyInr: number;
  currentStage: ProjectStage;
  stageIndex: number;
  pendingActivities: string;
  isDelayed: boolean;
  delayReason: string;
  trackingToken: string;
  stageStartedAt: string;
  completionMonthKey: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProjectDocumentDoc {
  id: string;
  projectId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  docTitle: string;
  docType:
    | 'SITE_SURVEY_REPORT'
    | 'SINGLE_LINE_DIAGRAM'
    | 'NET_METERING_APPLICATION'
    | 'SUBSIDY_VOUCHER'
    | 'COMMISSIONING_REPORT';
  fileName: string;
  fileSizeKb: number;
  uploadedByUid: string;
  notes: string;
  createdAt?: unknown;
}

export interface ProjectPaymentDoc {
  id: string;
  projectId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  paymentReference: string;
  milestone: 'ADVANCE_BOOKING' | 'STRUCTURE_DISPATCH' | 'FINAL_HANDOVER';
  amountInr: number;
  paymentMode: 'SIMULATED_UPI' | 'SIMULATED_NEFT' | 'SIMULATED_CARD';
  isSimulation: boolean;
  recordedByUid: string;
  createdAt?: unknown;
}

export interface ProjectStatusHistoryDoc {
  id: string;
  projectId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  fromStage: string;
  toStage: string;
  stageIndex: number;
  remarks: string;
  updatedByUid: string;
  updatedByName: string;
  createdAt?: unknown;
}

export interface PublicProjectTrackingDoc {
  trackingToken: string;
  projectId: string;
  projectNumber: string;
  customerMask: string;
  city: string;
  systemCapacityKw: number;
  currentStage: ProjectStage;
  stageIndex: number;
  completedStageIndices: number[];
  pendingActivities: string;
  isDelayed: boolean;
  delaySummary: string;
  ownerUid: string;
  assignedStaffUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NotificationDoc {
  id: string;
  recipientUid: string;
  assignedStaffUids: string[];
  channel: 'WHATSAPP_SIMULATION' | 'SMS_SIMULATION' | 'IN_APP';
  eventType:
    | 'LEAD_CREATED'
    | 'BILL_VERIFIED'
    | 'LEAD_SCORED'
    | 'QUOTATION_ISSUED'
    | 'QUOTATION_APPROVED'
    | 'PAYMENT_SIMULATED'
    | 'PROJECT_STAGE_UPDATED';
  referenceCode: string;
  maskedRecipientPhone: string;
  title: string;
  message: string;
  isRead: boolean;
  isSimulation: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const SAMPLE_BILL_ASSETS = {
  prashant: '/src/assets/images/sample_bill_prashant_1793706752912.jpg',
  rohit: '/src/assets/images/sample_bill_rohit_1793706753162.jpg',
  ayesha: '/src/assets/images/sample_bill_ayesha_1793706752509.jpg',
  hero: '/src/assets/images/hero_nagpur_solar_1793706750706.jpg',
} as const;
