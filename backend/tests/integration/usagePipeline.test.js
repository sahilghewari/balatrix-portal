const { initializeDatabase } = require('../../app');
const { truncateTables } = require('../helpers/db');
const { ingestBatch } = require('../../services/cdrService');
const { ratePendingCdrs } = require('../../services/ratingService');
const { processPendingBatches } = require('../../services/usageDeductionService');
const { createInvoiceForSubscription } = require('../../services/invoiceService');
const SubscriptionUsageBalance = require('../../models/SubscriptionUsageBalance');
const SubscriptionUsageLedger = require('../../models/SubscriptionUsageLedger');
const UsageDeductionBatch = require('../../models/UsageDeductionBatch');
const Invoice = require('../../models/Invoice');
const { addFunds } = require('../../services/walletService');
const { createUser, createSubscription, seedUsageBalance } = require('../helpers/invoiceFactory');

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await truncateTables();
});

describe('End-to-end usage pipeline', () => {
  test('ingests CDR, rates usage, deducts wallet, and generates invoice line items', async () => {
    const user = await createUser();
    const subscription = await createSubscription({
      userId: user.id,
      planTier: 'starter',
      planAmountCents: 5000,
      billingCycle: 'monthly',
      currency: 'usd',
    });

    await seedUsageBalance({
      subscription,
      includedSeconds: 300,
      remainingSeconds: 300,
    });

    const batch = await ingestBatch({
      source: 'integration-test',
      records: [
        {
          providerCallId: 'pipeline-call-1',
          direction: 'outbound',
          destination: '+15551234567',
          callStartedAt: '2025-01-10T10:00:00Z',
          callEndedAt: '2025-01-10T10:10:00Z',
          durationSeconds: 600,
          billableSeconds: 600,
          subscriptionId: subscription.id,
          userId: user.id,
          currency: 'usd',
        },
      ],
    });

    expect(batch.processed).toBe(1);

    const ratingSummary = await ratePendingCdrs({ limit: 10 });
    expect(ratingSummary.total).toBe(1);
    expect(ratingSummary.processed[0].status).toBe('rated');

    const updatedBalance = await SubscriptionUsageBalance.findOne({
      where: { subscriptionId: subscription.id },
    });
    expect(updatedBalance.remainingSeconds).toBe(0);
    expect(updatedBalance.consumedSeconds).toBeGreaterThan(0);

    const ledgerEntries = await SubscriptionUsageLedger.findAll({
      where: { subscriptionId: subscription.id },
    });
    expect(ledgerEntries.length).toBeGreaterThanOrEqual(2);

    const usageCharge = ledgerEntries.find((entry) => entry.entryType === 'usage_charge');
    expect(usageCharge).toBeDefined();
    expect(usageCharge.amountCents).toBeGreaterThan(0);

    // Seed wallet with exact usage charge amount (balance recorded as negative cents)
    await addFunds(user.id, 1000);

    const deductionResults = await processPendingBatches({ limit: 5 });
    expect(deductionResults.length).toBe(1);
    expect(deductionResults[0].status).toBe('completed');

    const usageBatch = await UsageDeductionBatch.findOne({ where: { subscriptionId: subscription.id } });
    expect(usageBatch.status).toBe('completed');

    const invoice = await createInvoiceForSubscription(subscription.id);
    expect(invoice).toBeInstanceOf(Invoice);
    expect(invoice.usageAmountCents).toBe(usageCharge.amountCents);
    expect(invoice.walletOffsetCents).toBe(usageCharge.amountCents);
  });
});
