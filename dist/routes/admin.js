"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
const refundEngine_1 = require("../engines/refundEngine");
const errorHandler_1 = require("../middleware/errorHandler");
const auditEngine_1 = require("../engines/auditEngine");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
router.use(auth_1.requireAdminKey);
router.get('/cases', async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
        const status = req.query.status;
        const userId = req.query.userId;
        const skip = (page - 1) * limit;
        const where = {
            ...(status ? { status } : {}),
            ...(userId ? { userId } : {}),
        };
        const [cases, total] = await Promise.all([
            prisma_1.prisma.case.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    title: true,
                    status: true,
                    refundStatus: true,
                    decisionType: true,
                    grounds: true,
                    strengthScore: true,
                    createdAt: true,
                    generatedAt: true,
                    user: { select: { id: true, name: true, email: true } },
                    _count: { select: { evidence: true } },
                },
            }),
            prisma_1.prisma.case.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            data: {
                cases,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/cases/:caseId', async (req, res, next) => {
    try {
        const caseRecord = await prisma_1.prisma.case.findUnique({
            where: { id: req.params.caseId },
            include: {
                user: { select: { id: true, name: true, email: true } },
                evidence: true,
                refundRequests: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!caseRecord)
            throw new errorHandler_1.NotFoundError('Case');
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            action: auditEngine_1.AuditActions.ADMIN_CASE_VIEWED,
            entityType: 'Case',
            entityId: req.params.caseId,
            adminKey: true,
            ...meta,
        });
        res.status(200).json({ success: true, data: { case: caseRecord } });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/cases/:caseId/status', async (req, res, next) => {
    try {
        const StatusSchema = zod_1.z.object({
            status: zod_1.z.nativeEnum(client_1.CaseStatus),
            notes: zod_1.z.string().max(1000).optional(),
        });
        const body = StatusSchema.parse(req.body);
        const existing = await prisma_1.prisma.case.findUnique({
            where: { id: req.params.caseId },
            select: { id: true, status: true },
        });
        if (!existing)
            throw new errorHandler_1.NotFoundError('Case');
        const updated = await prisma_1.prisma.case.update({
            where: { id: req.params.caseId },
            data: { status: body.status },
            select: { id: true, status: true, updatedAt: true },
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            action: auditEngine_1.AuditActions.ADMIN_CASE_STATUS_CHANGED,
            entityType: 'Case',
            entityId: req.params.caseId,
            oldValues: { status: existing.status },
            newValues: { status: body.status },
            adminKey: true,
            metadata: { notes: body.notes },
            ...meta,
        });
        res.status(200).json({ success: true, data: { case: updated } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/cases/:caseId/audit', async (req, res, next) => {
    try {
        const logs = await (0, auditEngine_1.getAuditLogsForCase)(req.params.caseId, 200);
        res.status(200).json({ success: true, data: { logs } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/refunds', async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const where = status ? { status: status } : {};
        const [requests, total] = await Promise.all([
            prisma_1.prisma.refundRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    case: { select: { title: true, status: true } },
                },
            }),
            prisma_1.prisma.refundRequest.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            data: {
                requests,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/refunds/:refundRequestId/decide', async (req, res, next) => {
    try {
        const DecisionSchema = zod_1.z.object({
            approved: zod_1.z.boolean(),
            approvedAmount: zod_1.z.number().positive().optional(),
            adminNotes: zod_1.z.string().max(2000).optional(),
        });
        const body = DecisionSchema.parse(req.body);
        await (0, refundEngine_1.processRefundDecision)({
            refundRequestId: req.params.refundRequestId,
            approved: body.approved,
            approvedAmount: body.approvedAmount,
            adminNotes: body.adminNotes,
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        const action = body.approved ? auditEngine_1.AuditActions.REFUND_APPROVED : auditEngine_1.AuditActions.REFUND_REJECTED;
        await (0, auditEngine_1.createAuditLog)({
            action,
            entityType: 'RefundRequest',
            entityId: req.params.refundRequestId,
            adminKey: true,
            metadata: { approved: body.approved, approvedAmount: body.approvedAmount },
            ...meta,
        });
        res.status(200).json({
            success: true,
            data: {
                message: `Refund request ${body.approved ? 'approved' : 'rejected'} successfully`,
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/refunds/:refundRequestId/process', async (req, res, next) => {
    try {
        await (0, refundEngine_1.markRefundProcessed)(req.params.refundRequestId);
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            action: auditEngine_1.AuditActions.REFUND_PROCESSED,
            entityType: 'RefundRequest',
            entityId: req.params.refundRequestId,
            adminKey: true,
            ...meta,
        });
        res.status(200).json({
            success: true,
            data: { message: 'Refund marked as processed and case closed' },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/users', async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
        const skip = (page - 1) * limit;
        const [users, total] = await Promise.all([
            prisma_1.prisma.user.findMany({
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    _count: { select: { cases: true } },
                },
            }),
            prisma_1.prisma.user.count(),
        ]);
        res.status(200).json({
            success: true,
            data: {
                users,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/users/:userId/deactivate', async (req, res, next) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.params.userId },
            select: { id: true, isActive: true },
        });
        if (!user)
            throw new errorHandler_1.NotFoundError('User');
        await prisma_1.prisma.user.update({
            where: { id: req.params.userId },
            data: { isActive: false },
        });
        await prisma_1.prisma.authToken.updateMany({
            where: { userId: req.params.userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            userId: req.params.userId,
            action: auditEngine_1.AuditActions.ADMIN_USER_DEACTIVATED,
            entityType: 'User',
            entityId: req.params.userId,
            adminKey: true,
            ...meta,
        });
        res.status(200).json({ success: true, data: { message: 'User deactivated' } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/stats', async (_req, res, next) => {
    try {
        const [totalCases, activeCases, totalUsers, pendingRefunds, approvedRefunds, avgStrengthScore,] = await Promise.all([
            prisma_1.prisma.case.count(),
            prisma_1.prisma.case.count({ where: { status: 'ACTIVE' } }),
            prisma_1.prisma.user.count({ where: { isActive: true } }),
            prisma_1.prisma.refundRequest.count({ where: { status: 'PENDING' } }),
            prisma_1.prisma.refundRequest.count({ where: { status: 'APPROVED' } }),
            prisma_1.prisma.case.aggregate({
                _avg: { strengthScore: true },
                where: { strengthScore: { not: null } },
            }),
        ]);
        const casesByStatus = await prisma_1.prisma.case.groupBy({
            by: ['status'],
            _count: true,
        });
        res.status(200).json({
            success: true,
            data: {
                totalCases,
                activeCases,
                totalUsers,
                pendingRefunds,
                approvedRefunds,
                avgStrengthScore: avgStrengthScore._avg.strengthScore ?? null,
                casesByStatus: casesByStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/audit', async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
        const action = req.query.action;
        const skip = (page - 1) * limit;
        const where = action ? { action } : {};
        const [logs, total] = await Promise.all([
            prisma_1.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma_1.prisma.auditLog.count({ where }),
        ]);
        res.status(200).json({
            success: true,
            data: {
                logs,
                pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            },
        });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map