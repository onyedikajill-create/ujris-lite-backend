import { Request, Response, NextFunction } from 'express';
import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { AuthenticationError, AuthorizationError } from './errorHandler';

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      userRole?: string;
      isAdmin?: boolean;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Bearer token required'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const payload = jwt.verify(token, secret) as JWTPayload;

    req.userId = payload.userId;
    req.userEmail = payload.email;
    req.userRole = payload.role;

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Token expired'));
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AuthenticationError('Invalid token'));
    }
    next(err);
  }
}

export function requireAdminKey(req: Request, _res: Response, next: NextFunction): void {
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    return next(new Error('ADMIN_API_KEY not configured'));
  }

  if (!adminKey || adminKey !== expectedKey) {
    return next(new AuthorizationError('Valid admin key required'));
  }

  req.isAdmin = true;
  next();
}

export function requireRole(role: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.userRole !== role && !req.isAdmin) {
      return next(new AuthorizationError(`Role '${role}' required`));
    }
    next();
  };
}

export async function requireCaseOwnership(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const { caseId } = req.params;
  const userId = req.userId;

  if (!userId) {
    return next(new AuthenticationError());
  }

  if (req.isAdmin) {
    return next();
  }

  const caseRecord = await prisma.case.findFirst({
    where: { id: caseId, userId },
    select: { id: true },
  });

  if (!caseRecord) {
    return next(new AuthorizationError('You do not have access to this case'));
  }

  next();
}

export function generateToken(payload: { userId: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? '7d') as SignOptions['expiresIn'];

  return jwt.sign(payload, secret as Secret, {
    expiresIn,
  });
}
