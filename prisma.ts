import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
  });

if (process.env.NODE_ENV === 'development') {
  global.__prisma = prisma;
}

prisma.$on('error', (e) => {
  logger.error({ err: e }, 'Prisma error');
});

prisma.$on('warn', (e) => {
  logger.warn({ warn: e }, 'Prisma warning');
});
