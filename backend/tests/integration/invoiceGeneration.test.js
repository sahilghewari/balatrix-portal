const { initializeDatabase } = require('../../app');
const { truncateTables } = require('../helpers/db');
const { __setTestRates, resetCache } = require('../../services/currencyService');
const Invoice = require('../../models/Invoice');
const SubscriptionUsageLedger = require('../../models/SubscriptionUsageLedger');
const UsageDeductionBatch = require('../../models/UsageDeductionBatch');
const { createInvoiceForSubscription, determinePeriod } = require('../../services/invoiceService');
const { createUser, createSubscription, seedUsageBalance, seedUsageEntries } = require('../helpers/invoiceFactory');

beforeAll(async () => {
  await initializeDatabase();
});

beforeEach(async () => {
  await truncateTables();
  resetCache();
  __setTestRates({ usd: 1, eur: 0.92, inr: 0.012 });
});

afterAll(() => {
  resetCache();
});

describe('Invoice generation', () => {
  test('includes usage line item and wallet offsets for monthly cycle', async () => {
    const user = await createUser();
    const subscription = await createSubscription({ userId: user.id, billingCycle: 'monthly', planAmountCents: 4999 });
    await seedUsageBalance({ subscription });

    await seedUsageEntries({
      subscription,
      entries: [
        {
          occurredAt: new Date('2025-01-15T10:00:00Z'),
          entryType: 'free_minutes_consumed',
          secondsDelta: -300,
        },
        {
          occurredAt: new Date('2025-01-15T10:01:00Z'),
          entryType: 'usage_charge',
          amountCents: 250,
          currency: 'usd',
        },
        {
          occurredAt: new Date('2025-01-16T10:00:00Z'),
          entryType: 'wallet_deduction',
          amountCents: -250,
          currency: 'usd',
        },
      ],
    });

    await UsageDeductionBatch.create({
      subscriptionId: subscription.id,
      chargeDate: '2025-01-15',
      currency: 'usd',
      totalAmountCents: 250,
      pendingAmountCents: 0,
      status: 'completed',
    });

    const invoice = await createInvoiceForSubscription(subscription.id);

    expect(invoice).not.toBeNull();
    expect(invoice.usageAmountCents).toBe(250);
    expect(invoice.walletOffsetCents).toBe(250);
    expect(invoice.totalCents).toBe(invoice.planAmountCents + 250 - 250);
    expect(invoice.notes).toMatchObject({
      totalUsageCents: 250,
      walletOffsetsCents: 250,
      freeSecondsConsumed: 300,
    });
  });

  test('supports weekly cycle with proration and currency conversion', async () => {
    const user = await createUser();
    const subscription = await createSubscription({
      userId: user.id,
      billingCycle: 'weekly',
      planAmountCents: 1999,
      currency: 'usd',
      nextBillingDate: new Date('2025-01-08T00:00:00Z'),
    });

    await seedUsageEntries({
      subscription,
      entries: [
        {
          occurredAt: new Date('2025-01-05T09:00:00Z'),
          entryType: 'usage_charge',
          amountCents: 400,
          currency: 'usd',
        },
      ],
    });

    const { periodStart, periodEnd } = determinePeriod({
      nextBillingDate: subscription.nextBillingDate,
      billingCycle: subscription.billingCycle,
    });

    const totalDays = 7;
    const activeDays = 4;
    const prorationFactor = activeDays / totalDays;

    const invoice = await createInvoiceForSubscription(subscription.id, {
      periodStart,
      periodEnd,
      prorationFactor,
    });

    expect(invoice.billingCycle).toBe('weekly');
    expect(invoice.planAmountCents).toBe(Math.round(1999 * prorationFactor));
    expect(invoice.usageAmountCents).toBe(400);
    expect(invoice.totalCents).toBe(invoice.planAmountCents + 400);
  });

  test('handles currency conversion for usage entries', async () => {
    const user = await createUser();
    const subscription = await createSubscription({ userId: user.id, billingCycle: 'monthly', currency: 'eur', planAmountCents: 5999 });
    await seedUsageBalance({ subscription });

    await seedUsageEntries({
      subscription,
      entries: [
        {
          occurredAt: new Date('2025-01-10T10:00:00Z'),
          entryType: 'usage_charge',
          amountCents: 500,
          currency: 'usd',
        },
      ],
    });

    const invoice = await createInvoiceForSubscription(subscription.id);

    expect(invoice.currency).toBe('eur');
    expect(invoice.usageAmountCents).toBe(convertToCurrency(500, 'usd', 'eur'));
    expect(invoice.totalCents).toBe(invoice.planAmountCents + invoice.usageAmountCents - invoice.walletOffsetCents);
  });
});

function convertToCurrency(amount, from, to) {
  const { convertCents } = require('../../services/currencyService');
  return convertCents(amount, from, to);
}
