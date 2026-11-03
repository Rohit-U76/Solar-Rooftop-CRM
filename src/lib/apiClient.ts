import { auth } from './firebase.ts';
import type { AdminConfigRuleDoc, ClarityStatus, WorkspaceMode } from '../types/domain.ts';
import type { LeadScoringOutput, QuotationCalculationResult } from '../shared/solarEngine.ts';

async function getAuthHeaders(workspaceMode?: WorkspaceMode): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in first to perform this action.');
  }
  // Token retrieved on demand in memory — never persisted to localStorage
  const idToken = await user.getIdToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
  if (workspaceMode === 'SALES') {
    headers['X-Workspace-Role'] = 'SALES_STAFF';
  }
  return headers;
}

export async function uploadElectricityBillFile(params: {
  file: File;
  onProgress?: (pct: number) => void;
}): Promise<{
  storageRef: string;
  fileSizeBytes: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
}> {
  params.onProgress?.(20);
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.readAsDataURL(params.file);
  });

  params.onProgress?.(55);
  const headers = await getAuthHeaders();
  const res = await fetch('/api/bills/upload', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: params.file.name,
      mimeType: params.file.type,
      base64Data,
    }),
  });

  params.onProgress?.(90);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Bill upload failed.');
  }
  params.onProgress?.(100);
  return data;
}

export async function fetchProtectedBillObjectUrl(
  storageRef: string,
  workspaceMode?: WorkspaceMode
): Promise<string> {
  if (!storageRef.startsWith('upload:')) {
    return storageRef;
  }
  const storageKey = storageRef.slice('upload:'.length);
  const headers = await getAuthHeaders(workspaceMode);
  delete headers['Content-Type'];

  const res = await fetch(`/api/bills/file/${encodeURIComponent(storageKey)}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error('Authorized electricity bill image could not be loaded.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export interface ApiExtractionResponse {
  extraction: {
    consumerNumber: string;
    discomName: string;
    tariffCategory: string;
    sanctionedLoadKw: number;
    monthlyUnitsKwh: number;
    billingAmountInr: number;
    billingPeriod: string;
    confidenceScore: number;
    clarityStatus: ClarityStatus;
    extractionNotes: string;
    aiFallbackUsed?: boolean;
  };
  warningMessage?: string;
}

export async function runGeminiBillExtraction(storageRef: string): Promise<ApiExtractionResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/ai/extract-bill', {
    method: 'POST',
    headers,
    body: JSON.stringify({ storageRef }),
  });

  const data = await res.json();
  if (res.status === 503 && data.fallbackExtraction) {
    return {
      extraction: data.fallbackExtraction,
      warningMessage: data.error,
    };
  }
  if (!res.ok) {
    throw new Error(data.error || 'Electricity bill analysis failed.');
  }
  return { extraction: data.extraction };
}

export async function runBackendLeadEvaluation(params: {
  ownershipType: 'OWNER' | 'TENANT';
  avgMonthlyBillInr: number;
  rooftopAreaSqFt: number;
  sanctionedLoadKw: number;
  pincode: string;
  monthlyUnitsKwh: number;
  roofType?: string;
  annualGenPerKw?: number;
  includeAiExplanation?: boolean;
}): Promise<LeadScoringOutput> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/leads/evaluate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Backend lead qualification failed.');
  }
  return data.evaluation;
}

export async function runBackendQuotationCalculation(params: {
  quotationDate: string;
  systemCapacityKw: number;
  ownershipType: 'OWNER' | 'TENANT';
  isResidentialTariff: boolean;
  selectedPanelCode?: string;
  selectedTariffCode?: string;
  customInstallationAdjustmentInr?: number;
  customEquipmentAdjustmentInr?: number;
  rules: AdminConfigRuleDoc[];
}): Promise<{
  calculation: QuotationCalculationResult;
  appliedRuleSnapshot: Record<string, string | number | boolean>;
  panelTitle: string;
}> {
  const headers = await getAuthHeaders('SALES');
  const res = await fetch('/api/quotations/calculate', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Quotation calculation failed.');
  }
  return data;
}
