import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { EvidenceType } from '@prisma/client';
import { callAI, buildSystemPrompt } from '../services/aiService';
import { logger } from '../lib/logger';

// ── File Processing ───────────────────────────────────────────────────────────

export interface ProcessedFile {
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256Hash: string;
  extractedText: string | null;
  evidenceType: EvidenceType;
  metadata: Record<string, unknown>;
}

export async function processUploadedFile(
  file: Express.Multer.File
): Promise<ProcessedFile> {
  const sha256Hash = await computeSHA256(file.path);
  const extractedText = await extractText(file);
  const evidenceType = mimeToEvidenceType(file.mimetype);

  const metadata: Record<string, unknown> = {
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    uploadedAt: new Date().toISOString(),
    extension: path.extname(file.originalname).toLowerCase(),
  };

  if (extractedText) {
    metadata.extractedCharCount = extractedText.length;
    metadata.extractedWordCount = extractedText.split(/\s+/).filter(Boolean).length;
  }

  return {
    fileName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    storageKey: file.path,
    sha256Hash,
    extractedText,
    evidenceType,
    metadata,
  };
}

async function computeSHA256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function extractText(file: Express.Multer.File): Promise<string | null> {
  try {
    if (file.mimetype === 'application/pdf') {
      const buffer = fs.readFileSync(file.path);
      const data = await pdfParse(buffer);
      return data.text.slice(0, 50000) || null; // Cap at 50k chars
    }

    if (file.mimetype === 'text/plain') {
      const text = fs.readFileSync(file.path, 'utf-8');
      return text.slice(0, 50000) || null;
    }

    return null;
  } catch (err) {
    logger.warn({ err, fileName: file.originalname }, 'Text extraction failed');
    return null;
  }
}

function mimeToEvidenceType(mimeType: string): EvidenceType {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType === 'text/plain') return 'TEXT';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'DOCUMENT';
  return 'OTHER';
}

// ── Evidence Summary Generation (v1 merged) ──────────────────────────────────

export interface EvidenceSummaryInput {
  caseTitle: string;
  caseDescription: string;
  decisionType: string;
  grounds: string;
  evidenceList: Array<{
    id: string;
    originalName: string;
    evidenceType: string;
    extractedText: string | null;
    summary: string | null;
  }>;
}

export interface EvidenceSummary {
  overallAssessment: string;
  keyFindings: string[];
  evidenceStrengths: string[];
  evidenceWeaknesses: string[];
  missingEvidence: string[];
  recommendedActions: string[];
  evidenceScore: number;
}

export async function generateEvidenceSummary(
  input: EvidenceSummaryInput
): Promise<EvidenceSummary> {
  const systemPrompt = buildSystemPrompt(
    'an expert legal evidence analyst',
    `Analyse the evidence provided for a legal case and generate a comprehensive evidence summary.
    
    RULES:
    - Be factual and objective
    - Identify genuine strengths and weaknesses
    - evidenceScore is 0-100 representing overall evidence quality
    - Flag missing evidence that would strengthen the case
    - Do not fabricate or embellish evidence content`
  );

  const evidenceDescriptions = input.evidenceList
    .map((e, i) => {
      const textPreview = e.extractedText
        ? e.extractedText.slice(0, 2000)
        : e.summary ?? 'No text available';
      return `[Evidence ${i + 1}] ${e.originalName} (${e.evidenceType})\n${textPreview}`;
    })
    .join('\n\n---\n\n');

  const userMessage = `Case: ${input.caseTitle}
Decision Type: ${input.decisionType}
Grounds: ${input.grounds}
Description: ${input.caseDescription}

Evidence submitted (${input.evidenceList.length} items):
${evidenceDescriptions}

Generate evidence summary as JSON:
{
  "overallAssessment": "2-3 sentence overall assessment",
  "keyFindings": ["Finding 1", "Finding 2"],
  "evidenceStrengths": ["Strength 1", "Strength 2"],
  "evidenceWeaknesses": ["Weakness 1", "Weakness 2"],
  "missingEvidence": ["Missing item 1", "Missing item 2"],
  "recommendedActions": ["Action 1", "Action 2"],
  "evidenceScore": 0-100
}`;

  try {
    const response = await callAI({
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2048,
      temperature: 0.2,
    });

    const parsed = JSON.parse(response.content) as EvidenceSummary;
    return validateEvidenceSummary(parsed);
  } catch (err) {
    logger.error({ err }, 'generateEvidenceSummary failed - using fallback');
    return {
      overallAssessment: `${input.evidenceList.length} evidence item(s) submitted for review. Manual assessment required.`,
      keyFindings: ['Evidence submitted for case review'],
      evidenceStrengths: ['Evidence has been documented and preserved'],
      evidenceWeaknesses: ['Automated analysis unavailable - manual review required'],
      missingEvidence: [],
      recommendedActions: ['Submit case for manual review', 'Consult legal advisor'],
      evidenceScore: 50,
    };
  }
}

function validateEvidenceSummary(data: Partial<EvidenceSummary>): EvidenceSummary {
  return {
    overallAssessment:
      typeof data.overallAssessment === 'string'
        ? data.overallAssessment
        : 'Assessment unavailable',
    keyFindings: Array.isArray(data.keyFindings) ? data.keyFindings : [],
    evidenceStrengths: Array.isArray(data.evidenceStrengths) ? data.evidenceStrengths : [],
    evidenceWeaknesses: Array.isArray(data.evidenceWeaknesses) ? data.evidenceWeaknesses : [],
    missingEvidence: Array.isArray(data.missingEvidence) ? data.missingEvidence : [],
    recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions : [],
    evidenceScore:
      typeof data.evidenceScore === 'number'
        ? Math.min(100, Math.max(0, data.evidenceScore))
        : 50,
  };
}

// ── Individual Evidence Item Summary ─────────────────────────────────────────

export async function summariseEvidenceItem(
  originalName: string,
  evidenceType: string,
  extractedText: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(
    'a legal document analyst',
    'Produce a concise 2-3 sentence factual summary of the provided document. Focus on legally relevant content only.'
  );

  try {
    const response = await callAI({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Document: ${originalName} (${evidenceType})\n\nContent:\n${extractedText.slice(0, 3000)}\n\nProvide a concise factual summary as plain text (no JSON).`,
        },
      ],
      maxTokens: 256,
      temperature: 0.1,
    });

    return response.content.trim();
  } catch (err) {
    logger.warn({ err, originalName }, 'Evidence item summarisation failed');
    return `${evidenceType} document: ${originalName}`;
  }
}
