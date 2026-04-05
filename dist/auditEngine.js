"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditActions = void 0;
exports.createAuditLog = createAuditLog;
exports.extractRequestMeta = extractRequestMeta;
exports.getAuditLogsForCase = getAuditLogsForCase;
exports.getAuditLogsForUser = getAuditLogsForUser;
const prisma_1 = require("../lib/prisma");
const logger_1 = require("../lib/logger");
exports.AuditActions = {
    USER_REGISTERED: 'USER_REGISTERED',
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    TOKEN_REVOKED: 'TOKEN_REVOKED',
    CASE_CREATED: 'CASE_CREATED',
    CASE_UPDATED: 'CASE_UPDATED',
    CASE_DELETED: 'CASE_DELETED',
    CASE_GENERATION_STARTED: 'CASE_GENERATION_STARTED',
    CASE_GENERATION_COMPLETED: 'CASE_GENERATION_COMPLETED',
    CASE_GENERATION_FAILED: 'CASE_GENERATION_FAILED',
    CASE_STATUS_CHANGED: 'CASE_STATUS_CHANGED',
    EVIDENCE_UPLOADED: 'EVIDENCE_UPLOADED',
    EVIDENCE_DELETED: 'EVIDENCE_DELETED',
    EVIDENCE_SUMMARY_GENERATED: 'EVIDENCE_SUMMARY_GENERATED',
    INTAKE_QUESTIONS_GENERATED: 'INTAKE_QUESTIONS_GENERATED',
    INTAKE_COMPLETED: 'INTAKE_COMPLETED',
    REFUND_ELIGIBILITY_CHECKED: 'REFUND_ELIGIBILITY_CHECKED',
    REFUND_REQUESTED: 'REFUND_REQUESTED',
    REFUND_APPROVED: 'REFUND_APPROVED',
    REFUND_REJECTED: 'REFUND_REJECTED',
    REFUND_PROCESSED: 'REFUND_PROCESSED',
    ADMIN_CASE_VIEWED: 'ADMIN_CASE_VIEWED',
    ADMIN_CASE_STATUS_CHANGED: 'ADMIN_CASE_STATUS_CHANGED',
    ADMIN_USER_DEACTIVATED: 'ADMIN_USER_DEACTIVATED',
    ADMIN_CONFIG_UPDATED: 'ADMIN_CONFIG_UPDATED',
};
async function createAuditLog(entry) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                caseId: entry.caseId ?? null,
                userId: entry.userId ?? null,
                action: entry.action,
                entityType: entry.entityType,
                entityId: entry.entityId ?? null,
                oldValues: entry.oldValues ?? undefined,
                newValues: entry.newValues ?? undefined,
                ipAddress: entry.ipAddress ?? null,
                userAgent: entry.userAgent ?? null,
                adminKey: entry.adminKey ?? false,
                metadata: entry.metadata ?? undefined,
            },
        });
    }
    catch (err) {
        logger_1.logger.error({ err, action: entry.action }, 'Audit log creation failed');
    }
}
function extractRequestMeta(req) {
    return {
        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
            req.socket.remoteAddress ??
            'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
    };
}
async function getAuditLogsForCase(caseId, limit = 50) {
    return prisma_1.prisma.auditLog.findMany({
        where: { caseId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true,
            action: true,
            entityType: true,
            userId: true,
            adminKey: true,
            metadata: true,
            createdAt: true,
        },
    });
}
async function getAuditLogsForUser(userId, limit = 100) {
    return prisma_1.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
            id: true,
            action: true,
            entityType: true,
            caseId: true,
            adminKey: true,
            createdAt: true,
        },
    });
}
//# sourceMappingURL=auditEngine.js.map