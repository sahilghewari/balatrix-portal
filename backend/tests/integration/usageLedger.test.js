const { truncateTables } = require('../helpers/db');
const { initializeDatabase } = require('../../app');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const CdrRecord = require('../../models/CdrRecord');
const SubscriptionUsageBalance = require('../../models/SubscriptionUsageBalance');
const SubscriptionUsageLedger = require('../../models/SubscriptionUsageLedger');
const UsageDeductionBatch = require('../../models/UsageDeductionBatch');
const { rateCdr } = require('../../services/ratingService');
const { processPendingBatches } = require('../../services/usageDeductionService');

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await truncateTables();
});

async function createSubscription({ planTier = 'starter', includedSeconds = 3000 } = {}) {
  const user = await User.create({
    name: 'Ledger Tester',
    email: `ledger_${Date.now()}@example.com`,
    phone: '5551230000',
    passwordHash: 'test',
    role: 'admin',
  });

  const subscription = await Subscription.create({
    userId: user.id,
    planTier,
    planAmountCents: 0,
    addonAmountCents: 0,
    currency: 'usd',
    billingCycle: 'monthly',
    status: 'active',
    autoRenew: false,
  });

  await SubscriptionUsageBalance.create({
    subscriptionId: subscription.id,
    billingPeriodStart: new Date('2025-01-01T00:00:00Z'),
    billingPeriodEnd: new Date('2025-01-31T23:59:59Z'),
    includedSeconds,
    remainingSeconds: includedSeconds,
  });

  return { user, subscription };
}

describe('Usage ledger and wallet deduction pipeline', () => {
  test('rates CDR, consumes free minutes, and schedules deduction batch', async () => {
    const { subscription } = await createSubscription({ includedSeconds: 300 });

    const cdr = await CdrRecord.create({
      subscriptionId: subscription.id,
      providerCallId: 'usage-call-1',
      direction: 'outbound',
      destination: '+15551234567',
      callStartedAt: '2025-01-05T10:00:00Z',
      durationSeconds: 600,
      billableSeconds: 600,
      currency: 'usd',
      status: 'pending',
    });

    const result = await rateCdr(cdr.id);

    expect(result.costCents).toBeGreaterThan(0);
    expect(result.freeSecondsApplied).toBe(300);
    expect(result.chargeableSeconds).toBe(300);

    const updatedBalance = await SubscriptionUsageBalance.findOne({ where: { subscriptionId: subscription.id } });
    expect(updatedBalance.remainingSeconds).toBe(0);

    const ledgerEntries = await SubscriptionUsageLedger.findAll({ where: { subscriptionId: subscription.id } });
    expect(ledgerEntries.length).toBe(2);

    const usageEntry = ledgerEntries.find((entry) => entry.entryType === 'usage_charge');
    expect(usageEntry.amountCents).toBe(result.costCents);

    const batch = await UsageDeductionBatch.findOne({ where: { subscriptionId: subscription.id } });
    expect(batch).not.toBeNull();
    expect(batch.pendingAmountCents).toBe(result.costCents);
  });

  test('processPendingBatches deducts wallet and records ledger entry', async () => {
    const { subscription, user } = await createSubscription({ includedSeconds: 0 });

    const cdr = await CdrRecord.create({
      subscriptionId: subscription.id,
      providerCallId: 'usage-call-2',
      direction: 'outbound',
      destination: '+15559871234',
      callStartedAt: '2025-01-06T11:00:00Z',
      durationSeconds: 120,
      billableSeconds: 120,
      currency: 'usd',
      status: 'pending',
    });

    await rateCdr(cdr.id);

    const { addFunds } = require('../../services/walletService');
    await addFunds(user.id, 100);

    const results = await processPendingBatches({ limit: 5 });
    expect(results.length).toBe(1);
    expect(results[0].status).toBe('completed');

    const batch = await UsageDeductionBatch.findOne({ where: { subscriptionId: subscription.id } });
    expect(batch.status).toBe('completed');
    expect(batch.pendingAmountCents).toBe(0);

    const ledgerEntries = await SubscriptionUsageLedger.findAll({ where: { subscriptionId: subscription.id, entryType: 'wallet_deduction' } });
    expect(ledgerEntries.length).toBe(1);
    expect(ledgerEntries[0].amountCents).toBeLessThan(0);
  });
});
