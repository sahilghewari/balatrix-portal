const { Op } = require('sequelize');
const sequelize = require('../config/database');
const WalletTopUp = require('../models/WalletTopUp');
const { creditCents } = require('./walletService');
const { stripe } = require('./stripe');

const TOP_UP_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  REQUIRES_ACTION: 'requires_action',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELED: 'canceled',
};

function buildIdempotencyKey({ walletId, amountCents, timestamp }) {
  return `wallet-${walletId}-${amountCents}-${timestamp}`;
}

async function createTopUp({
  user,
  wallet,
  subscriptionId = null,
  amountCents,
  currency,
  paymentMethodId = null,
  metadata = {},
}) {
  if (!amountCents || amountCents <= 0) {
    throw new Error('amountCents must be positive');
  }

  const now = Date.now();
  const idempotencyKey = buildIdempotencyKey({ walletId: wallet.id, amountCents, timestamp: now });

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency,
      customer: user.stripeCustomerId || undefined,
      payment_method: paymentMethodId || undefined,
      confirmation_method: paymentMethodId ? 'automatic' : 'automatic',
      confirm: Boolean(paymentMethodId),
      description: `${process.env.APP_NAME || 'Telecom'} wallet top-up`,
      metadata: {
        walletId: wallet.id,
        userId: user.id,
        subscriptionId: subscriptionId || '',
        amountCents: String(amountCents),
      },
    },
    { idempotencyKey }
  );

  const topUp = await WalletTopUp.create({
    walletId: wallet.id,
    userId: user.id,
    subscriptionId,
    amountCents,
    currency,
    status:
      paymentIntent.status === 'requires_action'
        ? TOP_UP_STATUSES.REQUIRES_ACTION
        : TOP_UP_STATUSES.PENDING,
    stripePaymentIntentId: paymentIntent.id,
    clientSecret: paymentIntent.client_secret,
    metadata,
    createdBy: user.id,
  });

  return { topUp, paymentIntent };
}

async function markTopUpProcessing(topUpId) {
  return WalletTopUp.update(
    { status: TOP_UP_STATUSES.PROCESSING },
    {
      where: {
        id: topUpId,
        status: {
          [Op.in]: [TOP_UP_STATUSES.PENDING, TOP_UP_STATUSES.REQUIRES_ACTION],
        },
      },
    }
  );
}

async function markTopUpFailed(topUp, reason) {
  topUp.status = TOP_UP_STATUSES.FAILED;
  topUp.metadata = { ...topUp.metadata, failureReason: reason };
  await topUp.save();
  return topUp;
}

async function markTopUpSucceeded(topUp, options = {}) {
  const transaction = options.transaction || (await sequelize.transaction());
  const external = Boolean(options.transaction);

  try {
    topUp.status = TOP_UP_STATUSES.SUCCEEDED;
    topUp.processedAt = new Date();
    await topUp.save({ transaction });

    await creditCents(
      topUp.userId,
      BigInt(topUp.amountCents),
      {
        source: 'stripe_top_up',
        stripePaymentIntentId: topUp.stripePaymentIntentId,
        walletTopUpId: topUp.id,
      },
      { transaction }
    );

    if (!external) await transaction.commit();
    return topUp;
  } catch (error) {
    if (!external && transaction) await transaction.rollback();
    throw error;
  }
}

async function handlePaymentIntentEvent(event) {
  const paymentIntent = event.data.object;
  const topUp = await WalletTopUp.findOne({ where: { stripePaymentIntentId: paymentIntent.id } });

  if (!topUp) {
    return null;
  }

  if ([TOP_UP_STATUSES.SUCCEEDED, TOP_UP_STATUSES.FAILED, TOP_UP_STATUSES.CANCELED].includes(topUp.status)) {
    return topUp;
  }

  if (event.type === 'payment_intent.succeeded') {
    await markTopUpProcessing(topUp.id);
    return markTopUpSucceeded(topUp);
  }

  if (event.type === 'payment_intent.payment_failed') {
    return markTopUpFailed(topUp, paymentIntent.last_payment_error?.message || 'Payment failed');
  }

  if (event.type === 'payment_intent.canceled') {
    topUp.status = TOP_UP_STATUSES.CANCELED;
    topUp.metadata = { ...topUp.metadata, cancelReason: paymentIntent.cancellation_reason };
    await topUp.save();
    return topUp;
  }

  if (event.type === 'payment_intent.processing') {
    await markTopUpProcessing(topUp.id);
    return topUp.reload();
  }

  if (event.type === 'payment_intent.requires_action') {
    topUp.status = TOP_UP_STATUSES.REQUIRES_ACTION;
    await topUp.save();
    return topUp;
  }

  return topUp;
}

async function listTopUps(userId, { limit = 20, offset = 0 } = {}) {
  return WalletTopUp.findAndCountAll({
    where: { userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });
}

module.exports = {
  TOP_UP_STATUSES,
  createTopUp,
  markTopUpSucceeded,
  markTopUpFailed,
  markTopUpProcessing,
  handlePaymentIntentEvent,
  listTopUps,
};
