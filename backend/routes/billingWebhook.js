const dotenv = require('dotenv');
const Stripe = require('stripe');
const StripeCheckoutSession = require('../models/StripeCheckoutSession');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const User = require('../models/User');
const { handlePaymentIntentEvent } = require('../services/walletTopUpService');

dotenv.config();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.length < 32) {
  throw new Error('STRIPE_SECRET_KEY must be configured with a secure value.');
}

if (!STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET.length < 16) {
  throw new Error('STRIPE_WEBHOOK_SECRET must be configured for webhook validation.');
}

const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || 'usd';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20',
});

module.exports = async function billingWebhookHandler(req, res) {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  let webhookRecord;

  try {
    webhookRecord = await StripeWebhookEvent.findOne({ where: { eventId: event.id } });

    if (webhookRecord && webhookRecord.status === 'processed') {
      return res.json({ received: true, deduplicated: true });
    }

    if (!webhookRecord) {
      webhookRecord = await StripeWebhookEvent.create({
        eventId: event.id,
        type: event.type,
        status: 'processing',
      });
    } else {
      webhookRecord.attempts += 1;
      webhookRecord.status = 'processing';
      webhookRecord.processedAt = null;
      webhookRecord.lastError = null;
      await webhookRecord.save();
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      }
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired': {
        await handleCheckoutSessionExpired(event.data.object);
        break;
      }
      case 'invoice.payment_failed': {
        await handlePaymentFailed(event.data.object);
        break;
      }
      case 'payment_intent.succeeded':
      case 'payment_intent.processing':
      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
      case 'payment_intent.requires_action': {
        await handlePaymentIntentEvent(event);
        break;
      }
      default:
        break;
    }

    webhookRecord.status = 'processed';
    webhookRecord.processedAt = new Date();
    webhookRecord.lastError = null;
    await webhookRecord.save();

    return res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler error:', error);

    if (webhookRecord) {
      webhookRecord.status = 'failed';
      webhookRecord.lastError = error.message;
      webhookRecord.processedAt = null;
      await webhookRecord.save();
    }

    return res.status(500).json({ message: 'Webhook processing failed.' });
  }
};

async function handleCheckoutSessionCompleted(session) {
  const metadata = session.metadata || {};
  const clientToken = metadata.clientToken;

  if (!clientToken) {
    console.warn('Checkout session completed without clientToken metadata');
    return;
  }

  const record = await StripeCheckoutSession.findOne({ where: { clientToken } });
  if (!record) {
    console.warn('No checkout session record for clientToken', clientToken);
    return;
  }

  record.status = 'awaiting_capture';
  record.setupIntentId = session.setup_intent || null;
  record.paymentIntentId = session.payment_intent || null;
  record.paymentMethodId = session.payment_method || null;
  record.lastError = null;
  await record.save();

  if (session.setup_intent) {
    const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
    if (setupIntent?.payment_method) {
      record.paymentMethodId = setupIntent.payment_method;
      await record.save();
    }
  }

  const user = await User.findByPk(record.userId);
  if (user && session.customer && user.stripeCustomerId !== session.customer) {
    user.stripeCustomerId = session.customer;
    user.stripeCustomerCreatedAt = user.stripeCustomerCreatedAt || new Date();
    await user.save();
  }
}

async function handleCheckoutSessionExpired(session) {
  const clientToken = session.metadata?.clientToken;
  if (!clientToken) return;

  const record = await StripeCheckoutSession.findOne({ where: { clientToken } });
  if (!record) return;

  record.status = 'expired';
  record.lastError = 'Checkout session expired before completion.';
  await record.save();
}

async function handlePaymentFailed(invoice) {
  const clientToken = invoice.metadata?.clientToken;
  if (!clientToken) return;

  const record = await StripeCheckoutSession.findOne({ where: { clientToken } });
  if (!record) return;

  record.status = 'failed';
  record.lastError = 'Payment failed for associated invoice/payment intent.';
  await record.save();
}
