import { auth } from './firebase.ts';
import type { AdminConfigRuleDoc, ClarityStatus, WorkspaceMode } from '../types/domain.ts';
import type {
  ExtractedBillPayload,
  LeadFormValidationInput,
  LeadScoringOutput,
  QuotationCalculationResult,
  QuotationComparisonOption,
  ValidationResult,
} from '../shared/solarEngine.ts';

/**
 * Configurable API base URL (`VITE_API_BASE_URL`).
 * - Empty string (`""`, default): routes to same-origin `/api/*` so the live preview works seamlessly.
 * - External origin (e.g. `"http://localhost:8080"`): routes all React API requests to the
 *   Java 17 + Spring Boot 3 + MySQL backend in `/backend-java`.
 */
const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
export const API_BASE_URL: string = rawBaseUrl.trim().replace(/\/+$/, '');

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

// Optional in-memory JWT holder when authenticating directly against Spring Boot's /api/auth/login
let springBootJwtToken: string | null = null;

export function setSpringBootJwtToken(token: string | null): void {
  springBootJwtToken = token;
}

async function getAuthHeaders(workspaceMode?: WorkspaceMode): Promise<Record<string, string>> {
  let bearerToken = springBootJwtToken;

  if (!bearerToken) {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('Please sign in first to perform this action.');
    }
    // Token retrieved on demand in memory — never persisted to localStorage
    bearerToken = await user.getIdToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${bearerToken}`,
  };
  if (workspaceMode === 'SALES') {
    headers['X-Workspace-Role'] = 'SALES_STAFF';
  }
  return headers;
}

async function parseJsonResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Authentication required or session expired. Please sign in again.');
      }
      if (res.status === 403) {
        throw new Error('Access denied. Insufficient permissions for this action.');
      }
      if (res.status === 404) {
        throw new Error(`The requested backend endpoint was not found (HTTP 404). Check backend routing.`);
      }
      throw new Error(`Server returned status HTTP ${res.status}: ${res.statusText || 'Unexpected response'}`);
    }
    throw new Error('Server returned non-JSON response. Please verify backend service.');
  }
}

export async function checkBackendHealth(): Promise<{
  ok: boolean;
  region: string;
  backend?: string;
}> {
  const res = await fetch(buildApiUrl('/api/health'));
  if (!res.ok) {
    throw new Error('Backend health check failed.');
  }
  return parseJsonResponse(res);
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
  const res = await fetch(buildApiUrl('/api/bills/upload'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileName: params.file.name,
      mimeType: params.file.type,
      base64Data,
    }),
  });

  params.onProgress?.(90);
  const data = await parseJsonResponse<{
    storageRef: string;
    fileSizeBytes: number;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    fileName: string;
    error?: string;
  }>(res);
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

  const res = await fetch(buildApiUrl(`/api/bills/file/${encodeURIComponent(storageKey)}`), {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    throw new Error('Authorized electricity bill image could not be loaded.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function uploadProtectedProjectDocument(params: {
  projectId: string;
  docId: string;
  file: File;
  ownerUid: string;
  assignedStaffUids: string[];
  uploadedByName: string;
}): Promise<{
  stored: boolean;
  fileSizeKb: number;
  fileName: string;
  createdAt: string;
}> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected document file.'));
    reader.readAsDataURL(params.file);
  });

  const headers = await getAuthHeaders('SALES');
  const res = await fetch(
    buildApiUrl(
      `/api/projects/${encodeURIComponent(params.projectId)}/documents/${encodeURIComponent(params.docId)}/file`
    ),
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileName: params.file.name,
        mimeType: params.file.type,
        base64Data,
        ownerUid: params.ownerUid,
        assignedStaffUids: params.assignedStaffUids,
        uploadedByName: params.uploadedByName,
      }),
    }
  );
  const data = await parseJsonResponse<{
    stored: boolean;
    fileSizeKb: number;
    fileName: string;
    createdAt: string;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Protected document upload failed.');
  }
  return data;
}

export async function downloadProtectedProjectDocument(params: {
  projectId: string;
  docId: string;
  fileName: string;
  workspaceMode?: WorkspaceMode;
}): Promise<void> {
  const headers = await getAuthHeaders(params.workspaceMode);
  delete headers['Content-Type'];

  const res = await fetch(
    buildApiUrl(
      `/api/projects/${encodeURIComponent(params.projectId)}/documents/${encodeURIComponent(params.docId)}/file`
    ),
    {
      method: 'GET',
      headers,
    }
  );
  if (!res.ok) {
    const payload = await parseJsonResponse<{ error?: string }>(res).catch(() => ({}));
    throw new Error(
      (payload as { error?: string }).error ||
        'This sample metadata record does not have an uploaded binary attachment, or access is restricted.'
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = params.fileName || 'Project_Document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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
  const res = await fetch(buildApiUrl('/api/ai/extract-bill'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ storageRef }),
  });

  const data = await parseJsonResponse<{
    extraction?: ApiExtractionResponse['extraction'];
    fallbackExtraction?: ApiExtractionResponse['extraction'];
    warningMessage?: string;
    error?: string;
  }>(res);
  if (res.status === 503 && data.fallbackExtraction) {
    return {
      extraction: data.fallbackExtraction,
      warningMessage: data.error,
    };
  }
  if (!res.ok || !data.extraction) {
    throw new Error(data.error || 'Electricity bill analysis failed.');
  }
  return { extraction: data.extraction };
}

export async function runBackendLeadValidation(
  input: LeadFormValidationInput
): Promise<ValidationResult> {
  const headers = await getAuthHeaders();
  const res = await fetch(buildApiUrl('/api/leads/validate'), {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });
  return parseJsonResponse<ValidationResult>(res);
}

export async function runBackendExtractionValidation(
  payload: ExtractedBillPayload
): Promise<ValidationResult> {
  const headers = await getAuthHeaders();
  const res = await fetch(buildApiUrl('/api/extractions/validate'), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<ValidationResult>(res);
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
  const res = await fetch(buildApiUrl('/api/leads/evaluate'), {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await parseJsonResponse<{ evaluation: LeadScoringOutput; error?: string }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Backend lead qualification failed.');
  }
  return data.evaluation;
}

export async function runBackendQuotationCalculation(params: {
  quotationDate: string;
  systemCapacityKw: number;
  recommendedCapacityKw?: number;
  ownershipType: 'OWNER' | 'TENANT';
  isResidentialTariff: boolean;
  selectedPanelCode?: string;
  selectedTariffCode?: string;
  customInstallationAdjustmentInr?: number;
  customEquipmentAdjustmentInr?: number;
  rules: AdminConfigRuleDoc[];
}): Promise<{
  calculation: QuotationCalculationResult;
  comparisonOptions: QuotationComparisonOption[];
  appliedRuleSnapshot: Record<string, string | number | boolean>;
  panelTitle: string;
}> {
  const headers = await getAuthHeaders('SALES');
  const res = await fetch(buildApiUrl('/api/quotations/calculate'), {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  const data = await parseJsonResponse<{
    calculation: QuotationCalculationResult;
    comparisonOptions: QuotationComparisonOption[];
    appliedRuleSnapshot: Record<string, string | number | boolean>;
    panelTitle: string;
    error?: string;
  }>(res);
  if (!res.ok) {
    throw new Error(data.error || 'Quotation calculation failed.');
  }
  return data;
}
