import request from 'supertest';
import { createApp } from './app';

// Mock all external dependencies
jest.mock('./lib/prisma', () => ({
  prisma: {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn() },
    case: { findMany: jest.fn(), count: jest.fn() },
    authToken: { create: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  },
}));

jest.mock('./lib/redis', () => ({
  redis: null,
  getRedisValue: jest.fn().mockResolvedValue(null),
  setRedisValue: jest.fn().mockResolvedValue(undefined),
  deleteRedisKey: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

const app = createApp();

describe('App smoke tests', () => {
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('3.0.0');
    });
  });

  describe('404 handler', () => {
    it('returns 404 for unknown route', async () => {
      const res = await request(app).get('/api/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Auth routes', () => {
    it('rejects registration with invalid email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'not-an-email',
        password: 'Password1',
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects registration with weak password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'weak',
      });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects case access without auth token', async () => {
      const res = await request(app).get('/api/cases');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('rejects admin routes without admin key', async () => {
      const res = await request(app).get('/api/admin/cases');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTHORIZATION_ERROR');
    });
  });
});

