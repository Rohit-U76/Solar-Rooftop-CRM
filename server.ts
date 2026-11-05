import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  requireAuth,
  verifyResourceAccess,
  type AuthenticatedRequest,
} from './src/server/firebaseAdmin.ts';
import {
  analyzeElectricityBillImage,
  generateTransparentAiExplanation,
  validateDocumentMagicBytes,
  validateImageMagicBytes,
} from './src/server/geminiService.ts';
import {
  buildMultiOptionComparison,
  calculateSolarQuotation,
  evaluateLeadQualification,
  MAX_BILL_FILE_BYTES,
  selectEffectiveRule,
  validateExtractionConfirmation,
  validateLeadSubmission,
  type QuotationCalculationInput,
} from './src/shared/solarEngine.ts';
import type { AdminConfigRuleDoc } from './src/types/domain.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const WORKSPACE_ROOT = process.cwd();
const BILL_STORAGE_DIR = path.join(WORKSPACE_ROOT, '.data', 'bills');
const PROJECT_DOC_STORAGE_DIR = path.join(WORKSPACE_ROOT, '.data', 'project_docs');

fs.mkdirSync(BILL_STORAGE_DIR, { recursive: true });
fs.mkdirSync(PROJECT_DOC_STORAGE_DIR, { recursive: true });

interface StoredBillMeta {
  storageKey: string;
  ownerUid: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
  createdAt: string;
}

interface StoredProjectDocMeta {
  projectId: string;
  docId: string;
  ownerUid: string;
  assignedStaffUids: string[];
  uploadedByUid: string;
  uploadedByName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
  fileName: string;
  fileSizeBytes: number;
  createdAt: string;
}

function getMetaPath(storageKey: string): string {
  return path.join(BILL_STORAGE_DIR, `${storageKey}.meta.json`);
}

function getBinPath(storageKey: string): string {
  return path.join(BILL_STORAGE_DIR, `${storageKey}.bin`);
}

function getProjectDocMetaPath(projectId: string, docId: string): string {
  return path.join(PROJECT_DOC_STORAGE_DIR, `${projectId}__${docId}.meta.json`);
}

function getProjectDocBinPath(projectId: string, docId: string): string {
  return path.join(PROJECT_DOC_STORAGE_DIR, `${projectId}__${docId}.bin`);
}

function resolveBillBuffer(storageRef: string): { buffer: Buffer; mimeType: string } {
  if (storageRef.startsWith('upload:')) {
    const key = storageRef.slice('upload:'.length);
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(key)) {
      throw new Error('Invalid bill storage key.');
    }
    const metaRaw = fs.readFileSync(getMetaPath(key), 'utf8');
    const meta = JSON.parse(metaRaw) as StoredBillMeta;
    const buffer = fs.readFileSync(getBinPath(key));
    return { buffer, mimeType: meta.mimeType };
  }

  if (storageRef.startsWith('/src/assets/images/sample_bill_')) {
    const safeRel = path.normalize(storageRef).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(WORKSPACE_ROOT, safeRel);
    if (!fullPath.startsWith(path.join(WORKSPACE_ROOT, 'src', 'assets', 'images'))) {
      throw new Error('Unauthorized sample asset path.');
    }
    const buffer = fs.readFileSync(fullPath);
    return { buffer, mimeType: 'image/jpeg' };
  }

  throw new Error('Unsupported electricity bill reference.');
}

async function bootstrapServer() {
  const app = express();

  app.use(express.json({ limit: '8mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, region: 'Vidarbha-Nagpur' });
  });

  // 1. Secure Electricity Bill Upload (validates MIME, size, binary signature)
  app.post('/api/bills/upload', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const { fileName, mimeType, base64Data } = req.body as {
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
      };

      if (!fileName || !mimeType || !base64Data) {
        res.status(400).json({ error: 'File name, MIME type, and image payload are required.' });
        return;
      }

      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        res.status(400).json({ error: 'Unsupported format. Please upload JPEG, PNG, or WebP.' });
        return;
      }

      const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
      const buffer = Buffer.from(cleanBase64, 'base64');

      if (buffer.length === 0 || buffer.length > MAX_BILL_FILE_BYTES) {
        res.status(400).json({ error: 'Electricity bill image must be under 5 MB.' });
        return;
      }

      if (!validateImageMagicBytes(buffer, mimeType)) {
        res.status(400).json({
          error:
            'Invalid or corrupted image file. Please upload an authentic JPEG, PNG, or WebP bill photo.',
        });
        return;
      }

      const storageKey = `bill_${crypto.randomBytes(12).toString('hex')}`;
      const meta: StoredBillMeta = {
        storageKey,
        ownerUid: req.user!.uid,
        mimeType: mimeType as StoredBillMeta['mimeType'],
        fileName: String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120),
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(getBinPath(storageKey), buffer);
      fs.writeFileSync(getMetaPath(storageKey), JSON.stringify(meta, null, 2));

      res.json({
        storageRef: `upload:${storageKey}`,
        fileSizeBytes: buffer.length,
        mimeType: meta.mimeType,
        fileName: meta.fileName,
      });
    } catch (error) {
      console.error('Secure bill upload failed:', error);
      res.status(500).json({ error: 'Unable to store electricity bill securely.' });
    }
  });

  // 2. Protected Electricity Bill Image Delivery (RBAC restricted)
  app.get('/api/bills/file/:storageKey', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const storageKey = String(req.params.storageKey || '');
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(storageKey)) {
        res.status(400).json({ error: 'Invalid bill identifier.' });
        return;
      }
      const metaFile = getMetaPath(storageKey);
      if (!fs.existsSync(metaFile)) {
        res.status(404).json({ error: 'Electricity bill file not found.' });
        return;
      }
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as StoredBillMeta;
      const requesterRoleHeader = req.headers['x-workspace-role'] as
        | 'HOMEOWNER'
        | 'SALES_STAFF'
        | 'ADMIN'
        | undefined;
      const access = verifyResourceAccess(req, {
        resourceOwnerUid: meta.ownerUid,
        requesterRole: requesterRoleHeader === 'SALES_STAFF' ? 'SALES_STAFF' : undefined,
      });

      if (!access.allowed) {
        res.status(403).json({ error: access.reason || 'Access denied to customer electricity bill.' });
        return;
      }

      const bin = fs.readFileSync(getBinPath(storageKey));
      res.setHeader('Content-Type', meta.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(bin);
    } catch (error) {
      console.error('Failed to read protected bill:', error);
      res.status(500).json({ error: 'Failed to retrieve electricity bill.' });
    }
  });

  // 2b. Protected Project Document Upload & RBAC-Restricted Delivery
  app.post(
    '/api/projects/:projectId/documents/:docId/file',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const projectId = String(req.params.projectId || '');
        const docId = String(req.params.docId || '');
        if (!/^[a-zA-Z0-9_-]{4,120}$/.test(projectId) || !/^[a-zA-Z0-9_-]{4,120}$/.test(docId)) {
          res.status(400).json({ error: 'Invalid project or document identifier.' });
          return;
        }

        const {
          fileName,
          mimeType,
          base64Data,
          ownerUid,
          assignedStaffUids,
          uploadedByName,
        } = req.body as {
          fileName?: string;
          mimeType?: string;
          base64Data?: string;
          ownerUid?: string;
          assignedStaffUids?: string[];
          uploadedByName?: string;
        };

        const staffList = Array.isArray(assignedStaffUids) ? assignedStaffUids.slice(0, 10) : [];
        const access = verifyResourceAccess(req, {
          assignedStaffUids: staffList,
          requesterRole:
            req.headers['x-workspace-role'] === 'SALES_STAFF' ? 'SALES_STAFF' : undefined,
          requireStaff: true,
        });
        if (!access.allowed) {
          res.status(403).json({ error: access.reason || 'Staff authorization required to upload project documents.' });
          return;
        }

        if (!fileName || !mimeType || !base64Data || !ownerUid) {
          res.status(400).json({ error: 'File name, MIME type, owner UID, and file payload are required.' });
          return;
        }

        const allowedDocMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!allowedDocMimes.includes(mimeType)) {
          res.status(400).json({ error: 'Unsupported document type. Upload PDF, JPEG, PNG, or WebP.' });
          return;
        }

        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length === 0 || buffer.length > MAX_BILL_FILE_BYTES) {
          res.status(400).json({ error: 'Project document file must be between 1 KB and 5 MB.' });
          return;
        }

        if (!validateDocumentMagicBytes(buffer, mimeType)) {
          res.status(400).json({
            error: 'Invalid or corrupted document binary. Upload an authentic PDF, JPEG, PNG, or WebP.',
          });
          return;
        }

        const meta: StoredProjectDocMeta = {
          projectId,
          docId,
          ownerUid: String(ownerUid).slice(0, 128),
          assignedStaffUids: staffList,
          uploadedByUid: req.user!.uid,
          uploadedByName: String(uploadedByName || req.user!.email || 'EPC Engineer').slice(0, 100),
          mimeType: mimeType as StoredProjectDocMeta['mimeType'],
          fileName: String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 140),
          fileSizeBytes: buffer.length,
          createdAt: new Date().toISOString(),
        };

        fs.writeFileSync(getProjectDocBinPath(projectId, docId), buffer);
        fs.writeFileSync(getProjectDocMetaPath(projectId, docId), JSON.stringify(meta, null, 2));

        res.json({
          stored: true,
          fileSizeKb: Math.max(1, Math.round(buffer.length / 1024)),
          fileName: meta.fileName,
          createdAt: meta.createdAt,
        });
      } catch (error) {
        console.error('Protected project document upload failed:', error);
        res.status(500).json({ error: 'Unable to store project document securely.' });
      }
    }
  );

  app.get(
    '/api/projects/:projectId/documents/:docId/file',
    requireAuth,
    (req: AuthenticatedRequest, res) => {
      try {
        const projectId = String(req.params.projectId || '');
        const docId = String(req.params.docId || '');
        if (!/^[a-zA-Z0-9_-]{4,120}$/.test(projectId) || !/^[a-zA-Z0-9_-]{4,120}$/.test(docId)) {
          res.status(400).json({ error: 'Invalid project or document identifier.' });
          return;
        }
        const metaPath = getProjectDocMetaPath(projectId, docId);
        if (!fs.existsSync(metaPath)) {
          res.status(404).json({ error: 'Uploaded binary file not found for this document record.' });
          return;
        }

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as StoredProjectDocMeta;
        const access = verifyResourceAccess(req, {
          resourceOwnerUid: meta.ownerUid,
          assignedStaffUids: meta.assignedStaffUids,
          requesterRole:
            req.headers['x-workspace-role'] === 'SALES_STAFF' ? 'SALES_STAFF' : undefined,
        });

        if (!access.allowed) {
          res.status(403).json({ error: access.reason || 'Access denied to protected project document.' });
          return;
        }

        const bin = fs.readFileSync(getProjectDocBinPath(projectId, docId));
        res.setHeader('Content-Type', meta.mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${meta.fileName.replace(/"/g, '')}"`
        );
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(bin);
      } catch (error) {
        console.error('Protected project document read failed:', error);
        res.status(500).json({ error: 'Unable to download protected project document.' });
      }
    }
  );

  // 3. Gemini Vision Electricity Bill Analysis (Server-side @google/genai)
  app.post('/api/ai/extract-bill', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { storageRef } = req.body as { storageRef?: string };
      if (!storageRef) {
        res.status(400).json({ error: 'Electricity bill storageRef is required.' });
        return;
      }

      const { buffer, mimeType } = resolveBillBuffer(storageRef);
      const extraction = await analyzeElectricityBillImage(buffer, mimeType);
      res.json({ extraction });
    } catch (error: unknown) {
      console.error('Gemini Vision extraction error:', error);
      const errObj = error as Error & { code?: string; status?: number };

      if (errObj.code === 'INVALID_IMAGE_BINARY') {
        res.status(400).json({ error: errObj.message, code: 'INVALID_IMAGE_BINARY' });
        return;
      }

      // Graceful OCR / Manual Verification Fallback when AI service is unavailable or rate-limited
      res.status(503).json({
        error:
          errObj.message === 'GEMINI_API_KEY_NOT_CONFIGURED'
            ? 'AI Vision key is not configured in Settings > Secrets. Marked bill for manual verification.'
            : 'AI Vision analysis is temporarily unavailable. Please verify and enter bill details manually.',
        code: 'AI_SERVICE_UNAVAILABLE',
        fallbackExtraction: {
          consumerNumber: '',
          discomName: 'MSEDCL (Mahavitaran)',
          tariffCategory: 'LT-I Residential',
          sanctionedLoadKw: 0,
          monthlyUnitsKwh: 0,
          billingAmountInr: 0,
          billingPeriod: '',
          confidenceScore: 0,
          clarityStatus: 'LOW_CONFIDENCE',
          extractionNotes:
            'Automated vision service unavailable at scan time. Flagged for mandatory manual verification; no values were guessed.',
          aiFallbackUsed: true,
        },
      });
    }
  });

  // 4. Deterministic Lead Validation + Qualification + AI Narrative Explanation
  app.post('/api/leads/evaluate', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const {
        ownershipType,
        avgMonthlyBillInr,
        rooftopAreaSqFt,
        sanctionedLoadKw,
        pincode,
        monthlyUnitsKwh,
        roofType,
        annualGenPerKw,
        includeAiExplanation,
      } = req.body;

      const deterministic = evaluateLeadQualification({
        ownershipType,
        avgMonthlyBillInr: Number(avgMonthlyBillInr ?? 0),
        rooftopAreaSqFt: Number(rooftopAreaSqFt ?? 0),
        sanctionedLoadKw: Number(sanctionedLoadKw ?? 0),
        pincode: String(pincode ?? ''),
        monthlyUnitsKwh: Number(monthlyUnitsKwh ?? 0),
        roofType,
        annualGenPerKw: Number(annualGenPerKw ?? 1400),
      });

      if (includeAiExplanation) {
        const explanation = await generateTransparentAiExplanation(
          {
            ownershipType,
            avgMonthlyBillInr: Number(avgMonthlyBillInr ?? 0),
            rooftopAreaSqFt: Number(rooftopAreaSqFt ?? 0),
            sanctionedLoadKw: Number(sanctionedLoadKw ?? 0),
            pincode: String(pincode ?? ''),
            monthlyUnitsKwh: Number(monthlyUnitsKwh ?? 0),
            roofType,
          },
          deterministic
        );
        deterministic.recommendationReason = explanation;
      }

      res.json({ evaluation: deterministic });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lead evaluation failed.';
      res.status(400).json({ error: msg });
    }
  });

  // 5. Backend Validation Endpoint for Lead Form & Bill Extraction Confirmation
  app.post('/api/leads/validate', requireAuth, (req: AuthenticatedRequest, res) => {
    const result = validateLeadSubmission(req.body);
    if (!result.valid) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/extractions/validate', requireAuth, (req: AuthenticatedRequest, res) => {
    const result = validateExtractionConfirmation(req.body);
    if (!result.valid) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  // 6. Deterministic Backend Quotation & Multi-Option Comparison Calculator
  app.post('/api/quotations/calculate', requireAuth, (req: AuthenticatedRequest, res) => {
    try {
      const {
        quotationDate,
        systemCapacityKw,
        recommendedCapacityKw,
        ownershipType,
        isResidentialTariff,
        selectedPanelCode,
        selectedTariffCode,
        customInstallationAdjustmentInr,
        customEquipmentAdjustmentInr,
        rules,
      } = req.body as {
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
      };

      if (!Array.isArray(rules) || rules.length === 0) {
        res.status(400).json({ error: 'Configuration rules are required to compute a quotation.' });
        return;
      }

      const solarRules = rules.filter((r) => r.ruleCategory === 'SOLAR_OPTION');
      const subsidyRules = rules.filter((r) => r.ruleCategory === 'SUBSIDY_RULE');
      const pricingRules = rules.filter((r) => r.ruleCategory === 'PRICING_RULE');
      const tariffRules = rules.filter((r) => r.ruleCategory === 'ELECTRICITY_TARIFF');

      const panelRule = selectEffectiveRule(solarRules, quotationDate, selectedPanelCode);
      const subsidyRuleDoc = selectEffectiveRule(subsidyRules, quotationDate);
      const pricingRule = selectEffectiveRule(pricingRules, quotationDate);
      const tariffRule = selectEffectiveRule(tariffRules, quotationDate, selectedTariffCode);

      const configuredAnnualGen =
        Number(pricingRule.parameters.annualGenPerKw || 0) > 0
          ? Number(pricingRule.parameters.annualGenPerKw)
          : Number(panelRule.parameters.annualGenPerKw || 1400);

      const baseBosFlatInr = Number(pricingRule.parameters.bosFlatInr ?? 12000);
      const calcInput: QuotationCalculationInput = {
        systemCapacityKw: Number(systemCapacityKw),
        ownershipType,
        isResidentialTariff: Boolean(isResidentialTariff),
        panelPricePerKwInr: Number(panelRule.parameters.pricePerKwInr ?? 42000),
        annualGenPerKw: configuredAnnualGen,
        installationPerKwInr: Number(pricingRule.parameters.installationPerKwInr ?? 11000),
        bosAndNetMeteringFlatInr: baseBosFlatInr + Number(customInstallationAdjustmentInr ?? 0),
        customEquipmentAdjustmentInr: Number(customEquipmentAdjustmentInr ?? 0),
        electricityTariffInr: Number(tariffRule.parameters.tariffPerUnitInr ?? 8.5),
        selfConsumptionRatio: Number(pricingRule.parameters.selfConsumptionRatio ?? 1.0),
        subsidyRule: {
          firstTierMaxKw: Number(subsidyRuleDoc.parameters.firstTierMaxKw ?? 2),
          firstTierRateInr: Number(subsidyRuleDoc.parameters.firstTierRateInr ?? 30000),
          secondTierMaxKw: Number(subsidyRuleDoc.parameters.secondTierMaxKw ?? 3),
          secondTierRateInr: Number(subsidyRuleDoc.parameters.secondTierRateInr ?? 18000),
          maxSubsidyCapInr: Number(subsidyRuleDoc.parameters.maxSubsidyCapInr ?? 78000),
          residentialOnly: Boolean(subsidyRuleDoc.parameters.residentialOnly ?? true),
        },
      };

      const calculation = calculateSolarQuotation(calcInput);
      const comparisonOptions = buildMultiOptionComparison(calcInput, recommendedCapacityKw);

      // 23 keys strictly <= 25 key limit in firestore.rules
      const appliedRuleSnapshot: Record<string, string | number | boolean> = {
        quotationDate,
        panelRuleCode: panelRule.code,
        panelRuleTitle: panelRule.title,
        panelRuleVersion: panelRule.versionNumber,
        panelPricePerKwInr: calcInput.panelPricePerKwInr,
        annualGenPerKw: calcInput.annualGenPerKw,
        subsidyRuleCode: subsidyRuleDoc.code,
        subsidyRuleTitle: subsidyRuleDoc.title,
        subsidyRuleVersion: subsidyRuleDoc.versionNumber,
        subsidyEffectiveFrom: subsidyRuleDoc.effectiveFrom,
        subsidyEffectiveTo: subsidyRuleDoc.effectiveTo,
        subsidyFirstTierMaxKw: calcInput.subsidyRule.firstTierMaxKw,
        subsidyFirstTierRateInr: calcInput.subsidyRule.firstTierRateInr,
        subsidySecondTierMaxKw: calcInput.subsidyRule.secondTierMaxKw,
        subsidySecondTierRateInr: calcInput.subsidyRule.secondTierRateInr,
        subsidyMaxCapInr: calcInput.subsidyRule.maxSubsidyCapInr,
        subsidyResidentialOnly: calcInput.subsidyRule.residentialOnly,
        pricingRuleCode: pricingRule.code,
        pricingRuleVersion: pricingRule.versionNumber,
        installationPerKwInr: calcInput.installationPerKwInr,
        bosFlatInr: calcInput.bosAndNetMeteringFlatInr,
        tariffRuleCode: tariffRule.code,
        tariffRuleVersion: tariffRule.versionNumber,
        tariffPerUnitInr: calcInput.electricityTariffInr,
        isResidentialTariff: calcInput.isResidentialTariff,
      };

      res.json({
        calculation,
        comparisonOptions,
        appliedRuleSnapshot,
        panelTitle: panelRule.title,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Quotation calculation failed.';
      res.status(400).json({ error: msg });
    }
  });

  // Vite dev middleware or production static assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(WORKSPACE_ROOT, 'dist');
    app.use(express.static(distPath));
    // Serve generated sample bill assets if referenced directly in production
    app.use('/src/assets', express.static(path.join(WORKSPACE_ROOT, 'src', 'assets')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SuryaSetu Solar server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrapServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
