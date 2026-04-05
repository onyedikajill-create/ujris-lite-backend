import { z } from 'zod';
export declare const CreateIntakeSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    decisionType: z.ZodDefault<z.ZodNativeEnum<{
        APPEAL: "APPEAL";
        COMPLAINT: "COMPLAINT";
        DISPUTE: "DISPUTE";
        TRIBUNAL: "TRIBUNAL";
        ARBITRATION: "ARBITRATION";
        MEDIATION: "MEDIATION";
        FORMAL_GRIEVANCE: "FORMAL_GRIEVANCE";
        OTHER: "OTHER";
    }>>;
    grounds: z.ZodDefault<z.ZodNativeEnum<{
        DISCRIMINATION: "DISCRIMINATION";
        BREACH_OF_CONTRACT: "BREACH_OF_CONTRACT";
        UNFAIR_DISMISSAL: "UNFAIR_DISMISSAL";
        NEGLIGENCE: "NEGLIGENCE";
        PROCEDURAL_IRREGULARITY: "PROCEDURAL_IRREGULARITY";
        HUMAN_RIGHTS_VIOLATION: "HUMAN_RIGHTS_VIOLATION";
        CONSUMER_RIGHTS: "CONSUMER_RIGHTS";
        DATA_PROTECTION: "DATA_PROTECTION";
        OTHER: "OTHER";
    }>>;
    desiredOutcome: z.ZodOptional<z.ZodString>;
    jurisdiction: z.ZodOptional<z.ZodString>;
    opposingParty: z.ZodOptional<z.ZodString>;
    incidentDate: z.ZodOptional<z.ZodString>;
    submissionDeadline: z.ZodOptional<z.ZodString>;
    intakeData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string;
    decisionType: "APPEAL" | "COMPLAINT" | "DISPUTE" | "TRIBUNAL" | "ARBITRATION" | "MEDIATION" | "FORMAL_GRIEVANCE" | "OTHER";
    grounds: "OTHER" | "DISCRIMINATION" | "BREACH_OF_CONTRACT" | "UNFAIR_DISMISSAL" | "NEGLIGENCE" | "PROCEDURAL_IRREGULARITY" | "HUMAN_RIGHTS_VIOLATION" | "CONSUMER_RIGHTS" | "DATA_PROTECTION";
    desiredOutcome?: string | undefined;
    jurisdiction?: string | undefined;
    opposingParty?: string | undefined;
    incidentDate?: string | undefined;
    submissionDeadline?: string | undefined;
    intakeData?: Record<string, unknown> | undefined;
}, {
    title: string;
    description: string;
    decisionType?: "APPEAL" | "COMPLAINT" | "DISPUTE" | "TRIBUNAL" | "ARBITRATION" | "MEDIATION" | "FORMAL_GRIEVANCE" | "OTHER" | undefined;
    grounds?: "OTHER" | "DISCRIMINATION" | "BREACH_OF_CONTRACT" | "UNFAIR_DISMISSAL" | "NEGLIGENCE" | "PROCEDURAL_IRREGULARITY" | "HUMAN_RIGHTS_VIOLATION" | "CONSUMER_RIGHTS" | "DATA_PROTECTION" | undefined;
    desiredOutcome?: string | undefined;
    jurisdiction?: string | undefined;
    opposingParty?: string | undefined;
    incidentDate?: string | undefined;
    submissionDeadline?: string | undefined;
    intakeData?: Record<string, unknown> | undefined;
}>;
export declare const UpdateIntakeSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    decisionType: z.ZodOptional<z.ZodNativeEnum<{
        APPEAL: "APPEAL";
        COMPLAINT: "COMPLAINT";
        DISPUTE: "DISPUTE";
        TRIBUNAL: "TRIBUNAL";
        ARBITRATION: "ARBITRATION";
        MEDIATION: "MEDIATION";
        FORMAL_GRIEVANCE: "FORMAL_GRIEVANCE";
        OTHER: "OTHER";
    }>>;
    grounds: z.ZodOptional<z.ZodNativeEnum<{
        DISCRIMINATION: "DISCRIMINATION";
        BREACH_OF_CONTRACT: "BREACH_OF_CONTRACT";
        UNFAIR_DISMISSAL: "UNFAIR_DISMISSAL";
        NEGLIGENCE: "NEGLIGENCE";
        PROCEDURAL_IRREGULARITY: "PROCEDURAL_IRREGULARITY";
        HUMAN_RIGHTS_VIOLATION: "HUMAN_RIGHTS_VIOLATION";
        CONSUMER_RIGHTS: "CONSUMER_RIGHTS";
        DATA_PROTECTION: "DATA_PROTECTION";
        OTHER: "OTHER";
    }>>;
    desiredOutcome: z.ZodOptional<z.ZodString>;
    jurisdiction: z.ZodOptional<z.ZodString>;
    opposingParty: z.ZodOptional<z.ZodString>;
    incidentDate: z.ZodOptional<z.ZodString>;
    submissionDeadline: z.ZodOptional<z.ZodString>;
    intakeData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    description?: string | undefined;
    decisionType?: "APPEAL" | "COMPLAINT" | "DISPUTE" | "TRIBUNAL" | "ARBITRATION" | "MEDIATION" | "FORMAL_GRIEVANCE" | "OTHER" | undefined;
    grounds?: "OTHER" | "DISCRIMINATION" | "BREACH_OF_CONTRACT" | "UNFAIR_DISMISSAL" | "NEGLIGENCE" | "PROCEDURAL_IRREGULARITY" | "HUMAN_RIGHTS_VIOLATION" | "CONSUMER_RIGHTS" | "DATA_PROTECTION" | undefined;
    desiredOutcome?: string | undefined;
    jurisdiction?: string | undefined;
    opposingParty?: string | undefined;
    incidentDate?: string | undefined;
    submissionDeadline?: string | undefined;
    intakeData?: Record<string, unknown> | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
    decisionType?: "APPEAL" | "COMPLAINT" | "DISPUTE" | "TRIBUNAL" | "ARBITRATION" | "MEDIATION" | "FORMAL_GRIEVANCE" | "OTHER" | undefined;
    grounds?: "OTHER" | "DISCRIMINATION" | "BREACH_OF_CONTRACT" | "UNFAIR_DISMISSAL" | "NEGLIGENCE" | "PROCEDURAL_IRREGULARITY" | "HUMAN_RIGHTS_VIOLATION" | "CONSUMER_RIGHTS" | "DATA_PROTECTION" | undefined;
    desiredOutcome?: string | undefined;
    jurisdiction?: string | undefined;
    opposingParty?: string | undefined;
    incidentDate?: string | undefined;
    submissionDeadline?: string | undefined;
    intakeData?: Record<string, unknown> | undefined;
}>;
export type CreateIntakeInput = z.infer<typeof CreateIntakeSchema>;
export type UpdateIntakeInput = z.infer<typeof UpdateIntakeSchema>;
interface NextQuestion {
    id: string;
    question: string;
    type: 'text' | 'date' | 'select' | 'boolean';
    required: boolean;
    options?: string[];
}
interface NextQuestionsResult {
    questions: NextQuestion[];
    intakeComplete: boolean;
    completionScore: number;
}
export declare function generateNextQuestions(caseData: {
    title: string;
    description: string;
    decisionType: string;
    grounds: string;
    desiredOutcome?: string | null;
    jurisdiction?: string | null;
    opposingParty?: string | null;
    incidentDate?: Date | null;
    submissionDeadline?: Date | null;
    intakeData?: Record<string, unknown> | null;
}): Promise<NextQuestionsResult>;
export declare function validateIntakeCompleteness(caseData: {
    title: string;
    description: string;
    decisionType: string;
    grounds: string;
    desiredOutcome?: string | null;
    jurisdiction?: string | null;
}): {
    valid: boolean;
    missingFields: string[];
};
export {};
//# sourceMappingURL=intakeEngine.d.ts.map