// src/app.ts or wherever createApp lives
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { globalRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import casesRouter from './routes/cases';
import refundsRouter from './routes/refunds';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';

export function createApp(): Application {
  const app = express();

  // Trust proxy (for rate limiting behind nginx/load balancer)
  app.set('trust proxy', 1);

  // --- Debug middleware (lightweight) ---
  // Logs method and path so you can confirm edge requests reach Express
  app.use((req, _res, next) => {
    logger.info({ method: req.method, url: req.originalUrl }, '[REQ] incoming request');
    next();
  });

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'none'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: ${origin}`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
    })
  );

  // Compression
  app.use(compression());

  // Request logging
  app.use(
    pinoHttp({
      logger,
      customLogLevel: (_req, res) => {
        if (res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      redact: ['req.headers.authorization', 'req.headers["x-admin-key"]'],
    })
  );

  // Body parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global rate limiting
  app.use(globalRateLimiter);

  // Health check (no auth, no rate limit)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      version: '3.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Root route so "/" returns 200 instead of your notFoundHandler
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      message: 'UJRIS API running',
      timestamp: new Date().toISOString(),
    });
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/refunds', refundsRouter);
  app.use('/api/admin', adminRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}
