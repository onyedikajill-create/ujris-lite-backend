"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const upload_1 = require("../middleware/upload");
const errorHandler_1 = require("../middleware/errorHandler");
const intakeEngine_1 = require("../engines/intakeEngine");
const caseGenerationEngine_1 = require("../engines/caseGenerationEngine");
const evidenceEngine_1 = require("../engines/evidenceEngine");
const auditEngine_1 = require("../engines/auditEngine");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get('/', async (req, res, next) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));
        const status = req.query.status;
        const skip = (page - 1) * limit;
        const where = {
            userId: req.userId,
            ...(status ? { status } : {}),
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
                    intakeComplete: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: { select: { evidence: true } },
                },
            }),
            prisma_1.prisma.case.count({ where }),
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
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const body = intakeEngine_1.CreateIntakeSchema.parse(req.body);
        const caseRecord = await prisma_1.prisma.case.create({
            data: {
                userId: req.userId,
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
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: caseRecord.id,
            userId: req.userId,
            action: auditEngine_1.AuditActions.CASE_CREATED,
            entityType: 'Case',
            entityId: caseRecord.id,
            newValues: { title: body.title, decisionType: body.decisionType },
            ...meta,
        });
        res.status(201).json({ success: true, data: { case: caseRecord } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:caseId', auth_1.requireCaseOwnership, async (req, res, next) => {
    try {
        const caseRecord = await prisma_1.prisma.case.findUnique({
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
        if (!caseRecord)
            throw new errorHandler_1.NotFoundError('Case');
        res.status(200).json({ success: true, data: { case: caseRecord } });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:caseId', auth_1.requireCaseOwnership, async (req, res, next) => {
    try {
        const body = intakeEngine_1.UpdateIntakeSchema.parse(req.body);
        const existing = await prisma_1.prisma.case.findUnique({
            where: { id: req.params.caseId },
            select: { status: true },
        });
        if (!existing)
            throw new errorHandler_1.NotFoundError('Case');
        const lockedStatuses = ['GENERATING', 'CLOSED', 'REFUNDED'];
        if (lockedStatuses.includes(existing.status)) {
            throw new errorHandler_1.ConflictError(`Case cannot be updated in status '${existing.status}'`);
        }
        const updated = await prisma_1.prisma.case.update({
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
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.CASE_UPDATED,
            entityType: 'Case',
            entityId: req.params.caseId,
            newValues: body,
            ...meta,
        });
        res.status(200).json({ success: true, data: { case: updated } });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:caseId', auth_1.requireCaseOwnership, async (req, res, next) => {
    try {
        const existing = await prisma_1.prisma.case.findUnique({
            where: { id: req.params.caseId },
            select: { status: true, refundStatus: true },
        });
        if (!existing)
            throw new errorHandler_1.NotFoundError('Case');
        if (existing.refundStatus === 'PENDING' || existing.refundStatus === 'APPROVED') {
            throw new errorHandler_1.ConflictError('Cannot delete a case with a pending or approved refund');
        }
        await prisma_1.prisma.case.delete({ where: { id: req.params.caseId } });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            userId: req.userId,
            action: auditEngine_1.AuditActions.CASE_DELETED,
            entityType: 'Case',
            entityId: req.params.caseId,
            ...meta,
        });
        res.status(200).json({ success: true, data: { message: 'Case deleted' } });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:caseId/intake/questions', auth_1.requireCaseOwnership, rateLimiter_1.aiRateLimiter, async (req, res, next) => {
    try {
        const caseRecord = await prisma_1.prisma.case.findUnique({
            where: { id: req.params.caseId },
        });
        if (!caseRecord)
            throw new errorHandler_1.NotFoundError('Case');
        const questionsResult = await (0, intakeEngine_1.generateNextQuestions)({
            title: caseRecord.title,
            description: caseRecord.description,
            decisionType: caseRecord.decisionType,
            grounds: caseRecord.grounds,
            desiredOutcome: caseRecord.desiredOutcome,
            jurisdiction: caseRecord.jurisdiction,
            opposingParty: caseRecord.opposingParty,
            incidentDate: caseRecord.incidentDate,
            submissionDeadline: caseRecord.submissionDeadline,
            intakeData: caseRecord.intakeData,
        });
        await prisma_1.prisma.case.update({
            where: { id: req.params.caseId },
            data: {
                nextQuestions: questionsResult,
                intakeComplete: questionsResult.intakeComplete,
            },
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.INTAKE_QUESTIONS_GENERATED,
            entityType: 'Case',
            entityId: req.params.caseId,
            metadata: { intakeComplete: questionsResult.intakeComplete },
            ...meta,
        });
        res.status(200).json({ success: true, data: questionsResult });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:caseId/generate', auth_1.requireCaseOwnership, rateLimiter_1.aiRateLimiter, async (req, res, next) => {
    try {
        const caseRecord = await prisma_1.prisma.case.findUnique({
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
        if (!caseRecord)
            throw new errorHandler_1.NotFoundError('Case');
        if (caseRecord.status === 'GENERATING') {
            throw new errorHandler_1.ConflictError('Case generation is already in progress');
        }
        if (caseRecord.status === 'CLOSED' || caseRecord.status === 'REFUNDED') {
            throw new errorHandler_1.ConflictError(`Cannot generate case in status '${caseRecord.status}'`);
        }
        const validation = (0, intakeEngine_1.validateIntakeCompleteness)({
            title: caseRecord.title,
            description: caseRecord.description,
            decisionType: caseRecord.decisionType,
            grounds: caseRecord.grounds,
            desiredOutcome: caseRecord.desiredOutcome,
            jurisdiction: caseRecord.jurisdiction,
        });
        if (!validation.valid) {
            throw new errorHandler_1.ValidationError(`Intake incomplete. Missing fields: ${validation.missingFields.join(', ')}`);
        }
        await prisma_1.prisma.case.update({
            where: { id: req.params.caseId },
            data: { status: 'GENERATING' },
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.CASE_GENERATION_STARTED,
            entityType: 'Case',
            entityId: req.params.caseId,
            ...meta,
        });
        const input = {
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
            intakeData: caseRecord.intakeData,
            evidenceSummary: caseRecord.evidenceSummary,
            evidenceCount: caseRecord.evidence.length,
        };
        try {
            const { result, tokensUsed, processingTimeMs } = await (0, caseGenerationEngine_1.generateCaseDocument)(input);
            const updatedCase = await prisma_1.prisma.case.update({
                where: { id: req.params.caseId },
                data: {
                    status: 'ACTIVE',
                    caseDocument: result.caseDocument,
                    executiveSummary: result.executiveSummary,
                    legalArguments: result.legalArguments,
                    recommendedActions: result.recommendedActions,
                    strengthScore: result.strengthScore,
                    riskAssessment: result.riskAssessment,
                    generatedAt: new Date(),
                    aiModel: process.env.AI_MODEL ?? 'claude-opus-4-5',
                    aiTokensUsed: tokensUsed,
                    processingTimeMs,
                    intakeComplete: true,
                },
            });
            await (0, auditEngine_1.createAuditLog)({
                caseId: req.params.caseId,
                userId: req.userId,
                action: auditEngine_1.AuditActions.CASE_GENERATION_COMPLETED,
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
        }
        catch (genErr) {
            await prisma_1.prisma.case.update({
                where: { id: req.params.caseId },
                data: { status: 'INTAKE' },
            });
            await (0, auditEngine_1.createAuditLog)({
                caseId: req.params.caseId,
                userId: req.userId,
                action: auditEngine_1.AuditActions.CASE_GENERATION_FAILED,
                entityType: 'Case',
                entityId: req.params.caseId,
                metadata: { error: String(genErr) },
                ...meta,
            });
            throw new errorHandler_1.AIServiceError('Case generation failed. Please try again.');
        }
    }
    catch (err) {
        next(err);
    }
});
router.post('/:caseId/evidence', auth_1.requireCaseOwnership, upload_1.uploadMiddleware.array('files', 5), async (req, res, next) => {
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            throw new errorHandler_1.ValidationError('At least one file is required');
        }
        const caseRecord = await prisma_1.prisma.case.findUnique({
            where: { id: req.params.caseId },
            select: { id: true, status: true },
        });
        if (!caseRecord)
            throw new errorHandler_1.NotFoundError('Case');
        if (caseRecord.status === 'CLOSED' || caseRecord.status === 'REFUNDED') {
            throw new errorHandler_1.ConflictError(`Cannot add evidence to case in status '${caseRecord.status}'`);
        }
        const processedFiles = await Promise.all(files.map(evidenceEngine_1.processUploadedFile));
        const hashes = processedFiles.map((f) => f.sha256Hash);
        const existingEvidence = await prisma_1.prisma.evidence.findMany({
            where: { caseId: req.params.caseId, sha256Hash: { in: hashes } },
            select: { sha256Hash: true, originalName: true },
        });
        if (existingEvidence.length > 0) {
            const dupNames = existingEvidence.map((e) => e.originalName).join(', ');
            throw new errorHandler_1.ConflictError(`Duplicate file(s) detected: ${dupNames}. These files have already been uploaded.`);
        }
        const withSummaries = await Promise.all(processedFiles.map(async (pf) => {
            let summary = null;
            if (pf.extractedText) {
                summary = await (0, evidenceEngine_1.summariseEvidenceItem)(pf.originalName, pf.evidenceType, pf.extractedText);
            }
            return { ...pf, summary };
        }));
        const created = await prisma_1.prisma.$transaction(withSummaries.map((pf) => prisma_1.prisma.evidence.create({
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
                metadata: pf.metadata,
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
        })));
        if (caseRecord.status === 'INTAKE') {
            await prisma_1.prisma.case.update({
                where: { id: req.params.caseId },
                data: { status: 'EVIDENCE_PENDING' },
            });
        }
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.EVIDENCE_UPLOADED,
            entityType: 'Evidence',
            entityId: req.params.caseId,
            metadata: { fileCount: created.length, fileNames: files.map((f) => f.originalname) },
            ...meta,
        });
        res.status(201).json({
            success: true,
            data: { evidence: created, count: created.length },
        });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:caseId/evidence/summarise', auth_1.requireCaseOwnership, rateLimiter_1.aiRateLimiter, async (req, res, next) => {
    try {
        const caseRecord = await prisma_1.prisma.case.findUnique({
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
        if (!caseRecord)
            throw new errorHandler_1.NotFoundError('Case');
        if (caseRecord.evidence.length === 0) {
            throw new errorHandler_1.ValidationError('No evidence found for this case');
        }
        const summary = await (0, evidenceEngine_1.generateEvidenceSummary)({
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
        await prisma_1.prisma.case.update({
            where: { id: req.params.caseId },
            data: {
                evidenceSummary: summaryText,
                evidenceSummaryAt: new Date(),
            },
        });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.EVIDENCE_SUMMARY_GENERATED,
            entityType: 'Case',
            entityId: req.params.caseId,
            metadata: { evidenceScore: summary.evidenceScore, evidenceCount: caseRecord.evidence.length },
            ...meta,
        });
        res.status(200).json({ success: true, data: { summary } });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:caseId/evidence/:evidenceId', auth_1.requireCaseOwnership, async (req, res, next) => {
    try {
        const evidence = await prisma_1.prisma.evidence.findFirst({
            where: { id: req.params.evidenceId, caseId: req.params.caseId },
        });
        if (!evidence)
            throw new errorHandler_1.NotFoundError('Evidence');
        await prisma_1.prisma.evidence.delete({ where: { id: req.params.evidenceId } });
        const meta = (0, auditEngine_1.extractRequestMeta)(req);
        await (0, auditEngine_1.createAuditLog)({
            caseId: req.params.caseId,
            userId: req.userId,
            action: auditEngine_1.AuditActions.EVIDENCE_DELETED,
            entityType: 'Evidence',
            entityId: req.params.evidenceId,
            oldValues: { fileName: evidence.originalName },
            ...meta,
        });
        res.status(200).json({ success: true, data: { message: 'Evidence deleted' } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:caseId/audit', auth_1.requireCaseOwnership, async (req, res, next) => {
    try {
        const { getAuditLogsForCase } = await Promise.resolve().then(() => __importStar(require('../engines/auditEngine')));
        const logs = await getAuditLogsForCase(req.params.caseId, 100);
        res.status(200).json({ success: true, data: { logs } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=cases.js.map