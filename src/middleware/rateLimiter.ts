import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10);
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '100', 10);
const AI_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_AI_MAX ?? '20', 10);

const rateLimitResponse = (_req: Request, res: Response): void => {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests - please try again later',
    },
  });
};

export const globalRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  skip: (req: Request) => req.path === '/health',
});

export const aiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: AI_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { userId?: string }).userId;
    return userId ?? req.ip ?? 'unknown';
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});
