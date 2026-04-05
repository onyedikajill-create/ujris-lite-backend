import { CaseStatus, RefundStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

// ── Config ────────────────────────────────────────────────────────────────────

const REFUND_BASE_AMOUNT = parseFloat(process.env.REFUND_BASE_AMOUNT ?? '99.00');
const REFUND_CURRENCY = process.env.REFUND_CURRENCY ?? 'GBP';
const REFUND_ELIGIBLE_AFTER_HOURS = parseInt(
  process.env.REFUND_ELIGIBLE_AFTER_HOURS ?? '24',
  10
);

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Eligibility Assessment (v1 output-based + v2 status-based merged) ─────────

export async function assessRefundEligibility(
  caseId: string,
  userId: string
): Promise<RefundEligibilityResult> {
  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, userId },
    include: {
      refundRequests: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!caseRecord) {
    throw new NotFoundError('Case');
  }

  // Already refunded
  if (
    caseRecord.status === 'REFUNDED' ||
    caseRecord.refundStatus === 'PROCESSED'
  ) {
    return {
      eligible: false,
      reason: 'A refund has already been processed for this case.',
      refundAmount: 0,
      currency: REFUND_CURRENCY,
      eligibilityCheckedAt: new Date().toISOString(),
    };
  }

  // Pending refund request already exists
  if (caseRecord.refundStatus === 'PENDING') {
    return {
      eligible: false,
      reason: 'A refund request is already pending review for this case.',
      refundAmount: 0,
      currency: REFUND_CURRENCY,
      eligibilityCheckedAt: new Date().toISOString(),
    };
  }

  // Status-based eligibility (v2 logic)
  const ineligibleStatuses: CaseStatus[] = ['CLOSED', 'REFUND_REQUESTED', 'REFUNDED'];
  if (ineligibleStatuses.includes(caseRecord.status)) {
    return {
      eligible: false,
      reason: `Cases with status '${caseRecord.status}' are not eligible for refund.`,
      refundAmount: 0,
      currency: REFUND_CURRENCY,
      eligibilityCheckedAt: new Date().toISOString(),
    };
  }

  // Output-based eligibility (v1 logic): case must have been generated
  if (caseRecord.status === 'INTAKE' || caseRecord.status === 'EVIDENCE_PENDING') {
    return {
      eligible: false,
      reason: 'Case must be fully generated before a refund can be requested.',
      refundAmount: 0,
      currency: REFUND_CURRENCY,
      eligibilityCheckedAt: new Date().toISOString(),
    };
  }

  // Time-based eligibility: must be within eligibility window (v1 logic)
  if (caseRecord.generatedAt) {
    const hoursElapsed =
      (Date.now() - new Date(caseRecord.generatedAt).getTime()) / (1000 * 60 * 60);
    const windowHours = REFUND_ELIGIBLE_AFTER_HOURS * 30; // 30-day window after generation

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

  // Calculate refund amount (v1 refundAmount calculation)
  const refundAmount = calculateRefundAmount(caseRecord);

  return {
    eligible: refundAmount > 0,
    reason:
      refundAmount > 0
        ? 'This case is eligible for a refund.'
        : 'No refundable amount found for this case.',
    refundAmount,
    currency: caseRecord.refundAmountCurrency ?? REFUND_CURRENCY,
    eligibilityCheckedAt: new Date().toISOString(),
  };
}

function calculateRefundAmount(caseRecord: {
  refundAmount: number | null;
  refundAmountCurrency: string | null;
  status: CaseStatus;
  strengthScore: number | null;
}): number {
  // Use stored refund amount if set
  if (caseRecord.refundAmount !== null && caseRecord.refundAmount > 0) {
    return caseRecord.refundAmount;
  }

  // Default to base amount
  let amount = REFUND_BASE_AMOUNT;

  // Partial refund for resolved cases
  if (caseRecord.status === 'RESOLVED') {
    amount = REFUND_BASE_AMOUNT * 0.5;
  }

  // Adjust based on strength score if available (v1 logic)
  if (caseRecord.strengthScore !== null) {
    if (caseRecord.strengthScore >= 80) {
      // High-strength case: full refund eligibility maintained
      amount = REFUND_BASE_AMOUNT;
    } else if (caseRecord.strengthScore >= 50) {
      // Medium-strength case: pro-rated
      amount = REFUND_BASE_AMOUNT * 0.75;
    }
    // Low-strength: standard base amount
  }

  return parseFloat(amount.toFixed(2));
}

// ── Request Processing ────────────────────────────────────────────────────────

export async function createRefundRequest(
  input: RefundRequestInput
): Promise<{ refundRequestId: string }> {
  const eligibility = await assessRefundEligibility(input.caseId, input.userId);

  if (!eligibility.eligible) {
    throw new ConflictError(eligibility.reason);
  }

  if (!input.reason || input.reason.trim().length < 10) {
    throw new ValidationError('Refund reason must be at least 10 characters');
  }

  const result = await prisma.$transaction(async (tx) => {
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

  logger.info(
    { refundRequestId: result.id, caseId: input.caseId, amount: eligibility.refundAmount },
    'Refund request created'
  );

  return { refundRequestId: result.id };
}

// ── Admin Decision ────────────────────────────────────────────────────────────

export async function processRefundDecision(
  input: RefundDecisionInput
): Promise<void> {
  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id: input.refundRequestId },
    include: { case: true },
  });

  if (!refundRequest) {
    throw new NotFoundError('Refund request');
  }

  if (refundRequest.status !== 'PENDING') {
    throw new ConflictError(
      `Refund request is already in status '${refundRequest.status}'`
    );
  }

  if (input.approved && input.approvedAmount !== undefined) {
    if (input.approvedAmount < 0) {
      throw new ValidationError('Approved amount cannot be negative');
    }
    if (input.approvedAmount > refundRequest.requestedAmount) {
      throw new ValidationError('Approved amount cannot exceed requested amount');
    }
  }

  const newStatus: RefundStatus = input.approved ? 'APPROVED' : 'REJECTED';
  const approvedAmount = input.approved
    ? (input.approvedAmount ?? refundRequest.requestedAmount)
    : undefined;

  await prisma.$transaction(async (tx) => {
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

  logger.info(
    {
      refundRequestId: input.refundRequestId,
      approved: input.approved,
      approvedAmount,
    },
    'Refund decision processed'
  );
}

// ── Mark Refund Processed ─────────────────────────────────────────────────────

export async function markRefundProcessed(refundRequestId: string): Promise<void> {
  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id: refundRequestId },
  });

  if (!refundRequest) throw new NotFoundError('Refund request');
  if (refundRequest.status !== 'APPROVED') {
    throw new ConflictError('Only approved refunds can be marked as processed');
  }

  await prisma.$transaction(async (tx) => {
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

  logger.info({ refundRequestId }, 'Refund marked as processed');
}
