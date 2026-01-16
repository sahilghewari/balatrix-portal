const { truncateTables } = require('../helpers/db');
const { initializeDatabase } = require('../../app');
const Subscription = require('../../models/Subscription');
const User = require('../../models/User');
const CdrImportBatch = require('../../models/CdrImportBatch');
const CdrRecord = require('../../models/CdrRecord');
const { ingestBatch, ingestRealtime } = require('../../services/cdrService');

const RETRY_BACKOFF_MS = 50;

beforeAll(async () => {
  await initializeDatabase();
  process.env.USAGE_RATING_RETRY_BACKOFF_MS = String(RETRY_BACKOFF_MS);
});

beforeEach(async () => {
  await truncateTables();
});

async function createUserAndSubscription() {
  const user = await User.create({
    name: 'Usage Tester',
    email: `usage_${Date.now()}@example.com`,
    phone: '1234567890',
    passwordHash: 'test-hash',
    role: 'admin',
  });

  const subscription = await Subscription.create({
    userId: user.id,
    planTier: 'starter',
    planAmountCents: 0,
    addonAmountCents: 0,
    currency: 'usd',
    billingCycle: 'monthly',
    status: 'active',
    autoRenew: false,
  });

  return { user, subscription };
}

describe('CDR ingestion service', () => {
  test('ingestBatch stores normalized CDRs and updates batch counters', async () => {
    const { subscription } = await createUserAndSubscription();

    const payload = {
      source: 'kamailio_dump',
      records: [
        {
          providerCallId: 'call-1',
          direction: 'outbound',
          destination: '+15551234567',
          callStartedAt: '2025-01-14T10:00:00Z',
          callEndedAt: '2025-01-14T10:05:00Z',
          durationSeconds: 300,
          billableSeconds: 240,
          subscriptionId: subscription.id,
          currency: 'USD',
          rateCents: 20,
        },
        {
          providerCallId: 'call-2',
          direction: 'inbound',
          destination: '+15557654321',
          callStartedAt: '2025-01-14T11:00:00Z',
          duration: 120,
          subscriptionId: subscription.id,
        },
      ],
    };

    const result = await ingestBatch(payload);

    expect(result.processed).toBe(2);
    expect(result.failed).toBe(0);

    const batch = await CdrImportBatch.findByPk(result.batchId);
    expect(batch).not.toBeNull();
    expect(batch.status).toBe('completed');
    expect(batch.processedRecords).toBe(2);

    const records = await CdrRecord.findAll({ order: [['providerCallId', 'ASC']] });
    expect(records).toHaveLength(2);
    expect(records[0].direction).toBe('outbound');
    expect(records[0].billableSeconds).toBe(240);
    expect(records[0].currency).toBe('usd');
    expect(records[1].direction).toBe('inbound');
    expect(records[1].durationSeconds).toBe(120);
  });

  test('duplicates within batch are skipped and reported', async () => {
    const { subscription } = await createUserAndSubscription();

    const result = await ingestBatch({
      source: 'kamailio_dump',
      records: [
        {
          providerCallId: 'duplicate-call',
          direction: 'outbound',
          callStartedAt: '2025-01-14T12:00:00Z',
          durationSeconds: 60,
          subscriptionId: subscription.id,
        },
        {
          providerCallId: 'duplicate-call',
          direction: 'outbound',
          callStartedAt: '2025-01-14T12:05:00Z',
          durationSeconds: 90,
          subscriptionId: subscription.id,
        },
      ],
    });

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures[0].reason).toBe('duplicate');
  });

  test('ingestRealtime rejects duplicates and accepts valid record', async () => {
    const { subscription } = await createUserAndSubscription();

    const first = await ingestRealtime({
      providerCallId: 'live-call',
      direction: 'inbound',
      callStartedAt: '2025-01-14T13:00:00Z',
      durationSeconds: 45,
      subscriptionId: subscription.id,
    });

    expect(first.skipped).toBe(false);

    const second = await ingestRealtime({
      providerCallId: 'live-call',
      direction: 'inbound',
      callStartedAt: '2025-01-14T13:05:00Z',
      durationSeconds: 30,
      subscriptionId: subscription.id,
    });

    expect(second.skipped).toBe(true);
    expect(second.reason).toBe('duplicate');
  });

  test('invalid direction triggers failure in batch and schedules retry record', async () => {
    const result = await ingestBatch({
      source: 'kamailio_dump',
      records: [
        {
          providerCallId: 'bad-call',
          direction: 'sideways',
          callStartedAt: '2025-01-14T14:00:00Z',
        },
      ],
    });

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.failures[0].reason).toBe('invalid direction');

    const failures = await CdrRecord.findAll({ where: { status: 'failed' } });
    expect(failures).toHaveLength(1);
    expect(failures[0].attemptCount).toBe(1);
    expect(failures[0].retryAt).not.toBeNull();
  });
});
