const { Op } = require('sequelize');
const sequelize = require('../config/database');
const CdrRecord = require('../models/CdrRecord');
const SubscriptionUsageBalance = require('../models/SubscriptionUsageBalance');
const SubscriptionUsageLedger = require('../models/SubscriptionUsageLedger');
const UsageDeductionBatch = require('../models/UsageDeductionBatch');
const Subscription = require('../models/Subscription');

const DEDUCTION_BATCH_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

const MAX_RATE_PER_RUN = Number(process.env.USAGE_RATING_MAX_PER_RUN || 200);
const RETRY_BACKOFF_MS = Number(process.env.USAGE_RATING_RETRY_BACKOFF_MS || 5 * 60 * 1000);

function normalizeCurrency(value) {
  return (value || 'usd').toLowerCase();
}

function toChargeDate(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const DEFAULT_RATE_CARD = {
  starter: {
    default: { rateCentsPerMinute: 20, includedSeconds: 3000 },
  },
  professional: {
    default: { rateCentsPerMinute: 18, includedSeconds: 6000 },
  },
  call_center: {
    default: { rateCentsPerMinute: 15, includedSeconds: 12000 },
  },
};

function getPlanRate(subscription, cdr) {
  const tierRates = DEFAULT_RATE_CARD[subscription.planTier] || DEFAULT_RATE_CARD.starter;
  return tierRates[cdr.destinationGroup] || tierRates.default;
}

function toCentsFromSeconds(seconds, rateCentsPerMinute) {
  if (!seconds || seconds <= 0) return 0;
  const minutes = seconds / 60;
  return Math.round(minutes * rateCentsPerMinute);
}

async function getCurrentBalance(subscriptionId, callStartedAt, transaction) {
  const balance = await SubscriptionUsageBalance.findOne({
    where: {
      subscriptionId,
      billingPeriodStart: { [Op.lte]: callStartedAt },
      billingPeriodEnd: { [Op.gte]: callStartedAt },
    },
    transaction,
    order: [['createdAt', 'DESC']],
  });

  return balance;
}

async function ensureBalance(subscription, callStartedAt, transaction) {
  let balance = await getCurrentBalance(subscription.id, callStartedAt, transaction);
  if (balance) return balance;

  const planRate = getPlanRate(subscription, {});
  const start = new Date(callStartedAt);
  const end = new Date(start);
  const months = subscription.billingCycle === 'monthly' ? 1 : subscription.billingCycle === 'quarterly' ? 3 : 12;
  end.setMonth(end.getMonth() + months);

  balance = await SubscriptionUsageBalance.create(
    {
      subscriptionId: subscription.id,
      billingPeriodStart: start,
      billingPeriodEnd: end,
      includedSeconds: planRate.includedSeconds,
      remainingSeconds: planRate.includedSeconds,
    },
    { transaction }
  );

  return balance;
}

async function recordLedgerEntries({ subscription, cdr, freeSecondsApplied, costCents, balance, transaction }) {
  const entries = [];
  const subscriptionCurrency = normalizeCurrency(subscription.currency);

  if (freeSecondsApplied > 0) {
    entries.push({
      subscriptionId: subscription.id,
      cdrRecordId: cdr.id,
      occurredAt: cdr.callStartedAt,
      entryType: 'free_minutes_consumed',
      secondsDelta: -freeSecondsApplied,
      amountCents: 0,
      balanceSecondsAfter: balance.remainingSeconds,
      metadata: {
        providerCallId: cdr.providerCallId,
      },
    });
  }

  if (costCents > 0) {
    entries.push({
      subscriptionId: subscription.id,
      cdrRecordId: cdr.id,
      occurredAt: cdr.callStartedAt,
      entryType: 'usage_charge',
      secondsDelta: 0,
      amountCents: costCents,
      currency: subscriptionCurrency,
      metadata: {
        providerCallId: cdr.providerCallId,
      },
    });
  }

  if (entries.length > 0) {
    await SubscriptionUsageLedger.bulkCreate(entries, { transaction });
  }
}

async function enqueueUsageDeduction({ subscription, cdr, costCents, transaction }) {
  if (costCents <= 0) return;

  const subscriptionCurrency = normalizeCurrency(subscription.currency);
  const chargeDate = toChargeDate(cdr.callStartedAt);
  const [batch] = await UsageDeductionBatch.findOrCreate({
    where: { subscriptionId: subscription.id, chargeDate },
    defaults: {
      currency: subscriptionCurrency,
      totalAmountCents: 0,
      pendingAmountCents: 0,
      status: DEDUCTION_BATCH_STATUS.PENDING,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (batch.currency !== subscriptionCurrency) {
    batch.status = DEDUCTION_BATCH_STATUS.FAILED;
    batch.pendingAmountCents = batch.pendingAmountCents || 0;
    await batch.save({ transaction });
    throw new Error(`Usage batch currency mismatch for subscription ${subscription.id}`);
  }

  batch.totalAmountCents += costCents;
  batch.pendingAmountCents += costCents;
  batch.status = DEDUCTION_BATCH_STATUS.PENDING;
  batch.retryAfter = null;
  await batch.save({ transaction, fields: ['totalAmountCents', 'pendingAmountCents', 'status', 'retryAfter'] });
}

async function rateCdr(cdrRecordId) {
  return sequelize.transaction(async (transaction) => {
    const cdr = await CdrRecord.findByPk(cdrRecordId, {
      transaction,
      include: [{ model: Subscription, as: 'subscription' }],
      lock: transaction.LOCK.UPDATE,
    });

    if (!cdr) {
      throw new Error('CDR not found');
    }

    if (!cdr.subscription) {
      cdr.status = 'failed';
      cdr.errorMessage = 'No subscription linked';
      cdr.retryAt = null;
      await cdr.save({ transaction, fields: ['status', 'errorMessage', 'retryAt'] });
      return { status: 'failed', reason: 'subscription_missing' };
    }

    const subscription = cdr.subscription;
    const subscriptionCurrency = normalizeCurrency(subscription.currency);
    const cdrCurrency = normalizeCurrency(cdr.currency);

    if (cdrCurrency !== subscriptionCurrency) {
      cdr.status = 'failed';
      cdr.errorMessage = `Currency mismatch: CDR ${cdrCurrency} vs subscription ${subscriptionCurrency}`;
      cdr.retryAt = null;
      await cdr.save({ transaction, fields: ['status', 'errorMessage', 'retryAt'] });
      return { status: 'failed', reason: 'currency_mismatch' };
    }

    const planRate = getPlanRate(subscription, cdr);
    const balance = await ensureBalance(subscription, cdr.callStartedAt, transaction);

    const freeSecondsAvailable = Math.max(0, balance.remainingSeconds);
    const freeSecondsApplied = Math.min(freeSecondsAvailable, cdr.billableSeconds || cdr.durationSeconds);
    const chargeableSeconds = Math.max(0, (cdr.billableSeconds || cdr.durationSeconds) - freeSecondsApplied);
    const rateApplied = planRate.rateCentsPerMinute;
    const costCents = toCentsFromSeconds(chargeableSeconds, rateApplied);

    balance.remainingSeconds = Math.max(0, freeSecondsAvailable - freeSecondsApplied);
    balance.consumedSeconds += freeSecondsApplied;
    await balance.save({ transaction, fields: ['remainingSeconds', 'consumedSeconds'] });

    cdr.rateCents = rateApplied;
    cdr.costCents = costCents;
    cdr.status = 'rated';
    cdr.retryAt = null;
    cdr.attemptCount = 0;
    await cdr.save({ transaction, fields: ['rateCents', 'costCents', 'status', 'retryAt', 'attemptCount'] });

    await recordLedgerEntries({ subscription, cdr, freeSecondsApplied, costCents, balance, transaction });
    await enqueueUsageDeduction({ subscription, cdr, costCents, transaction });

    return {
      cdrId: cdr.id,
      freeSecondsApplied,
      chargeableSeconds,
      costCents,
      rateCentsPerMinute: rateApplied,
      balanceRemainingSeconds: balance.remainingSeconds,
      currency: subscriptionCurrency,
    };
  });
}

async function markForRetry(record, error) {
  const nextAttempt = (record.attemptCount || 0) + 1;
  const retryAt = new Date(Date.now() + RETRY_BACKOFF_MS * Math.min(nextAttempt, 10));
  await record.update(
    {
      status: 'failed',
      errorMessage: error.message,
      attemptCount: nextAttempt,
      retryAt,
    },
    {
      fields: ['status', 'errorMessage', 'attemptCount', 'retryAt'],
    }
  );
}

async function ratePendingCdrs({ limit = MAX_RATE_PER_RUN } = {}) {
  const now = new Date();
  const pending = await CdrRecord.findAll({
    where: {
      status: { [Op.in]: ['pending', 'failed'] },
      [Op.or]: [{ retryAt: null }, { retryAt: { [Op.lte]: now } }],
    },
    order: [['createdAt', 'ASC']],
    limit,
  });

  const results = [];

  for (const record of pending) {
    try {
      const outcome = await rateCdr(record.id);
      results.push({ cdrId: record.id, status: 'rated', detail: outcome });
    } catch (error) {
      await markForRetry(record, error);
      results.push({ cdrId: record.id, status: 'errored', error: error.message });
      console.error('CDR rating failed', {
        cdrId: record.id,
        error: error.message,
      });
    }
  }

  return {
    total: pending.length,
    processed: results,
  };
}

module.exports = {
  rateCdr,
  getPlanRate,
  ratePendingCdrs,
};
