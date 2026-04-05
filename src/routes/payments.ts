import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import StripeLib = require('stripe');
import { requireAuth } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// Stripe v17 CJS types declare a non-newable function; cast to bypass.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new (StripeLib as any)(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-03-31.basil',
}) as StripeLib.Stripe;

const CheckoutSchema = z.object({
  priceId: z.string().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

// ── POST /api/payments/create-checkout-session ────────────────────────────────

router.post(
  '/create-checkout-session',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new AppError('Stripe is not configured', 503, 'SERVICE_UNAVAILABLE');
      }

      const body = CheckoutSchema.parse(req.body);

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price: body.priceId,
            quantity: 1,
          },
        ],
        customer_email: req.userEmail,
        client_reference_id: req.userId,
        success_url: body.successUrl,
        cancel_url: body.cancelUrl,
      });

      res.status(201).json({
        success: true,
        data: { url: session.url, sessionId: session.id },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
