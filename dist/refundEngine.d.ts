export interface RefundEligibilityResult {
    eligible: boolean;
    reason: string;
    refundAmount: number;
    currency: string;
    eligibilityCheckedAt: string;
}
export interface RefundRequestInput {
    caseId: string;
    userId: string;
    reason: string;
}
export interface RefundDecisionInput {
    refundRequestId: string;
    approved: boolean;
    approvedAmount?: number;
    adminNotes?: string;
}
export declare function assessRefundEligibility(caseId: string, userId: string): Promise<RefundEligibilityResult>;
export declare function createRefundRequest(input: RefundRequestInput): Promise<{
    refundRequestId: string;
}>;
export declare function processRefundDecision(input: RefundDecisionInput): Promise<void>;
export declare function markRefundProcessed(refundRequestId: string): Promise<void>;
//# sourceMappingURL=refundEngine.d.ts.map