import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { generateToken, requireAuth } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';
import { NotFoundError, AuthenticationError, ConflictError } from '../middleware/errorHandler';
import { createAuditLog, AuditActions, extractRequestMeta } from '../engines/auditEngine';

const router = Router();

// ── Schemas ───────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(255),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain uppercase, lowercase, and number'),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post(
  '/register',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = RegisterSchema.parse(req.body);

      const existing = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictError('An account with this email already exists');
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      const user = await prisma.user.create({
        data: {
          name: body.name,
          email: body.email.toLowerCase(),
          passwordHash,
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        userId: user.id,
        action: AuditActions.USER_REGISTERED,
        entityType: 'User',
        entityId: user.id,
        ...meta,
      });

      res.status(201).json({
        success: true,
        data: { user, token },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post(
  '/login',
  authRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = LoginSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { email: body.email.toLowerCase() },
      });

      if (!user || !user.isActive) {
        throw new AuthenticationError('Invalid credentials');
      }

      const passwordValid = await bcrypt.compare(body.password, user.passwordHash);
      if (!passwordValid) {
        throw new AuthenticationError('Invalid credentials');
      }

      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await prisma.authToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      const meta = extractRequestMeta(req);
      await createAuditLog({
        userId: user.id,
        action: AuditActions.USER_LOGIN,
        entityType: 'User',
        entityId: user.id,
        ...meta,
      });

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          token,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = req.headers.authorization?.split(' ')[1];

      if (token) {
        await prisma.authToken.updateMany({
          where: { token, userId: req.userId },
          data: { revokedAt: new Date() },
        });
      }

      const meta = extractRequestMeta(req);
      await createAuditLog({
        userId: req.userId,
        action: AuditActions.USER_LOGOUT,
        entityType: 'User',
        entityId: req.userId,
        ...meta,
      });

      res.status(200).json({ success: true, data: { message: 'Logged out successfully' } });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      if (!user) throw new NotFoundError('User');

      res.status(200).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
