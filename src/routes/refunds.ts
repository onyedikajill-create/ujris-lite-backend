import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import {
  assessRefundEligibility,
  createRefundRequest,
} from '../engines/refundEngine';
import { prisma } from '../lib/prisma';
import { NotFoundError } from '../middleware/errorHandler';
import {
  createAuditLog,
  AuditActions,
  extractRequestMeta,
} from '../engines/auditEngine';

const router = Router();

router.use(requireAuth);

const RefundRequestSchema = z.object({
  caseId: z.string().cuid(),
  reason: z.string().min(10).max(2000),
});

// ── GET /api/refunds/eligibility/:caseId ──────────────────────────────────────

router.get(
  '/eligibility/:caseId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const eligibility = await assessRefundEligibility(
        req.params.caseId,
        req.userId!
      );

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.REFUND_ELIGIBILITY_CHECKED,
        entityType: 'Case',
        entityId: req.params.caseId,
        metadata: { eligible: eligibility.eligible },
        ...meta,
      });

      res.status(200).json({ success: true, data: eligibility });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/refunds ─────────────────────────────────────────────────────────

router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = RefundRequestSchema.parse(req.body);

      const { refundRequestId } = await createRefundRequest({
        caseId: body.caseId,
        userId: req.userId!,
        reason: body.reason,
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: body.caseId,
        userId: req.userId,
        action: AuditActions.REFUND_REQUESTED,
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
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/refunds ──────────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requests = await prisma.refundRequest.findMany({
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
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/refunds/:refundRequestId ─────────────────────────────────────────

router.get(
  '/:refundRequestId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const request = await prisma.refundRequest.findFirst({
        where: {
          id: req.params.refundRequestId,
          userId: req.userId,
        },
        include: { case: { select: { title: true, status: true } } },
      });

      if (!request) throw new NotFoundError('Refund request');

      res.status(200).json({ success: true, data: { request } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
