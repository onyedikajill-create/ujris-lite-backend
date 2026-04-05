import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { Request } from 'express';

// ── Types ─────────────────────────────────────────────────────────────────────

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

export const AuditActions = {
  // Auth
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  TOKEN_REVOKED: 'TOKEN_REVOKED',

  // Cases
  CASE_CREATED: 'CASE_CREATED',
  CASE_UPDATED: 'CASE_UPDATED',
  CASE_DELETED: 'CASE_DELETED',
  CASE_GENERATION_STARTED: 'CASE_GENERATION_STARTED',
  CASE_GENERATION_COMPLETED: 'CASE_GENERATION_COMPLETED',
  CASE_GENERATION_FAILED: 'CASE_GENERATION_FAILED',
  CASE_STATUS_CHANGED: 'CASE_STATUS_CHANGED',

  // Evidence
  EVIDENCE_UPLOADED: 'EVIDENCE_UPLOADED',
  EVIDENCE_DELETED: 'EVIDENCE_DELETED',
  EVIDENCE_SUMMARY_GENERATED: 'EVIDENCE_SUMMARY_GENERATED',

  // Intake
  INTAKE_QUESTIONS_GENERATED: 'INTAKE_QUESTIONS_GENERATED',
  INTAKE_COMPLETED: 'INTAKE_COMPLETED',

  // Refunds
  REFUND_ELIGIBILITY_CHECKED: 'REFUND_ELIGIBILITY_CHECKED',
  REFUND_REQUESTED: 'REFUND_REQUESTED',
  REFUND_APPROVED: 'REFUND_APPROVED',
  REFUND_REJECTED: 'REFUND_REJECTED',
  REFUND_PROCESSED: 'REFUND_PROCESSED',

  // Admin
  ADMIN_CASE_VIEWED: 'ADMIN_CASE_VIEWED',
  ADMIN_CASE_STATUS_CHANGED: 'ADMIN_CASE_STATUS_CHANGED',
  ADMIN_USER_DEACTIVATED: 'ADMIN_USER_DEACTIVATED',
  ADMIN_CONFIG_UPDATED: 'ADMIN_CONFIG_UPDATED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

// ── Core Functions ────────────────────────────────────────────────────────────

export async function createAuditLog(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
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
  } catch (err) {
    // Audit log failure must never break main flow
    logger.error({ err, action: entry.action }, 'Audit log creation failed');
  }
}

export function extractRequestMeta(req: Request): {
  ipAddress: string;
  userAgent: string;
} {
  return {
    ipAddress:
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  };
}

export async function getAuditLogsForCase(
  caseId: string,
  limit = 50
): Promise<
  Array<{
    id: string;
    action: string;
    entityType: string;
    userId: string | null;
    adminKey: boolean;
    metadata: unknown;
    createdAt: Date;
  }>
> {
  return prisma.auditLog.findMany({
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

export async function getAuditLogsForUser(
  userId: string,
  limit = 100
): Promise<
  Array<{
    id: string;
    action: string;
    entityType: string;
    caseId: string | null;
    adminKey: boolean;
    createdAt: Date;
  }>
> {
  return prisma.auditLog.findMany({
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
