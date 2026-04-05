import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireCaseOwnership } from '../middleware/auth';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { uploadMiddleware } from '../middleware/upload';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  AIServiceError,
} from '../middleware/errorHandler';
import {
  CreateIntakeSchema,
  UpdateIntakeSchema,
  generateNextQuestions,
  validateIntakeCompleteness,
} from '../engines/intakeEngine';
import {
  generateCaseDocument,
  CaseGenerationInput,
} from '../engines/caseGenerationEngine';
import {
  processUploadedFile,
  generateEvidenceSummary,
  summariseEvidenceItem,
} from '../engines/evidenceEngine';
import {
  createAuditLog,
  AuditActions,
  extractRequestMeta,
} from '../engines/auditEngine';
import { CaseStatus } from '@prisma/client';

const router = Router();

// All case routes require auth
router.use(requireAuth);

// ── GET /api/cases ────────────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
      const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));
      const status = req.query.status as CaseStatus | undefined;
      const skip = (page - 1) * limit;

      const where = {
        userId: req.userId!,
        ...(status ? { status } : {}),
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
            intakeComplete: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { evidence: true } },
          },
        }),
        prisma.case.count({ where }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          cases,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/cases ───────────────────────────────────────────────────────────

router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = CreateIntakeSchema.parse(req.body);

      const caseRecord = await prisma.case.create({
        data: {
          userId: req.userId!,
          title: body.title,
          description: body.description,
          decisionType: body.decisionType ?? 'OTHER',
          grounds: body.grounds ?? 'OTHER',
          desiredOutcome: body.desiredOutcome ?? null,
          jurisdiction: body.jurisdiction ?? null,
          opposingParty: body.opposingParty ?? null,
          incidentDate: body.incidentDate ? new Date(body.incidentDate) : null,
          submissionDeadline: body.submissionDeadline
            ? new Date(body.submissionDeadline)
            : null,
          intakeData: body.intakeData ?? undefined,
          status: 'INTAKE',
        },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: caseRecord.id,
        userId: req.userId,
        action: AuditActions.CASE_CREATED,
        entityType: 'Case',
        entityId: caseRecord.id,
        newValues: { title: body.title, decisionType: body.decisionType },
        ...meta,
      });

      res.status(201).json({ success: true, data: { case: caseRecord } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/cases/:caseId ────────────────────────────────────────────────────

router.get(
  '/:caseId',
  requireCaseOwnership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseRecord = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        include: {
          evidence: {
            select: {
              id: true,
              originalName: true,
              evidenceType: true,
              mimeType: true,
              sizeBytes: true,
              summary: true,
              uploadedAt: true,
              processedAt: true,
            },
          },
          _count: { select: { auditLogs: true } },
        },
      });

      if (!caseRecord) throw new NotFoundError('Case');

      res.status(200).json({ success: true, data: { case: caseRecord } });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /api/cases/:caseId ──────────────────────────────────────────────────

router.patch(
  '/:caseId',
  requireCaseOwnership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = UpdateIntakeSchema.parse(req.body);

      const existing = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        select: { status: true },
      });
      if (!existing) throw new NotFoundError('Case');

      const lockedStatuses: CaseStatus[] = ['GENERATING', 'CLOSED', 'REFUNDED'];
      if (lockedStatuses.includes(existing.status)) {
        throw new ConflictError(
          `Case cannot be updated in status '${existing.status}'`
        );
      }

      const updated = await prisma.case.update({
        where: { id: req.params.caseId },
        data: {
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.decisionType !== undefined && { decisionType: body.decisionType }),
          ...(body.grounds !== undefined && { grounds: body.grounds }),
          ...(body.desiredOutcome !== undefined && { desiredOutcome: body.desiredOutcome }),
          ...(body.jurisdiction !== undefined && { jurisdiction: body.jurisdiction }),
          ...(body.opposingParty !== undefined && { opposingParty: body.opposingParty }),
          ...(body.incidentDate !== undefined && {
            incidentDate: new Date(body.incidentDate),
          }),
          ...(body.submissionDeadline !== undefined && {
            submissionDeadline: new Date(body.submissionDeadline),
          }),
          ...(body.intakeData !== undefined && { intakeData: body.intakeData }),
        },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.CASE_UPDATED,
        entityType: 'Case',
        entityId: req.params.caseId,
        newValues: body as Record<string, unknown>,
        ...meta,
      });

      res.status(200).json({ success: true, data: { case: updated } });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/cases/:caseId ─────────────────────────────────────────────────

router.delete(
  '/:caseId',
  requireCaseOwnership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        select: { status: true, refundStatus: true },
      });
      if (!existing) throw new NotFoundError('Case');

      if (existing.refundStatus === 'PENDING' || existing.refundStatus === 'APPROVED') {
        throw new ConflictError('Cannot delete a case with a pending or approved refund');
      }

      await prisma.case.delete({ where: { id: req.params.caseId } });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        userId: req.userId,
        action: AuditActions.CASE_DELETED,
        entityType: 'Case',
        entityId: req.params.caseId,
        ...meta,
      });

      res.status(200).json({ success: true, data: { message: 'Case deleted' } });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/cases/:caseId/intake/questions ──────────────────────────────────

router.post(
  '/:caseId/intake/questions',
  requireCaseOwnership,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseRecord = await prisma.case.findUnique({
        where: { id: req.params.caseId },
      });
      if (!caseRecord) throw new NotFoundError('Case');

      const questionsResult = await generateNextQuestions({
        title: caseRecord.title,
        description: caseRecord.description,
        decisionType: caseRecord.decisionType,
        grounds: caseRecord.grounds,
        desiredOutcome: caseRecord.desiredOutcome,
        jurisdiction: caseRecord.jurisdiction,
        opposingParty: caseRecord.opposingParty,
        incidentDate: caseRecord.incidentDate,
        submissionDeadline: caseRecord.submissionDeadline,
        intakeData: caseRecord.intakeData as Record<string, unknown> | null,
      });

      await prisma.case.update({
        where: { id: req.params.caseId },
        data: {
          nextQuestions: questionsResult as unknown as Record<string, unknown>,
          intakeComplete: questionsResult.intakeComplete,
        },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.INTAKE_QUESTIONS_GENERATED,
        entityType: 'Case',
        entityId: req.params.caseId,
        metadata: { intakeComplete: questionsResult.intakeComplete },
        ...meta,
      });

      res.status(200).json({ success: true, data: questionsResult });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/cases/:caseId/generate ─────────────────────────────────────────

router.post(
  '/:caseId/generate',
  requireCaseOwnership,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseRecord = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        include: {
          evidence: {
            select: {
              id: true,
              originalName: true,
              evidenceType: true,
              extractedText: true,
              summary: true,
            },
          },
        },
      });

      if (!caseRecord) throw new NotFoundError('Case');

      if (caseRecord.status === 'GENERATING') {
        throw new ConflictError('Case generation is already in progress');
      }

      if (caseRecord.status === 'CLOSED' || caseRecord.status === 'REFUNDED') {
        throw new ConflictError(`Cannot generate case in status '${caseRecord.status}'`);
      }

      // Validate intake completeness
      const validation = validateIntakeCompleteness({
        title: caseRecord.title,
        description: caseRecord.description,
        decisionType: caseRecord.decisionType,
        grounds: caseRecord.grounds,
        desiredOutcome: caseRecord.desiredOutcome,
        jurisdiction: caseRecord.jurisdiction,
      });

      if (!validation.valid) {
        throw new ValidationError(
          `Intake incomplete. Missing fields: ${validation.missingFields.join(', ')}`
        );
      }

      // Set status to GENERATING
      await prisma.case.update({
        where: { id: req.params.caseId },
        data: { status: 'GENERATING' },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.CASE_GENERATION_STARTED,
        entityType: 'Case',
        entityId: req.params.caseId,
        ...meta,
      });

      const input: CaseGenerationInput = {
        caseId: caseRecord.id,
        title: caseRecord.title,
        description: caseRecord.description,
        decisionType: caseRecord.decisionType,
        grounds: caseRecord.grounds,
        desiredOutcome: caseRecord.desiredOutcome,
        jurisdiction: caseRecord.jurisdiction,
        opposingParty: caseRecord.opposingParty,
        incidentDate: caseRecord.incidentDate,
        submissionDeadline: caseRecord.submissionDeadline,
        intakeData: caseRecord.intakeData as Record<string, unknown> | null,
        evidenceSummary: caseRecord.evidenceSummary,
        evidenceCount: caseRecord.evidence.length,
      };

      try {
        const { result, tokensUsed, processingTimeMs } = await generateCaseDocument(input);

        const updatedCase = await prisma.case.update({
          where: { id: req.params.caseId },
          data: {
            status: 'ACTIVE',
            caseDocument: result.caseDocument,
            executiveSummary: result.executiveSummary,
            legalArguments: result.legalArguments as unknown as Record<string, unknown>[],
            recommendedActions: result.recommendedActions as unknown as Record<string, unknown>[],
            strengthScore: result.strengthScore,
            riskAssessment: result.riskAssessment,
            generatedAt: new Date(),
            aiModel: process.env.AI_MODEL ?? 'claude-opus-4-5',
            aiTokensUsed: tokensUsed,
            processingTimeMs,
            intakeComplete: true,
          },
        });

        await createAuditLog({
          caseId: req.params.caseId,
          userId: req.userId,
          action: AuditActions.CASE_GENERATION_COMPLETED,
          entityType: 'Case',
          entityId: req.params.caseId,
          metadata: { tokensUsed, processingTimeMs, strengthScore: result.strengthScore },
          ...meta,
        });

        res.status(200).json({
          success: true,
          data: {
            case: {
              id: updatedCase.id,
              status: updatedCase.status,
              strengthScore: updatedCase.strengthScore,
              executiveSummary: updatedCase.executiveSummary,
              generatedAt: updatedCase.generatedAt,
            },
          },
        });
      } catch (genErr) {
        await prisma.case.update({
          where: { id: req.params.caseId },
          data: { status: 'INTAKE' },
        });

        await createAuditLog({
          caseId: req.params.caseId,
          userId: req.userId,
          action: AuditActions.CASE_GENERATION_FAILED,
          entityType: 'Case',
          entityId: req.params.caseId,
          metadata: { error: String(genErr) },
          ...meta,
        });

        throw new AIServiceError('Case generation failed. Please try again.');
      }
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/cases/:caseId/evidence ─────────────────────────────────────────

router.post(
  '/:caseId/evidence',
  requireCaseOwnership,
  uploadMiddleware.array('files', 10),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[] | undefined;
      if (!files || files.length === 0) {
        throw new ValidationError('At least one file is required');
      }

      const caseRecord = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        select: { id: true, status: true },
      });
      if (!caseRecord) throw new NotFoundError('Case');

      if (caseRecord.status === 'CLOSED' || caseRecord.status === 'REFUNDED') {
        throw new ConflictError(`Cannot add evidence to case in status '${caseRecord.status}'`);
      }

      const processedFiles = await Promise.all(files.map(processUploadedFile));

      // Check for duplicate hashes
      const hashes = processedFiles.map((f) => f.sha256Hash);
      const existingEvidence = await prisma.evidence.findMany({
        where: { caseId: req.params.caseId, sha256Hash: { in: hashes } },
        select: { sha256Hash: true, originalName: true },
      });

      if (existingEvidence.length > 0) {
        const dupNames = existingEvidence.map((e) => e.originalName).join(', ');
        throw new ConflictError(
          `Duplicate file(s) detected: ${dupNames}. These files have already been uploaded.`
        );
      }

      // Summarise items with extracted text
      const withSummaries = await Promise.all(
        processedFiles.map(async (pf) => {
          let summary: string | null = null;
          if (pf.extractedText) {
            summary = await summariseEvidenceItem(
              pf.originalName,
              pf.evidenceType,
              pf.extractedText
            );
          }
          return { ...pf, summary };
        })
      );

      const created = await prisma.$transaction(
        withSummaries.map((pf) =>
          prisma.evidence.create({
            data: {
              caseId: req.params.caseId,
              type: pf.evidenceType,
              fileName: pf.fileName,
              originalName: pf.originalName,
              mimeType: pf.mimeType,
              sizeBytes: pf.sizeBytes,
              storageKey: pf.storageKey,
              sha256Hash: pf.sha256Hash,
              extractedText: pf.extractedText ?? null,
              summary: pf.summary,
              metadata: pf.metadata as Record<string, unknown>,
              processedAt: new Date(),
            },
            select: {
              id: true,
              originalName: true,
              evidenceType: true,
              mimeType: true,
              sizeBytes: true,
              summary: true,
              uploadedAt: true,
            },
          })
        )
      );

      // Move case to evidence pending if still in intake
      if (caseRecord.status === 'INTAKE') {
        await prisma.case.update({
          where: { id: req.params.caseId },
          data: { status: 'EVIDENCE_PENDING' },
        });
      }

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.EVIDENCE_UPLOADED,
        entityType: 'Evidence',
        entityId: req.params.caseId,
        metadata: { fileCount: created.length, fileNames: files.map((f) => f.originalname) },
        ...meta,
      });

      res.status(201).json({
        success: true,
        data: { evidence: created, count: created.length },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/cases/:caseId/evidence/summarise ────────────────────────────────

router.post(
  '/:caseId/evidence/summarise',
  requireCaseOwnership,
  aiRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const caseRecord = await prisma.case.findUnique({
        where: { id: req.params.caseId },
        include: {
          evidence: {
            select: {
              id: true,
              originalName: true,
              evidenceType: true,
              extractedText: true,
              summary: true,
            },
          },
        },
      });

      if (!caseRecord) throw new NotFoundError('Case');
      if (caseRecord.evidence.length === 0) {
        throw new ValidationError('No evidence found for this case');
      }

      const summary = await generateEvidenceSummary({
        caseTitle: caseRecord.title,
        caseDescription: caseRecord.description,
        decisionType: caseRecord.decisionType,
        grounds: caseRecord.grounds,
        evidenceList: caseRecord.evidence.map((e) => ({
          id: e.id,
          originalName: e.originalName,
          evidenceType: e.evidenceType,
          extractedText: e.extractedText,
          summary: e.summary,
        })),
      });

      const summaryText = JSON.stringify(summary, null, 2);

      await prisma.case.update({
        where: { id: req.params.caseId },
        data: {
          evidenceSummary: summaryText,
          evidenceSummaryAt: new Date(),
        },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.EVIDENCE_SUMMARY_GENERATED,
        entityType: 'Case',
        entityId: req.params.caseId,
        metadata: { evidenceScore: summary.evidenceScore, evidenceCount: caseRecord.evidence.length },
        ...meta,
      });

      res.status(200).json({ success: true, data: { summary } });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/cases/:caseId/evidence/:evidenceId ────────────────────────────

router.delete(
  '/:caseId/evidence/:evidenceId',
  requireCaseOwnership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const evidence = await prisma.evidence.findFirst({
        where: { id: req.params.evidenceId, caseId: req.params.caseId },
      });

      if (!evidence) throw new NotFoundError('Evidence');

      await prisma.evidence.delete({ where: { id: req.params.evidenceId } });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        caseId: req.params.caseId,
        userId: req.userId,
        action: AuditActions.EVIDENCE_DELETED,
        entityType: 'Evidence',
        entityId: req.params.evidenceId,
        oldValues: { fileName: evidence.originalName },
        ...meta,
      });

      res.status(200).json({ success: true, data: { message: 'Evidence deleted' } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/cases/:caseId/audit ──────────────────────────────────────────────

router.get(
  '/:caseId/audit',
  requireCaseOwnership,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { getAuditLogsForCase } = await import('../engines/auditEngine');
      const logs = await getAuditLogsForCase(req.params.caseId, 100);
      res.status(200).json({ success: true, data: { logs } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
