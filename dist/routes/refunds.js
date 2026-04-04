"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const refundEngine_1 = require("../engines/refundEngine");
const prisma_1 = require("../lib/prisma");
const errorHandler_1 = require("../middleware/errorHandler");
const auditEngine_1 = require("../engines/auditEngine");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const RefundRequestSchema = zod_1.z.object({
    caseId: zod_1.z.string().cuid(),
    reason: zod_1.z.string().min(10).max(2000),
});
router.get('/eligibility/:caseId', async (req, res, next) => {
    try {
        const eligibility = await (0, refundEngine_1.assessRefundEligibility)(req.params.caseId, req.userId);
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.REFUND_ELIGIBILITY_CHECKED,
            entityType: 'Case',
            entityId: req.params.caseId,
            metadata: { eligible: eligibility.eligible },
            ...meta,
        });
        res.status(200).json({ success: true, data: eligibility });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const body = RefundRequestSchema.parse(req.body);
        const { refundRequestId } = await (0, refundEngine_1.createRefundRequest)({
            caseId: body.caseId,
            userId: req.userId,
            reason: body.reason,
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: body.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.REFUND_REQUESTED,
            entityType: 'RefundRequest',
            entityId: refundRequestId,
            ...meta,
        });
        res.status(201).json({
            success: true,
            data: {
                refundRequestId,
                message: 'Refund request submitted successfully and is pending review.',
            },
        });
    }
    catch (err) {
        next(err);
    }
});
router.get('/', async (req, res, next) => {
    try {
        const requests = await prisma_1.prisma.refundRequest.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                caseId: true,
                status: true,
                reason: true,
                requestedAmount: true,
                approvedAmount: true,
                currency: true,
                createdAt: true,
                processedAt: true,
                case: { select: { title: true } },
            },
        });
        res.status(200).json({ success: true, data: { requests } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:refundRequestId', async (req, res, next) => {
    try {
        const request = await prisma_1.prisma.refundRequest.findFirst({
            where: {
                id: req.params.refundRequestId,
                userId: req.userId,
            },
            include: { case: { select: { title: true, status: true } } },
        });
        if (!request)
            throw new errorHandler_1.NotFoundError('Refund request');
        res.status(200).json({ success: true, data: { request } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=refunds.js.map