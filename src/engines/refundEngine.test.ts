import { processRefundDecision, markRefundProcessed } from '../engines/refundEngine';
import { prisma } from '../lib/prisma';

// Mock prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    refundRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    case: {
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return ops(prisma);
      return Promise.resolve();
    }),
  },
}));

jest.mock('../lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('refundEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processRefundDecision', () => {
    it('throws NotFoundError when refund request not found', async () => {
      (mockPrisma.refundRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        processRefundDecision({
          refundRequestId: 'nonexistent',
          approved: true,
        })
      ).rejects.toThrow('Refund request not found');
    });

    it('throws ConflictError when refund request is not pending', async () => {
      (mockPrisma.refundRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'req_1',
        status: 'APPROVED',
        caseId: 'case_1',
        requestedAmount: 99,
        case: { status: 'ACTIVE' },
      });

      await expect(
        processRefundDecision({
          refundRequestId: 'req_1',
          approved: false,
        })
      ).rejects.toThrow("Refund request is already in status 'APPROVED'");
    });

    it('throws ValidationError when approved amount exceeds requested', async () => {
      (mockPrisma.refundRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'req_1',
        status: 'PENDING',
        caseId: 'case_1',
        requestedAmount: 99,
        case: { status: 'ACTIVE' },
      });

      await expect(
        processRefundDecision({
          refundRequestId: 'req_1',
          approved: true,
          approvedAmount: 200,
        })
      ).rejects.toThrow('Approved amount cannot exceed requested amount');
    });
  });

  describe('markRefundProcessed', () => {
    it('throws NotFoundError when request not found', async () => {
      (mockPrisma.refundRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(markRefundProcessed('nonexistent')).rejects.toThrow(
        'Refund request not found'
      );
    });

    it('throws ConflictError when refund not approved', async () => {
      (mockPrisma.refundRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 'req_1',
        status: 'PENDING',
        caseId: 'case_1',
      });

      await expect(markRefundProcessed('req_1')).rejects.toThrow(
        'Only approved refunds can be marked as processed'
      );
    });
  });
});
