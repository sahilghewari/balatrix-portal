const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Invoice = require('../models/Invoice');
const Subscription = require('../models/Subscription');
const SubscriptionUsageLedger = require('../models/SubscriptionUsageLedger');
const SubscriptionUsageBalance = require('../models/SubscriptionUsageBalance');
const UsageDeductionBatch = require('../models/UsageDeductionBatch');
const { convertCents } = require('./currencyService');

function toDateOnly(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function determinePeriod({ nextBillingDate, billingCycle, cycleStartOverride, periodEndOverride } = {}) {
  const end = periodEndOverride ? new Date(periodEndOverride) : nextBillingDate ? new Date(nextBillingDate) : new Date();
  const start = cycleStartOverride ? new Date(cycleStartOverride) : new Date(end);

  const months = billingCycle === 'weekly' ? 0 : billingCycle === 'monthly' ? 1 : billingCycle === 'quarterly' ? 3 : 12;
  if (billingCycle === 'weekly') {
    start.setDate(end.getDate() - 7);
  } else {
    start.setMonth(end.getMonth() - months);
  }

  return { periodStart: start, periodEnd: end };
}

async function getUsageSummary({ subscriptionId, periodStart, periodEnd, targetCurrency, transaction }) {
  const usageEntries = await SubscriptionUsageLedger.findAll({
    where: {
      subscriptionId,
      occurredAt: {
        [Op.gte]: periodStart,
        [Op.lt]: periodEnd,
      },
      entryType: { [Op.in]: ['usage_charge', 'wallet_deduction', 'free_minutes_consumed'] },
    },
    order: [['occurredAt', 'ASC']],
    transaction,
  });

  let usageCents = 0;
  let walletOffsetsCents = 0;
  let freeSecondsConsumed = 0;

  usageEntries.forEach((entry) => {
    if (entry.entryType === 'usage_charge') {
      const amount = convertCents(entry.amountCents, entry.currency, targetCurrency);
      usageCents += amount;
    } else if (entry.entryType === 'wallet_deduction') {
      const amount = convertCents(Math.abs(entry.amountCents), entry.currency, targetCurrency);
      walletOffsetsCents += amount;
    } else if (entry.entryType === 'free_minutes_consumed') {
      freeSecondsConsumed += Math.abs(entry.secondsDelta);
    }
  });

  return {
    usageEntries,
    usageCents,
    walletOffsetsCents,
    freeSecondsConsumed,
  };
}

function buildUsageLineItem({ usageCents, freeSecondsConsumed, walletOffsetsCents, currency }) {
  if (usageCents === 0 && walletOffsetsCents === 0) {
    return null;
  }

  const minutes = freeSecondsConsumed / 60;
  return {
    description: 'Telephony usage charges',
    amountCents: usageCents,
    currency,
    metadata: {
      freeMinutesConsumed: minutes,
      walletOffsetsCents,
    },
  };
}

function buildPlanLineItem({ planAmountCents, currency }) {
  if (!planAmountCents) {
    return null;
  }

  return {
    description: 'Subscription plan',
    amountCents: planAmountCents,
    currency,
  };
}

function buildSummaryNotes({ usageSummary, planAmountCents, currency }) {
  return {
    currency,
    totalUsageCents: usageSummary.usageCents,
    walletOffsetsCents: usageSummary.walletOffsetsCents,
    freeSecondsConsumed: usageSummary.freeSecondsConsumed,
    planAmountCents,
  };
}

async function generateInvoice({
  subscription,
  periodStart,
  periodEnd,
  planAmountCents,
  targetCurrency,
  prorationFactor = 1,
  transaction,
}) {
  const usageSummary = await getUsageSummary({
    subscriptionId: subscription.id,
    periodStart,
    periodEnd,
    targetCurrency,
    transaction,
  });

  const proratedPlanAmount = Math.round((planAmountCents || 0) * prorationFactor);

  const lineItems = [];
  const planLine = buildPlanLineItem({ planAmountCents: proratedPlanAmount, currency: targetCurrency });
  if (planLine) {
    lineItems.push(planLine);
  }

  const usageLine = buildUsageLineItem({
    usageCents: usageSummary.usageCents,
    freeSecondsConsumed: usageSummary.freeSecondsConsumed,
    walletOffsetsCents: usageSummary.walletOffsetsCents,
    currency: targetCurrency,
  });
  if (usageLine) {
    lineItems.push(usageLine);
  }

  const subtotalCents = lineItems.reduce((total, item) => total + item.amountCents, 0);
  const walletOffsetCents = usageSummary.walletOffsetsCents;
  const totalCents = Math.max(0, subtotalCents - walletOffsetCents);

  const invoiceNumber = `INV-${subscription.id.slice(0, 8)}-${Date.now()}`;

  const invoice = await Invoice.create(
    {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      invoiceNumber,
      billingCycle: subscription.billingCycle,
      periodStart,
      periodEnd,
      issueDate: new Date(),
      dueDate: subscription.billingCycle === 'weekly' ? new Date(periodEnd.getTime() + 3 * 24 * 60 * 60 * 1000) : new Date(periodEnd.getTime() + 14 * 24 * 60 * 60 * 1000),
      planAmountCents: proratedPlanAmount,
      usageAmountCents: usageSummary.usageCents,
      walletOffsetCents,
      subtotalCents,
      totalCents,
      currency: targetCurrency,
      notes: buildSummaryNotes({ usageSummary, planAmountCents: proratedPlanAmount, currency: targetCurrency }),
    },
    { transaction }
  );

  invoice.setDataValue('lineItems', lineItems);
  return invoice;
}

async function ensureInvoiceNotDuplicate({ subscriptionId, periodStart, periodEnd, transaction }) {
  const existing = await Invoice.findOne({
    where: {
      subscriptionId,
      periodStart,
      periodEnd,
    },
    transaction,
    lock: transaction?.LOCK?.KEY_SHARE || undefined,
  });

  return existing;
}

async function createInvoiceInternal(subscriptionId, options = {}) {
  const { transaction, periodStart: periodStartOverride, periodEnd: periodEndOverride, prorationFactor } = options;

  const subscription = await Subscription.findByPk(subscriptionId, {
    include: [{ model: SubscriptionUsageBalance, as: 'usageBalances', where: { status: 'open' }, required: false }],
    transaction,
  });

  if (!subscription) {
    throw new Error('Subscription not found');
  }

  const { periodStart, periodEnd } = determinePeriod({
    nextBillingDate: subscription.nextBillingDate,
    billingCycle: subscription.billingCycle,
    cycleStartOverride: periodStartOverride,
    periodEndOverride,
  });

  const duplicate = await ensureInvoiceNotDuplicate({
    subscriptionId: subscription.id,
    periodStart,
    periodEnd,
    transaction,
  });

  if (duplicate) {
    return duplicate;
  }

  const planAmountCents = subscription.planAmountCents;
  const targetCurrency = subscription.currency || 'usd';

  const normalizedProration = typeof prorationFactor === 'number' && prorationFactor > 0 ? prorationFactor : 1;

  const invoice = await generateInvoice({
    subscription,
    periodStart,
    periodEnd,
    planAmountCents,
    targetCurrency,
    prorationFactor: normalizedProration,
    transaction,
  });

  await UsageDeductionBatch.update(
    {
      status: 'invoiced',
    },
    {
      where: {
        subscriptionId: subscription.id,
        chargeDate: {
          [Op.gte]: toDateOnly(periodStart),
          [Op.lt]: toDateOnly(periodEnd),
        },
        status: { [Op.in]: ['completed'] },
      },
      transaction,
    }
  );

  return invoice;
}

async function createInvoiceForSubscription(subscriptionId, options = {}) {
  if (options.transaction) {
    return createInvoiceInternal(subscriptionId, options);
  }

  return sequelize.transaction((transaction) =>
    createInvoiceInternal(subscriptionId, {
      ...options,
      transaction,
    })
  );
}

module.exports = {
  createInvoiceForSubscription,
  createInvoiceInternal,
  determinePeriod,
  generateInvoice,
  getUsageSummary,
};
