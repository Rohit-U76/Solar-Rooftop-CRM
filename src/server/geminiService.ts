import { GoogleGenAI, Type } from '@google/genai';
import type { ClarityStatus } from '../types/domain.ts';
import type { LeadScoringInput, LeadScoringOutput } from '../shared/solarEngine.ts';

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function validateImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  // WebP: RIFF....WEBP
  if (mimeType === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }

  return false;
}

export interface GeminiBillExtractionResult {
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
}

export async function analyzeElectricityBillImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<GeminiBillExtractionResult> {
  if (!validateImageMagicBytes(imageBuffer, mimeType)) {
    const err = new Error('Uploaded file failed binary image signature verification. Please upload a valid JPEG, PNG, or WebP photo.');
    (err as Error & { code?: string }).code = 'INVALID_IMAGE_BINARY';
    throw err;
  }

  const ai = getGenAIClient();
  const base64Data = imageBuffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text:
            'Analyse this Indian electricity utility bill image for rooftop solar qualification in Maharashtra/Vidarbha. ' +
            'Extract ONLY values visibly printed on the bill. ' +
            'CRITICAL RULES: ' +
            '1. NEVER invent, guess, or hallucinate missing electricity bill values. ' +
            '2. If a string field is missing or illegible, return an empty string "". ' +
            '3. If a numeric field is missing or illegible, return 0. ' +
            '4. If the image is NOT an electricity bill, is severely blurry, or core values (units and amount) cannot be read, set clarityStatus to "UNCLEAR_REUPLOAD" and confidenceScore below 35. ' +
            '5. If some fields are missing or uncertain, set clarityStatus to "LOW_CONFIDENCE" and confidenceScore between 35 and 74 so staff manually verify it. ' +
            '6. Only set clarityStatus to "CLEAR" (confidenceScore 75-100) when key bill fields are clearly legible.',
        },
      ],
    },
    config: {
      systemInstruction:
        'You are a precision utility document extraction engine for SuryaSetu Solar in Nagpur, India. Output strictly valid JSON matching the schema without fabricating any unreadable data.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          consumerNumber: {
            type: Type.STRING,
            description: 'Printed consumer / account number, or empty string if unreadable.',
          },
          discomName: {
            type: Type.STRING,
            description: 'Electricity distribution company name (e.g., MSEDCL / Mahavitaran / VPDCL), or empty string.',
          },
          tariffCategory: {
            type: Type.STRING,
            description: 'Tariff category such as LT-I Residential or LT-II Commercial, or empty string.',
          },
          sanctionedLoadKw: {
            type: Type.NUMBER,
            description: 'Sanctioned load in kW (convert HP to kW if printed in HP using 0.746, or 0 if not visible).',
          },
          monthlyUnitsKwh: {
            type: Type.NUMBER,
            description: 'Billed electricity consumption in kWh / units, or 0 if unreadable.',
          },
          billingAmountInr: {
            type: Type.NUMBER,
            description: 'Total current bill payable amount in INR, or 0 if unreadable.',
          },
          billingPeriod: {
            type: Type.STRING,
            description: 'Billing month or date range printed on the bill, or empty string.',
          },
          confidenceScore: {
            type: Type.NUMBER,
            description: 'Overall extraction confidence from 0 to 100.',
          },
          clarityStatus: {
            type: Type.STRING,
            description: 'Must be one of CLEAR, LOW_CONFIDENCE, or UNCLEAR_REUPLOAD.',
          },
          extractionNotes: {
            type: Type.STRING,
            description: 'Concise factual note describing readability and any missing fields requiring human verification.',
          },
        },
        required: [
          'consumerNumber',
          'discomName',
          'tariffCategory',
          'sanctionedLoadKw',
          'monthlyUnitsKwh',
          'billingAmountInr',
          'billingPeriod',
          'confidenceScore',
          'clarityStatus',
          'extractionNotes',
        ],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as Partial<GeminiBillExtractionResult>;

  const confidence = Math.max(0, Math.min(100, Math.round(Number(parsed.confidenceScore ?? 0))));
  const units = Math.max(0, Number(parsed.monthlyUnitsKwh ?? 0));
  const amount = Math.max(0, Number(parsed.billingAmountInr ?? 0));

  let clarityStatus: ClarityStatus = 'LOW_CONFIDENCE';
  if (parsed.clarityStatus === 'UNCLEAR_REUPLOAD' || confidence < 35 || (units === 0 && amount === 0)) {
    clarityStatus = 'UNCLEAR_REUPLOAD';
  } else if (parsed.clarityStatus === 'CLEAR' && confidence >= 75 && units > 0 && amount > 0) {
    clarityStatus = 'CLEAR';
  } else {
    clarityStatus = 'LOW_CONFIDENCE';
  }

  return {
    consumerNumber: String(parsed.consumerNumber ?? '').slice(0, 60),
    discomName: String(parsed.discomName ?? '').slice(0, 120),
    tariffCategory: String(parsed.tariffCategory ?? '').slice(0, 80),
    sanctionedLoadKw: Math.max(0, Math.min(500, Number(parsed.sanctionedLoadKw ?? 0))),
    monthlyUnitsKwh: Math.min(200000, units),
    billingAmountInr: Math.min(1000000, amount),
    billingPeriod: String(parsed.billingPeriod ?? '').slice(0, 80),
    confidenceScore: confidence,
    clarityStatus,
    extractionNotes: String(
      parsed.extractionNotes ||
        (clarityStatus === 'UNCLEAR_REUPLOAD'
          ? 'Bill image is unclear or incomplete. Please upload a clearer photo.'
          : clarityStatus === 'LOW_CONFIDENCE'
            ? 'Low extraction confidence on one or more fields; manual verification required.'
            : 'All primary utility fields extracted clearly. Please review and confirm.')
    ).slice(0, 600),
  };
}

export async function generateTransparentAiExplanation(
  input: LeadScoringInput,
  deterministic: LeadScoringOutput
): Promise<string> {
  try {
    const ai = getGenAIClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents:
        `Write a concise 2-sentence explanation (maximum 420 characters) for a Nagpur rooftop solar customer and sales engineer explaining why this enquiry received its deterministic qualification result.\n` +
        `Ownership: ${input.ownershipType}\n` +
        `Monthly Bill: ₹${input.avgMonthlyBillInr}\n` +
        `Monthly Units: ${input.monthlyUnitsKwh} kWh\n` +
        `Roof Area: ${input.rooftopAreaSqFt} sq ft\n` +
        `Sanctioned Load: ${input.sanctionedLoadKw} kW\n` +
        `Pincode: ${input.pincode}\n` +
        `Deterministic Score: ${deterministic.totalScore}/100 (${deterministic.category})\n` +
        `Deterministic Capacity: ${deterministic.recommendationLabel}\n` +
        `Next Action: ${deterministic.nextRecommendedAction}\n` +
        `Do NOT change any numbers, scores, or capacities. Keep tone factual, warm, and transparent.`,
      config: {
        systemInstruction:
          'You explain deterministic solar sizing and qualification results clearly in plain English without inventing subsidies or altering backend numbers.',
      },
    });
    const text = (response.text ?? '').trim();
    if (text.length >= 20) {
      return text.slice(0, 950);
    }
    return deterministic.recommendationReason;
  } catch {
    return deterministic.recommendationReason;
  }
}
