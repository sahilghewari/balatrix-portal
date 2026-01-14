const sequelize = require('../config/database');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const StripeCheckoutSession = require('../models/StripeCheckoutSession');
const StripeWebhookEvent = require('../models/StripeWebhookEvent');
const { addFunds, deductFunds, getOrCreateWallet } = require('./walletService');
const { calculateTotal } = require('./pricingService');
const { activateSubscriptionFromCheckout } = require('./subscriptionService');
const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || 'usd';

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.length < 32) {
  throw new Error('STRIPE_SECRET_KEY must be configured with a secure value.');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
});

async function findDueSubscriptions({ limit = 50 } = {}) {
  const now = new Date();
  return Subscription.findAll({
    where: {
      status: 'active',
      autoRenew: true,
      nextBillingDate: {
        [sequelize.Op.lte]: now,
      },
    },
    include: [
      {
        model: User,
        as: 'user',
      },
    ],
    order: [['nextBillingDate', 'ASC']],
    limit,
  });
}

async function attemptWalletCharge(subscription, amountCents, options = {}) {
  const wallet = await getOrCreateWallet(subscription.userId, options);
  const amountDollars = (amountCents / 100).toFixed(2);

  if (parseFloat(wallet.balance) >= amountDollars) {
    await deductFunds(subscription.userId, amountDollars, {
      source: 'subscription_auto_renew',
      subscriptionId: subscription.id,
      transaction: options.transaction,
    });
    return { success: true, method: 'wallet' };
  }

  return { success: false, method: 'wallet' };
}

async function attemptStripeCharge(subscription, amountCents, options = {}) {
  const user = subscription.user;
  if (!user?.stripeCustomerId) {
    return { success: false, method: 'stripe', reason: 'missing_stripe_customer' };
  }

  const clientToken = `renew_${subscription.id}_${Date.now()}`;
  const metadata = {
    userId: subscription.userId,
    subscriptionId: subscription.id,
    intent: 'plan_purchase',
    planTier: subscription.planTier,
    billingCycle: subscription.billingCycle,
    clientToken,
    totalAmount: amountCents.toString(),
  };

  const sessionParams = {
    mode: 'payment',
    customer: user.stripeCustomerId,
    line_items: [
      {
        price_data: {
          currency: STRIPE_CURRENCY,
          unit_amount: amountCents,
          product_data: {
            name: `${subscription.planTier} plan auto-renew (${subscription.billingCycle})`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.STRIPE_SUCCESS_URL || 'https://example.com/success'}?session=${clientToken}`,
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://example.com/cancel',
    payment_intent_data: {
      metadata,
    },
    metadata,
  };

  const session = await stripe.checkout.sessions.create(sessionParams, {
    idempotencyKey: clientToken,
  });

  await StripeCheckoutSession.create(
    {
      userId: subscription.userId,
      clientToken,
      stripeSessionId: session.id,
      stripeCustomerId: user.stripeCustomerId,
      intent: 'plan_purchase',
      planTier: subscription.planTier,
      billingCycle: subscription.billingCycle,
      addons: [],
      planAmount: amountCents,
      addonAmount: 0,
      totalAmount: amountCents,
      walletTopUpCents: 0,
      currency: STRIPE_CURRENCY,
      status: 'pending',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
    { transaction: options.transaction }
  );

  return {
    success: true,
    method: 'stripe',
    sessionId: session.id,
    clientToken,
  };
}

async function scheduleNextBilling(subscription, options = {}) {
  const now = new Date();
  const next = new Date(subscription.nextBillingDate || now);

  const months = subscription.billingCycle === 'monthly' ? 1 : subscription.billingCycle === 'quarterly' ? 3 : 12;
  next.setMonth(next.getMonth() + months);

  subscription.nextBillingDate = next;
  subscription.lastChargeAttemptAt = now;
  await subscription.save({ transaction: options.transaction });
}

async function handleFailedCharge(subscription, reason, options = {}) {
  subscription.lastChargeAttemptAt = new Date();
  subscription.balanceZeroFlaggedAt = subscription.balanceZeroFlaggedAt || new Date();
  await subscription.save({ transaction: options.transaction });

  const user = subscription.user;
  if (user) {
    const wallet = await getOrCreateWallet(user.id, options);
    wallet.balanceZero = true;
    await wallet.save({ transaction: options.transaction });
  }

  console.warn('Auto-renew charge failed', {
    subscriptionId: subscription.id,
    userId: subscription.userId,
    reason,
    nextBillingDate: subscription.nextBillingDate,
  });

  return { success: false, method: 'failed', reason };
}

async function processSubscriptionRenewal(subscription, options = {}) {
  const amountCents = subscription.planAmountCents + subscription.addonAmountCents;

  return sequelize.transaction({ transaction: options.transaction }, async (transaction) => {
    const walletResult = await attemptWalletCharge(subscription, amountCents, { transaction });
    if (walletResult.success) {
      await scheduleNextBilling(subscription, { transaction });
      return { ...walletResult, amountCents };
    }

    const stripeResult = await attemptStripeCharge(subscription, amountCents, { transaction });
    if (stripeResult.success) {
      await scheduleNextBilling(subscription, { transaction });
      return { ...stripeResult, amountCents };
    }

    return handleFailedCharge(subscription, stripeResult.reason || 'wallet_and_stripe_failed', {
      transaction,
    });
  });
}

async function processDueSubscriptions({ limit = 50 } = {}) {
  const subscriptions = await findDueSubscriptions({ limit });
  const results = [];

  for (const subscription of subscriptions) {
    try {
      const outcome = await processSubscriptionRenewal(subscription);

      if (!outcome.success) {
        console.warn('Auto-renew outcome indicates failure', {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          reason: outcome.reason,
        });
      }

      results.push({ subscriptionId: subscription.id, outcome });
    } catch (error) {
      console.error('Auto-renew processing failed', subscription.id, error);
      results.push({ subscriptionId: subscription.id, error: error.message });
    }
  }

  return results;
}

module.exports = {
  findDueSubscriptions,
  processSubscriptionRenewal,
  processDueSubscriptions,
};
