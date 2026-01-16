const { Op } = require('sequelize');
const sequelize = require('../config/database');
const UsageDeductionBatch = require('../models/UsageDeductionBatch');
const SubscriptionUsageLedger = require('../models/SubscriptionUsageLedger');
const Subscription = require('../models/Subscription');
const { deductFunds } = require('./walletService');

const DEDUCTION_BATCH_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  INVOICED: 'invoiced',
};

function truncateToDate(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function fetchPendingBatches({ limit = 25, olderThan } = {}) {
  const where = {
    status: DEDUCTION_BATCH_STATUS.PENDING,
    pendingAmountCents: {
      [Op.gt]: 0,
    },
  };

  if (olderThan) {
    where.chargeDate = { [Op.lte]: truncateToDate(olderThan) };
  }

  return UsageDeductionBatch.findAll({
    where,
    order: [['chargeDate', 'ASC']],
    limit,
    include: [
      {
        model: Subscription,
        as: 'subscription',
        attributes: ['id', 'userId', 'currency'],
      },
    ],
  });
}

async function markBatchProcessing(batch, transaction) {
  batch.status = DEDUCTION_BATCH_STATUS.PROCESSING;
  batch.attemptCount += 1;
  batch.lastAttemptAt = new Date();
  await batch.save({ transaction, fields: ['status', 'attemptCount', 'lastAttemptAt'] });
}

async function markBatchCompleted(batch, transaction) {
  batch.status = DEDUCTION_BATCH_STATUS.COMPLETED;
  batch.pendingAmountCents = 0;
  batch.completedAt = new Date();
  await batch.save({ transaction, fields: ['status', 'pendingAmountCents', 'completedAt'] });
}

async function markBatchFailed(batch, reason, transaction) {
  batch.status = DEDUCTION_BATCH_STATUS.FAILED;
  batch.errorMessage = reason;
  await batch.save({ transaction, fields: ['status', 'errorMessage'] });
}

async function createLedgerEntry({ subscriptionId, amountCents, currency, metadata, occurredAt }, transaction) {
  await SubscriptionUsageLedger.create(
    {
      subscriptionId,
      occurredAt: occurredAt || new Date(),
      entryType: 'wallet_deduction',
      secondsDelta: 0,
      amountCents: amountCents * -1,
      currency,
      metadata,
    },
    { transaction }
  );
}

async function processBatch(batch, options = {}) {
  const transaction = options.transaction || (await sequelize.transaction());
  const external = Boolean(options.transaction);

  try {
    await markBatchProcessing(batch, transaction);

    const subscription = batch.subscription || (await Subscription.findByPk(batch.subscriptionId));
    if (!subscription) {
      throw new Error('Subscription missing for usage deduction batch');
    }

    const amountCents = batch.pendingAmountCents;
    if (amountCents <= 0) {
      await markBatchCompleted(batch, transaction);
      if (!external) await transaction.commit();
      return { status: 'skipped', reason: 'no_pending_amount' };
    }

    const amountDollars = (amountCents / 100).toFixed(2);

    await deductFunds(
      subscription.userId,
      amountDollars,
      {
        reason: 'usage_deduction',
        subscriptionId: subscription.id,
        usageChargeDate: batch.chargeDate,
      },
      { transaction }
    );

    await createLedgerEntry(
      {
        subscriptionId: subscription.id,
        amountCents,
        currency: batch.currency,
        metadata: {
          source: 'wallet',
          usageChargeDate: batch.chargeDate,
          usageBatchId: batch.id,
        },
        occurredAt: batch.chargeDate,
      },
      transaction
    );

    await markBatchCompleted(batch, transaction);

    if (!external) await transaction.commit();

    return { status: 'completed', amountCents };
  } catch (error) {
    if (!external && transaction) {
      await transaction.rollback();
    }

    console.error('Usage deduction batch failed', {
      batchId: batch.id,
      subscriptionId: batch.subscriptionId,
      error: error.message,
    });

    await UsageDeductionBatch.update(
      {
        status: DEDUCTION_BATCH_STATUS.FAILED,
        errorMessage: error.message,
        lastAttemptAt: new Date(),
      },
      { where: { id: batch.id } }
    );

    return { status: 'failed', reason: error.message };
  }
}

async function processPendingBatches({ limit = 25, olderThan } = {}) {
  const batches = await fetchPendingBatches({ limit, olderThan });
  const results = [];

  for (const batch of batches) {
    const result = await processBatch(batch);
    results.push({ batchId: batch.id, ...result });
  }

  return results;
}

module.exports = {
  fetchPendingBatches,
  processPendingBatches,
  processBatch,
  markBatchProcessing,
  markBatchCompleted,
  markBatchFailed,
};
