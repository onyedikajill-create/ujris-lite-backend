import { EvidenceType } from '@prisma/client';
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
export declare function processUploadedFile(file: Express.Multer.File): Promise<ProcessedFile>;
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
export declare function generateEvidenceSummary(input: EvidenceSummaryInput): Promise<EvidenceSummary>;
export declare function summariseEvidenceItem(originalName: string, evidenceType: string, extractedText: string): Promise<string>;
//# sourceMappingURL=evidenceEngine.d.ts.map