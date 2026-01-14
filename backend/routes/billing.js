const express = require('express');
const dotenv = require('dotenv');
const Stripe = require('stripe');
const { authenticate, requireRole } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const { randomUUID } = require('crypto');
const { calculateTotal, calculateAddons } = require('../services/pricingService');
const User = require('../models/User');
const StripeCheckoutSession = require('../models/StripeCheckoutSession');
const { activateSubscriptionFromCheckout } = require('../services/subscriptionService');
const { addFunds } = require('../services/walletService');

dotenv.config();

const router = express.Router();
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.length < 32) {
  throw new Error('STRIPE_SECRET_KEY must be configured with a secure value.');
}

const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || 'usd';
const CHECKOUT_SESSION_TTL_MINUTES = Number(process.env.CHECKOUT_SESSION_TTL_MINUTES || 30);

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
});

const createCheckoutValidator = validateRequest(['intent']);
const finalizeCheckoutValidator = validateRequest(['clientToken']);

router.post('/create-checkout', authenticate, requireRole('admin'), createCheckoutValidator, async (req, res) => {
  try {
    const { intent, planTier, billingCycle, addons = [], walletTopUpCents = 0, successUrl, cancelUrl } = req.body;

    const customer = await User.findByPk(req.user.id);
    if (!customer) {
      return res.status(404).json({ message: 'User not found for checkout.' });
    }

    if (!customer.stripeCustomerId) {
      return res.status(400).json({ message: 'Stripe customer not registered. Please contact support.' });
    }

    const normalizedIntent = intent === 'wallet_top_up' ? 'wallet_top_up' : 'plan_purchase';

    let planAmount = 0;
    let addonAmount = 0;
    let totalAmount = 0;
    let lineItems = [];

    if (normalizedIntent === 'wallet_top_up') {
      if (!walletTopUpCents || Number(walletTopUpCents) <= 0) {
        return res.status(400).json({ message: 'walletTopUpCents must be a positive integer amount in cents.' });
      }

      planAmount = 0;
      addonAmount = 0;
      totalAmount = Number(walletTopUpCents);

      lineItems = [
        {
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: totalAmount,
            product_data: {
              name: 'Wallet Top-up',
            },
          },
          quantity: 1,
        },
      ];
    } else {
      if (!planTier || !billingCycle) {
        return res.status(400).json({ message: 'planTier and billingCycle are required for plan purchases.' });
      }

      const totals = calculateTotal(planTier, billingCycle, addons);
      planAmount = totals.planAmount;
      addonAmount = totals.addonAmount;
      totalAmount = totals.totalAmount;

      lineItems = [
        {
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: planAmount,
            product_data: {
              name: `${planTier} plan (${billingCycle})`,
            },
          },
          quantity: 1,
        },
      ];

      addons.forEach((addonCode) => {
        const addonPrice = calculateAddons([addonCode]);
        lineItems.push({
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: addonPrice,
            product_data: {
              name: `Add-on: ${addonCode}`,
            },
          },
          quantity: 1,
        });
      });
    }

    const clientToken = randomUUID().replace(/-/g, '');

    const metadata = {
      userId: customer.id,
      intent: normalizedIntent,
      planTier: planTier || '',
      billingCycle: billingCycle || '',
      addonAmount: addonAmount.toString(),
      planAmount: planAmount.toString(),
      totalAmount: totalAmount.toString(),
      walletTopUpCents: walletTopUpCents.toString(),
      clientToken,
    };

    const sessionParams = {
      mode: 'payment',
      customer: customer.stripeCustomerId,
      line_items: lineItems,
      success_url:
        (successUrl || process.env.STRIPE_SUCCESS_URL || 'https://example.com/success') + `?session=${clientToken}`,
      cancel_url: cancelUrl || process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel',
      metadata,
      payment_intent_data: {
        metadata,
      },
    };

    if (normalizedIntent === 'plan_purchase') {
      sessionParams.payment_intent_data.setup_future_usage = 'off_session';
    }

    const idempotencyKey = `checkout_${clientToken}`;

    const session = await stripe.checkout.sessions.create(sessionParams, {
      idempotencyKey,
    });

    const expiresAt = new Date(Date.now() + CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);

    await StripeCheckoutSession.create({
      userId: customer.id,
      clientToken,
      stripeSessionId: session.id,
      stripeCustomerId: customer.stripeCustomerId,
      intent: normalizedIntent,
      planTier: planTier || null,
      billingCycle: billingCycle || null,
      addons,
      planAmount,
      addonAmount,
      totalAmount,
      walletTopUpCents: normalizedIntent === 'wallet_top_up' ? totalAmount : 0,
      currency: STRIPE_CURRENCY,
      status: 'pending',
      expiresAt,
    });

    return res.status(200).json({ url: session.url, clientToken });
  } catch (error) {
    console.error('Create checkout session error:', error);
    return res.status(500).json({ message: 'Failed to create checkout session.' });
  }
});

router.post('/finalize-checkout', authenticate, requireRole('admin'), finalizeCheckoutValidator, async (req, res) => {
  const { clientToken } = req.body;

  try {
    const record = await StripeCheckoutSession.findOne({ where: { clientToken, userId: req.user.id } });

    if (!record) {
      return res.status(404).json({ message: 'Checkout session not found. Please restart the purchase flow.' });
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      if (record.status !== 'captured') {
        record.status = 'expired';
        record.lastError = 'Checkout confirmation attempted after expiration.';
        await record.save();
      }
      return res.status(410).json({ message: 'This checkout session has expired. Please start again.' });
    }

    if (record.status === 'captured') {
      return res.status(200).json({
        status: 'captured',
        paymentIntentId: record.paymentIntentId,
        capturedAt: record.capturedAt,
      });
    }

    if (record.status === 'expired' || record.status === 'failed') {
      return res.status(409).json({
        message: 'Checkout session is no longer valid. Please initiate a new checkout.',
      });
    }

      if (!record.paymentMethodId) {
        const session = await stripe.checkout.sessions.retrieve(record.stripeSessionId, {
          expand: ['payment_intent.payment_method'],
        });

        const sessionPaymentMethod = session?.payment_intent?.payment_method;

        if (sessionPaymentMethod) {
          record.paymentMethodId =
            typeof sessionPaymentMethod === 'string'
              ? sessionPaymentMethod
              : sessionPaymentMethod.id;
        } else if (session?.payment_method) {
          record.paymentMethodId =
            typeof session.payment_method === 'string'
              ? session.payment_method
              : session.payment_method.id;
        }

        if (!record.paymentMethodId) {
          return res.status(409).json({
            message: 'No payment method found for this checkout session. Please retry checkout.',
          });
        }

        await record.save();
      }

      if (!record.paymentIntentId) {
        const session = await stripe.checkout.sessions.retrieve(record.stripeSessionId, {
          expand: ['payment_intent'],
        });

        const sessionPaymentIntent = session?.payment_intent;

        if (sessionPaymentIntent) {
          record.paymentIntentId =
            typeof sessionPaymentIntent === 'string' ? sessionPaymentIntent : sessionPaymentIntent.id;
          await record.save();
        }
      }

    try {
      const session = await stripe.checkout.sessions.retrieve(record.stripeSessionId, {
        expand: ['payment_intent.payment_method'],
      });

      if (!session || session.status !== 'complete' || session.payment_status !== 'paid') {
        return res.status(409).json({
          message: 'Checkout is still processing. Please wait a moment and try again.',
        });
      }

      const sessionPaymentIntent = session.payment_intent;
      const sessionPaymentMethod = sessionPaymentIntent?.payment_method;

      if (!sessionPaymentIntent) {
        return res.status(409).json({
          message: 'Payment is not ready yet. Retry shortly.',
        });
      }

      record.paymentIntentId =
        typeof sessionPaymentIntent === 'string' ? sessionPaymentIntent : sessionPaymentIntent.id;

      if (sessionPaymentMethod) {
        record.paymentMethodId =
          typeof sessionPaymentMethod === 'string' ? sessionPaymentMethod : sessionPaymentMethod.id;
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(record.paymentIntentId, {
        expand: ['charges.data.payment_method_details'],
      });

      if (paymentIntent.status !== 'succeeded') {
        return res.status(409).json({
          message: 'Payment intent not settled yet. Please retry shortly.',
        });
      }

      record.status = 'captured';
      record.capturedAt = new Date();
      record.lastError = null;
      await record.save();

      if (record.intent === 'wallet_top_up') {
        const amountDollars = (record.walletTopUpCents || record.totalAmount) / 100;
        const wallet = await addFunds(record.userId, amountDollars.toFixed(2), {
          source: 'stripe_payment_intent',
          paymentIntentId: record.paymentIntentId,
        });

        return res.status(200).json({
          status: 'captured',
          paymentIntentId: record.paymentIntentId,
          wallet: {
            balance: wallet.balance,
            balanceZero: wallet.balanceZero,
          },
        });
      }

      const subscription = await activateSubscriptionFromCheckout(record);

      return res.status(200).json({
        status: 'captured',
        paymentIntentId: record.paymentIntentId,
        subscription,
      });
    } catch (error) {
      console.error('Payment capture error for checkout', clientToken, error);

      record.status = 'failed';
      record.lastError = error.message;
      if (error?.payment_intent?.id) {
        record.paymentIntentId = error.payment_intent.id;
      }
      await record.save();

      const statusCode = error?.statusCode || error?.raw?.statusCode;
      const responseCode = typeof statusCode === 'number' && statusCode >= 400 ? statusCode : 400;

      return res.status(responseCode).json({
        message: error?.raw?.message || error.message || 'Failed to capture payment.',
        code: error?.code,
        declineCode: error?.decline_code,
      });
    }
  } catch (error) {
    console.error('Finalize checkout error:', error);
    return res.status(500).json({ message: 'Failed to finalize checkout session.' });
  }
});

module.exports = router;
