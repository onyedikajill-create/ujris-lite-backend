import { Request } from 'express';
export interface AuditLogEntry {
    caseId?: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    adminKey?: boolean;
    metadata?: Record<string, unknown>;
}
export declare const AuditActions: {
    readonly USER_REGISTERED: "USER_REGISTERED";
    readonly USER_LOGIN: "USER_LOGIN";
    readonly USER_LOGOUT: "USER_LOGOUT";
    readonly TOKEN_REVOKED: "TOKEN_REVOKED";
    readonly CASE_CREATED: "CASE_CREATED";
    readonly CASE_UPDATED: "CASE_UPDATED";
    readonly CASE_DELETED: "CASE_DELETED";
    readonly CASE_GENERATION_STARTED: "CASE_GENERATION_STARTED";
    readonly CASE_GENERATION_COMPLETED: "CASE_GENERATION_COMPLETED";
    readonly CASE_GENERATION_FAILED: "CASE_GENERATION_FAILED";
    readonly CASE_STATUS_CHANGED: "CASE_STATUS_CHANGED";
    readonly EVIDENCE_UPLOADED: "EVIDENCE_UPLOADED";
    readonly EVIDENCE_DELETED: "EVIDENCE_DELETED";
    readonly EVIDENCE_SUMMARY_GENERATED: "EVIDENCE_SUMMARY_GENERATED";
    readonly INTAKE_QUESTIONS_GENERATED: "INTAKE_QUESTIONS_GENERATED";
    readonly INTAKE_COMPLETED: "INTAKE_COMPLETED";
    readonly REFUND_ELIGIBILITY_CHECKED: "REFUND_ELIGIBILITY_CHECKED";
    readonly REFUND_REQUESTED: "REFUND_REQUESTED";
    readonly REFUND_APPROVED: "REFUND_APPROVED";
    readonly REFUND_REJECTED: "REFUND_REJECTED";
    readonly REFUND_PROCESSED: "REFUND_PROCESSED";
    readonly ADMIN_CASE_VIEWED: "ADMIN_CASE_VIEWED";
    readonly ADMIN_CASE_STATUS_CHANGED: "ADMIN_CASE_STATUS_CHANGED";
    readonly ADMIN_USER_DEACTIVATED: "ADMIN_USER_DEACTIVATED";
    readonly ADMIN_CONFIG_UPDATED: "ADMIN_CONFIG_UPDATED";
};
export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];
export declare function createAuditLog(entry: AuditLogEntry): Promise<void>;
export declare function extractRequestMeta(req: Request): {
    ipAddress: string;
    userAgent: string;
};
export declare function getAuditLogsForCase(caseId: string, limit?: number): Promise<Array<{
    id: string;
    action: string;
    entityType: string;
    userId: string | null;
    adminKey: boolean;
    metadata: unknown;
    createdAt: Date;
}>>;
export declare function getAuditLogsForUser(userId: string, limit?: number): Promise<Array<{
    id: string;
    action: string;
    entityType: string;
    caseId: string | null;
    adminKey: boolean;
    createdAt: Date;
}>>;
//# sourceMappingURL=auditEngine.d.ts.map