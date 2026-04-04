"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assessRefundEligibility = assessRefundEligibility;
exports.createRefundRequest = createRefundRequest;
exports.processRefundDecision = processRefundDecision;
exports.markRefundProcessed = markRefundProcessed;
const prisma_1 = require("../lib/prisma");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = require("../lib/logger");
const REFUND_BASE_AMOUNT = parseFloat(process.env.REFUND_BASE_AMOUNT ?? '99.00');
const REFUND_CURRENCY = process.env.REFUND_CURRENCY ?? 'GBP';
const REFUND_ELIGIBLE_AFTER_HOURS = parseInt(process.env.REFUND_ELIGIBLE_AFTER_HOURS ?? '24', 10);
async function assessRefundEligibility(caseId, userId) {
    const caseRecord = await prisma_1.prisma.case.findFirst({
        where: { id: caseId, userId },
        include: {
            refundRequests: {
                orderBy: { createdAt: 'desc' },
                take: 1,
            },
        },
    });
    if (!caseRecord) {
        throw new errorHandler_1.NotFoundError('Case');
    }
    if (caseRecord.refundStatus === 'REFUNDED' ||
        caseRecord.refundStatus === 'PROCESSED') {
        return {
            eligible: false,
            reason: 'A refund has already been processed for this case.',
            refundAmount: 0,
            currency: REFUND_CURRENCY,
            eligibilityCheckedAt: new Date().toISOString(),
        };
    }
    if (caseRecord.refundStatus === 'PENDING') {
        return {
            eligible: false,
            reason: 'A refund request is already pending review for this case.',
            refundAmount: 0,
            currency: REFUND_CURRENCY,
            eligibilityCheckedAt: new Date().toISOString(),
        };
    }
    const ineligibleStatuses = ['CLOSED', 'REFUND_REQUESTED', 'REFUNDED'];
    if (ineligibleStatuses.includes(caseRecord.status)) {
        return {
            eligible: false,
            reason: `Cases with status '${caseRecord.status}' are not eligible for refund.`,
            refundAmount: 0,
            currency: REFUND_CURRENCY,
            eligibilityCheckedAt: new Date().toISOString(),
        };
    }
    if (caseRecord.status === 'INTAKE' || caseRecord.status === 'EVIDENCE_PENDING') {
        return {
            eligible: false,
            reason: 'Case must be fully generated before a refund can be requested.',
            refundAmount: 0,
            currency: REFUND_CURRENCY,
            eligibilityCheckedAt: new Date().toISOString(),
        };
    }
    if (caseRecord.generatedAt) {
        const hoursElapsed = (Date.now() - new Date(caseRecord.generatedAt).getTime()) / (1000 * 60 * 60);
        const windowHours = REFUND_ELIGIBLE_AFTER_HOURS * 30;
        if (hoursElapsed > windowHours) {
            return {
                eligible: false,
                reason: `Refund window has expired. Refunds must be requested within 30 days of case generation.`,
                refundAmount: 0,
                currency: REFUND_CURRENCY,
                eligibilityCheckedAt: new Date().toISOString(),
            };
        }
    }
    const refundAmount = calculateRefundAmount(caseRecord);
    return {
        eligible: refundAmount > 0,
        reason: refundAmount > 0
            ? 'This case is eligible for a refund.'
            : 'No refundable amount found for this case.',
        refundAmount,
        currency: caseRecord.refundAmountCurrency ?? REFUND_CURRENCY,
        eligibilityCheckedAt: new Date().toISOString(),
    };
}
function calculateRefundAmount(caseRecord) {
    if (caseRecord.refundAmount !== null && caseRecord.refundAmount > 0) {
        return caseRecord.refundAmount;
    }
    let amount = REFUND_BASE_AMOUNT;
    if (caseRecord.status === 'RESOLVED') {
        amount = REFUND_BASE_AMOUNT * 0.5;
    }
    if (caseRecord.strengthScore !== null) {
        if (caseRecord.strengthScore >= 80) {
            amount = REFUND_BASE_AMOUNT;
        }
        else if (caseRecord.strengthScore >= 50) {
            amount = REFUND_BASE_AMOUNT * 0.75;
        }
    }
    return parseFloat(amount.toFixed(2));
}
async function createRefundRequest(input) {
    const eligibility = await assessRefundEligibility(input.caseId, input.userId);
    if (!eligibility.eligible) {
        throw new errorHandler_1.ConflictError(eligibility.reason);
    }
    if (!input.reason || input.reason.trim().length < 10) {
        throw new errorHandler_1.ValidationError('Refund reason must be at least 10 characters');
    }
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const refundRequest = await tx.refundRequest.create({
            data: {
                caseId: input.caseId,
                userId: input.userId,
                status: 'PENDING',
                reason: input.reason.trim(),
                requestedAmount: eligibility.refundAmount,
                currency: eligibility.currency,
            },
        });
        await tx.case.update({
            where: { id: input.caseId },
            data: {
                refundStatus: 'PENDING',
                refundReason: input.reason.trim(),
                refundRequestedAt: new Date(),
                refundEligible: true,
                status: 'REFUND_REQUESTED',
            },
        });
        return refundRequest;
    });
    logger_1.logger.info({ refundRequestId: result.id, caseId: input.caseId, amount: eligibility.refundAmount }, 'Refund request created');
    return { refundRequestId: result.id };
}
async function processRefundDecision(input) {
    const refundRequest = await prisma_1.prisma.refundRequest.findUnique({
        where: { id: input.refundRequestId },
        include: { case: true },
    });
    if (!refundRequest) {
        throw new errorHandler_1.NotFoundError('Refund request');
    }
    if (refundRequest.status !== 'PENDING') {
        throw new errorHandler_1.ConflictError(`Refund request is already in status '${refundRequest.status}'`);
    }
    if (input.approved && input.approvedAmount !== undefined) {
        if (input.approvedAmount < 0) {
            throw new errorHandler_1.ValidationError('Approved amount cannot be negative');
        }
        if (input.approvedAmount > refundRequest.requestedAmount) {
            throw new errorHandler_1.ValidationError('Approved amount cannot exceed requested amount');
        }
    }
    const newStatus = input.approved ? 'APPROVED' : 'REJECTED';
    const approvedAmount = input.approved
        ? (input.approvedAmount ?? refundRequest.requestedAmount)
        : undefined;
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.refundRequest.update({
            where: { id: input.refundRequestId },
            data: {
                status: newStatus,
                approvedAmount: approvedAmount ?? null,
                adminNotes: input.adminNotes ?? null,
                processedAt: new Date(),
            },
        });
        await tx.case.update({
            where: { id: refundRequest.caseId },
            data: {
                refundStatus: newStatus,
                refundApprovedAt: input.approved ? new Date() : undefined,
                refundAmount: approvedAmount ?? undefined,
                refundNotes: input.adminNotes ?? undefined,
                status: input.approved ? 'REFUNDED' : refundRequest.case.status,
            },
        });
    });
    logger_1.logger.info({
        refundRequestId: input.refundRequestId,
        approved: input.approved,
        approvedAmount,
    }, 'Refund decision processed');
}
async function markRefundProcessed(refundRequestId) {
    const refundRequest = await prisma_1.prisma.refundRequest.findUnique({
        where: { id: refundRequestId },
    });
    if (!refundRequest)
        throw new errorHandler_1.NotFoundError('Refund request');
    if (refundRequest.status !== 'APPROVED') {
        throw new errorHandler_1.ConflictError('Only approved refunds can be marked as processed');
    }
    await prisma_1.prisma.$transaction(async (tx) => {
        await tx.refundRequest.update({
            where: { id: refundRequestId },
            data: { status: 'PROCESSED', processedAt: new Date() },
        });
        await tx.case.update({
            where: { id: refundRequest.caseId },
            data: {
                refundStatus: 'PROCESSED',
                refundProcessedAt: new Date(),
                status: 'CLOSED',
            },
        });
    });
    logger_1.logger.info({ refundRequestId }, 'Refund marked as processed');
}
//# sourceMappingURL=refundEngine.js.map