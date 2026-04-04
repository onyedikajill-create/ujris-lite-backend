import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { processRefundDecision, markRefundProcessed } from '../engines/refundEngine';
import { NotFoundError } from '../middleware/errorHandler';
import {
  createAuditLog,
  AuditActions,
  extractRequestMeta,
  getAuditLogsForCase,
} from '../engines/auditEngine';
import { CaseStatus } from '@prisma/client';

const router = Router();

// All admin routes require admin API key
router.use(requireAdminKey);

// ── GET /api/admin/cases ──────────────────────────────────────────────────────

router.get(
  '/cases',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
      const status = req.query.status as CaseStatus | undefined;
      const userId = req.query.userId as string | undefined;
      const skip = (page - 1) * limit;

      const where = {
        ...(status ? { status } : {}),
        ...(userId ? { userId } : {}),
      };

      const [cases, total] = await Promise.all([
        prisma.case.findMany({
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
        prisma.case.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          cases,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/cases/:caseId ──────────────────────────────────────────────

router.get(
  '/cases/:caseId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseRecord = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          evidence: true,
          refundRequests: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (!caseRecord) throw new NotFoundError('Case');

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        action: AuditActions.ADMIN_CASE_VIEWED,
        entityType: 'Case',
        entityId: req.params.caseId,
        adminKey: true,
        ...meta,
      });

      res.status(200).json({ success: true, data: { case: caseRecord } });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/admin/cases/:caseId/status ─────────────────────────────────────

router.patch(
  '/cases/:caseId/status',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const StatusSchema = z.object({
        status: z.nativeEnum(CaseStatus),
        notes: z.string().max(1000).optional(),
      });

      const body = StatusSchema.parse(req.body);

      const existing = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        select: { id: true, status: true },
      });
      if (!existing) throw new NotFoundError('Case');

      const updated = await prisma.case.update({
        where: { id: req.params.caseId },
        data: { status: body.status },
        select: { id: true, status: true, updatedAt: true },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        action: AuditActions.ADMIN_CASE_STATUS_CHANGED,
        entityType: 'Case',
        entityId: req.params.caseId,
        oldValues: { status: existing.status },
        newValues: { status: body.status },
        adminKey: true,
        metadata: { notes: body.notes },
        ...meta,
      });

      res.status(200).json({ success: true, data: { case: updated } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/cases/:caseId/audit ────────────────────────────────────────

router.get(
  '/cases/:caseId/audit',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const logs = await getAuditLogsForCase(req.params.caseId, 200);
      res.status(200).json({ success: true, data: { logs } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/refunds ────────────────────────────────────────────────────

router.get(
  '/refunds',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
      const status = req.query.status as string | undefined;
      const skip = (page - 1) * limit;

      const where = status ? { status: status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED' } : {};

      const [requests, total] = await Promise.all([
        prisma.refundRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            case: { select: { title: true, status: true } },
          },
        }),
        prisma.refundRequest.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          requests,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/admin/refunds/:refundRequestId/decide ───────────────────────────

router.post(
  '/refunds/:refundRequestId/decide',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const DecisionSchema = z.object({
        approved: z.boolean(),
        approvedAmount: z.number().positive().optional(),
        adminNotes: z.string().max(2000).optional(),
      });

      const body = DecisionSchema.parse(req.body);

      await processRefundDecision({
        refundRequestId: req.params.refundRequestId,
        approved: body.approved,
        approvedAmount: body.approvedAmount,
        adminNotes: body.adminNotes,
      });

      const meta = extractRequestMeta(req);
      const action = body.approved ? AuditActions.REFUND_APPROVED : AuditActions.REFUND_REJECTED;
      await createAuditLog({
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
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/admin/refunds/:refundRequestId/process ──────────────────────────

router.post(
  '/refunds/:refundRequestId/process',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await markRefundProcessed(req.params.refundRequestId);

      const meta = extractRequestMeta(req);
      await createAuditLog({
        action: AuditActions.REFUND_PROCESSED,
        entityType: 'RefundRequest',
        entityId: req.params.refundRequestId,
        adminKey: true,
        ...meta,
      });

      res.status(200).json({
        success: true,
        data: { message: 'Refund marked as processed and case closed' },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/users ──────────────────────────────────────────────────────

router.get(
  '/users',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
      const skip = (page - 1) * limit;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
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
        prisma.user.count(),
      ]);

      res.status(200).json({
        success: true,
        data: {
          users,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/admin/users/:userId/deactivate ─────────────────────────────────

router.patch(
  '/users/:userId/deactivate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.params.userId },
        select: { id: true, isActive: true },
      });
      if (!user) throw new NotFoundError('User');

      await prisma.user.update({
        where: { id: req.params.userId },
        data: { isActive: false },
      });

      // Revoke all tokens
      await prisma.authToken.updateMany({
        where: { userId: req.params.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        userId: req.params.userId,
        action: AuditActions.ADMIN_USER_DEACTIVATED,
        entityType: 'User',
        entityId: req.params.userId,
        adminKey: true,
        ...meta,
      });

      res.status(200).json({ success: true, data: { message: 'User deactivated' } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [
        totalCases,
        activeCases,
        totalUsers,
        pendingRefunds,
        approvedRefunds,
        avgStrengthScore,
      ] = await Promise.all([
        prisma.case.count(),
        prisma.case.count({ where: { status: 'ACTIVE' } }),
        prisma.user.count({ where: { isActive: true } }),
        prisma.refundRequest.count({ where: { status: 'PENDING' } }),
        prisma.refundRequest.count({ where: { status: 'APPROVED' } }),
        prisma.case.aggregate({
          _avg: { strengthScore: true },
          where: { strengthScore: { not: null } },
        }),
      ]);

      const casesByStatus = await prisma.case.groupBy({
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
          casesByStatus: casesByStatus.reduce(
            (acc, s) => ({ ...acc, [s.status]: s._count }),
            {} as Record<string, number>
          ),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/admin/audit ──────────────────────────────────────────────────────

router.get(
  '/audit',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
      const action = req.query.action as string | undefined;
      const skip = (page - 1) * limit;

      const where = action ? { action } : {};

      const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          logs,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
