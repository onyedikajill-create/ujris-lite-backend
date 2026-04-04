"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processUploadedFile = processUploadedFile;
exports.generateEvidenceSummary = generateEvidenceSummary;
exports.summariseEvidenceItem = summariseEvidenceItem;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const aiService_1 = require("../services/aiService");
const logger_1 = require("../lib/logger");
async function processUploadedFile(file) {
    const sha256Hash = await computeSHA256(file.path);
    const extractedText = await extractText(file);
    const evidenceType = mimeToEvidenceType(file.mimetype);
    const metadata = {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
        extension: path_1.default.extname(file.originalname).toLowerCase(),
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
async function computeSHA256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto_1.default.createHash('sha256');
        const stream = fs_1.default.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}
async function extractText(file) {
    try {
        if (file.mimetype === 'application/pdf') {
            const buffer = fs_1.default.readFileSync(file.path);
            const data = await (0, pdf_parse_1.default)(buffer);
            return data.text.slice(0, 50000) || null;
        }
        if (file.mimetype === 'text/plain') {
            const text = fs_1.default.readFileSync(file.path, 'utf-8');
            return text.slice(0, 50000) || null;
        }
        return null;
    }
    catch (err) {
        logger_1.logger.warn({ err, fileName: file.originalname }, 'Text extraction failed');
        return null;
    }
}
function mimeToEvidenceType(mimeType) {
    if (mimeType === 'application/pdf')
        return 'PDF';
    if (mimeType.startsWith('image/'))
        return 'IMAGE';
    if (mimeType === 'text/plain')
        return 'TEXT';
    if (mimeType.includes('document') || mimeType.includes('word'))
        return 'DOCUMENT';
    return 'OTHER';
}
async function generateEvidenceSummary(input) {
    const systemPrompt = (0, aiService_1.buildSystemPrompt)('an expert legal evidence analyst', `Analyse the evidence provided for a legal case and generate a comprehensive evidence summary.
    
    RULES:
    - Be factual and objective
    - Identify genuine strengths and weaknesses
    - evidenceScore is 0-100 representing overall evidence quality
    - Flag missing evidence that would strengthen the case
    - Do not fabricate or embellish evidence content`);
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
        const response = await (0, aiService_1.callAI)({
            systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
            maxTokens: 2048,
            temperature: 0.2,
        });
        const parsed = JSON.parse(response.content);
        return validateEvidenceSummary(parsed);
    }
    catch (err) {
        logger_1.logger.error({ err }, 'generateEvidenceSummary failed - using fallback');
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
function validateEvidenceSummary(data) {
    return {
        overallAssessment: typeof data.overallAssessment === 'string'
            ? data.overallAssessment
            : 'Assessment unavailable',
        keyFindings: Array.isArray(data.keyFindings) ? data.keyFindings : [],
        evidenceStrengths: Array.isArray(data.evidenceStrengths) ? data.evidenceStrengths : [],
        evidenceWeaknesses: Array.isArray(data.evidenceWeaknesses) ? data.evidenceWeaknesses : [],
        missingEvidence: Array.isArray(data.missingEvidence) ? data.missingEvidence : [],
        recommendedActions: Array.isArray(data.recommendedActions) ? data.recommendedActions : [],
        evidenceScore: typeof data.evidenceScore === 'number'
            ? Math.min(100, Math.max(0, data.evidenceScore))
            : 50,
    };
}
async function summariseEvidenceItem(originalName, evidenceType, extractedText) {
    const systemPrompt = (0, aiService_1.buildSystemPrompt)('a legal document analyst', 'Produce a concise 2-3 sentence factual summary of the provided document. Focus on legally relevant content only.');
    try {
        const response = await (0, aiService_1.callAI)({
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
    }
    catch (err) {
        logger_1.logger.warn({ err, originalName }, 'Evidence item summarisation failed');
        return `${evidenceType} document: ${originalName}`;
    }
}
//# sourceMappingURL=evidenceEngine.js.map