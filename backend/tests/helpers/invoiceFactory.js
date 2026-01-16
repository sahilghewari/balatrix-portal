const { randomUUID } = require('crypto');
const Subscription = require('../../models/Subscription');
const User = require('../../models/User');
const SubscriptionUsageBalance = require('../../models/SubscriptionUsageBalance');
const SubscriptionUsageLedger = require('../../models/SubscriptionUsageLedger');

async function createUser({ role = 'admin' } = {}) {
  const suffix = randomUUID().slice(0, 8);
  return User.create({
    name: `Invoice User ${suffix}`,
    email: `invoice_${suffix}@example.com`,
    phone: '5551234567',
    passwordHash: 'test-hash',
    role,
  });
}

async function createSubscription({
  userId,
  planTier = 'starter',
  billingCycle = 'monthly',
  planAmountCents = 4999,
  currency = 'usd',
  nextBillingDate,
} = {}) {
  const defaultNextBillingDate =
    billingCycle === 'weekly'
      ? new Date('2025-01-08T00:00:00Z')
      : billingCycle === 'monthly'
        ? new Date('2025-02-01T00:00:00Z')
        : new Date('2025-04-01T00:00:00Z');

  return Subscription.create({
    userId,
    planTier,
    planAmountCents,
    addonAmountCents: 0,
    currency,
    billingCycle,
    status: 'active',
    autoRenew: true,
    startDate: new Date('2025-01-01T00:00:00Z'),
    nextBillingDate: nextBillingDate || defaultNextBillingDate,
  });
}

async function seedUsageBalance({ subscription, includedSeconds = 6000, remainingSeconds = 6000 }) {
  return SubscriptionUsageBalance.create({
    subscriptionId: subscription.id,
    billingPeriodStart: new Date('2025-01-01T00:00:00Z'),
    billingPeriodEnd: new Date('2025-02-01T00:00:00Z'),
    includedSeconds,
    remainingSeconds,
  });
}

async function seedUsageEntries({ subscription, entries = [] }) {
  for (const entry of entries) {
    await SubscriptionUsageLedger.create({
      subscriptionId: subscription.id,
      occurredAt: entry.occurredAt,
      entryType: entry.entryType,
      secondsDelta: entry.secondsDelta || 0,
      amountCents: entry.amountCents || 0,
      currency: entry.currency || subscription.currency,
      metadata: entry.metadata || {},
    });
  }
}

module.exports = {
  createUser,
  createSubscription,
  seedUsageBalance,
  seedUsageEntries,
};
