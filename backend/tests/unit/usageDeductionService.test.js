jest.mock('../../models/UsageDeductionBatch', () => ({
  findAll: jest.fn(),
  update: jest.fn(),
}));
jest.mock('../../models/Subscription', () => ({
  findByPk: jest.fn(),
}));
jest.mock('../../models/SubscriptionUsageLedger', () => ({
  create: jest.fn(),
}));
jest.mock('../../services/walletService', () => ({
  deductFunds: jest.fn(),
}));

const usageDeductionService = require('../../services/usageDeductionService');
const UsageDeductionBatch = require('../../models/UsageDeductionBatch');
const Subscription = require('../../models/Subscription');
const SubscriptionUsageLedger = require('../../models/SubscriptionUsageLedger');
const { deductFunds } = require('../../services/walletService');

const { fetchPendingBatches, processBatch } = usageDeductionService;

describe('usageDeductionService#fetchPendingBatches', () => {
  beforeEach(() => {
    UsageDeductionBatch.findAll.mockReset();
  });

  test('applies default filters for pending batches', async () => {
    UsageDeductionBatch.findAll.mockResolvedValue([]);

    await fetchPendingBatches();

    expect(UsageDeductionBatch.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'pending',
          pendingAmountCents: expect.any(Object),
        },
      })
    );
  });
});

describe('usageDeductionService#processBatch', () => {
  const baseBatch = () => ({
    id: 42,
    subscriptionId: 99,
    subscription: {
      id: 99,
      userId: 12,
      currency: 'usd',
    },
    pendingAmountCents: 500,
    status: 'pending',
    attemptCount: 0,
    chargeDate: new Date('2025-01-01T00:00:00Z'),
    save: jest.fn().mockResolvedValue(),
  });

  let transaction;

  beforeEach(() => {
    Subscription.findByPk.mockReset();
    SubscriptionUsageLedger.create.mockReset();
    deductFunds.mockReset();
    UsageDeductionBatch.update.mockReset();
    transaction = {
      commit: jest.fn(),
      rollback: jest.fn(),
    };
  });

  test('deducts wallet funds and records ledger entry when batch processes successfully', async () => {
    const batch = baseBatch();
    deductFunds.mockResolvedValue();

    const result = await processBatch(batch, { transaction });

    expect(result).toEqual({ status: 'completed', amountCents: 500 });
    expect(deductFunds).toHaveBeenCalledWith(
      batch.subscription.userId,
      '5.00',
      expect.objectContaining({
        reason: 'usage_deduction',
        subscriptionId: batch.subscriptionId,
      }),
      { transaction }
    );
    expect(SubscriptionUsageLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: batch.subscriptionId,
        amountCents: -500,
        entryType: 'wallet_deduction',
      }),
      { transaction }
    );
    expect(batch.status).toBe('completed');
    expect(batch.pendingAmountCents).toBe(0);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  test('marks batch failed when wallet deduction throws error', async () => {
    const batch = baseBatch();
    const error = new Error('insufficient funds');
    deductFunds.mockRejectedValue(error);

    const result = await processBatch(batch, { transaction });

    expect(result.status).toBe('failed');
    expect(result.reason).toContain('insufficient funds');
    expect(UsageDeductionBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'insufficient funds',
      }),
      { where: { id: batch.id } }
    );
    expect(transaction.rollback).not.toHaveBeenCalled();
  });
});
