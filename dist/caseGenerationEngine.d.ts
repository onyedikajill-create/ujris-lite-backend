export interface CaseGenerationInput {
    caseId: string;
    title: string;
    description: string;
    decisionType: string;
    grounds: string;
    desiredOutcome: string | null;
    jurisdiction: string | null;
    opposingParty: string | null;
    incidentDate: Date | null;
    submissionDeadline: Date | null;
    intakeData: Record<string, unknown> | null;
    evidenceSummary: string | null;
    evidenceCount: number;
}
export interface GeneratedCase {
    caseDocument: string;
    executiveSummary: string;
    legalArguments: LegalArgument[];
    recommendedActions: RecommendedAction[];
    strengthScore: number;
    riskAssessment: string;
}
export interface LegalArgument {
    heading: string;
    argument: string;
    supportingEvidence: string[];
    strength: 'strong' | 'moderate' | 'weak';
}
export interface RecommendedAction {
    priority: 'immediate' | 'short-term' | 'long-term';
    action: string;
    rationale: string;
    deadline?: string;
}
export declare function generateCaseDocument(input: CaseGenerationInput): Promise<{
    result: GeneratedCase;
    tokensUsed: number;
    processingTimeMs: number;
}>;
//# sourceMappingURL=caseGenerationEngine.d.ts.map