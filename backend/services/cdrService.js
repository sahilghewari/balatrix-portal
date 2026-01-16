const { Op } = require('sequelize');
const sequelize = require('../config/database');
const CdrImportBatch = require('../models/CdrImportBatch');
const CdrRecord = require('../models/CdrRecord');
const Subscription = require('../models/Subscription');

const RETRY_BACKOFF_MS = Number(
  process.env.CDR_RETRY_BACKOFF_MS || process.env.USAGE_RATING_RETRY_BACKOFF_MS || 5 * 60 * 1000
);

function normalizeDirection(direction) {
  if (!direction) return null;
  const value = direction.toLowerCase();
  if (['inbound', 'incoming', 'in'].includes(value)) return 'inbound';
  if (['outbound', 'outgoing', 'out'].includes(value)) return 'outbound';
  return null;
}

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function ensureSeconds(value) {
  if (value == null) return 0;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) && asNumber > 0 ? Math.floor(asNumber) : 0;
}

async function resolveSubscriptionId(payload, transaction) {
  if (payload.subscriptionId) {
    return payload.subscriptionId;
  }

  if (payload.subscriptionExternalId) {
    const subscription = await Subscription.findOne({
      where: { externalId: payload.subscriptionExternalId },
      transaction,
    });
    return subscription ? subscription.id : null;
  }

  if (payload.userId) {
    const subscription = await Subscription.findOne({
      where: { userId: payload.userId, status: 'active' },
      order: [['createdAt', 'DESC']],
      transaction,
    });
    return subscription ? subscription.id : null;
  }

  return null;
}

async function isDuplicate(providerCallId, transaction) {
  if (!providerCallId) return false;
  const existing = await CdrRecord.findOne({ where: { providerCallId }, transaction });
  return Boolean(existing);
}

async function createBatch({ source, totalRecords = 0, metadata = {} }, transaction) {
  return CdrImportBatch.create({ source, totalRecords, metadata }, { transaction });
}

async function markBatchStarted(batch, transaction) {
  batch.status = 'processing';
  batch.startedAt = new Date();
  batch.lastError = null;
  await batch.save({ transaction, fields: ['status', 'startedAt', 'lastError'] });
}

async function markBatchCompleted(batch, { processed, failed, failures }, transaction) {
  batch.status = failed > 0 ? 'completed_with_errors' : 'completed';
  batch.processedRecords = processed;
  batch.failedRecords = failed;
  batch.completedAt = new Date();
  if (failed > 0 && failures?.length) {
    batch.lastError = JSON.stringify({ failed, failures });
  }
  await batch.save({
    transaction,
    fields: ['status', 'processedRecords', 'failedRecords', 'completedAt', 'lastError'],
  });
}

async function storeCdr({ batchId, record }, transaction) {
  return CdrRecord.create({ batchId, ...record }, { transaction });
}

async function normalizeRecord(raw, transaction) {
  if (!raw) {
    throw new Error('record missing');
  }

  const direction = normalizeDirection(raw.direction);
  if (!direction) {
    throw new Error('invalid direction');
  }

  const callStartedAt = parseTimestamp(raw.callStartedAt || raw.startedAt || raw.startTime);
  if (!callStartedAt) {
    throw new Error('invalid callStartedAt');
  }

  const callEndedAt = parseTimestamp(raw.callEndedAt || raw.endedAt || raw.endTime);
  const durationSeconds = ensureSeconds(raw.durationSeconds || raw.duration || raw.billSec || raw.billableSeconds);
  const billableSeconds = ensureSeconds(raw.billableSeconds || raw.billSec || raw.durationSeconds || raw.duration);

  const subscriptionId = await resolveSubscriptionId(raw, transaction);

  return {
    providerCallId: raw.providerCallId || raw.uniqueId || null,
    direction,
    destination: raw.destination || raw.to || null,
    destinationGroup: raw.destinationGroup || null,
    callStartedAt,
    callEndedAt,
    durationSeconds,
    billableSeconds,
    rateCents: raw.rateCents || null,
    currency: (raw.currency || 'usd').toLowerCase(),
    rawPayload: raw,
    subscriptionId,
    userId: raw.userId || null,
  };
}

async function ingestBatch({ source, records }) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('records must be a non-empty array');
  }

  return sequelize.transaction(async (transaction) => {
    const batch = await createBatch({ source, totalRecords: records.length }, transaction);
    await markBatchStarted(batch, transaction);

    let processed = 0;
    let failed = 0;
    const failures = [];

    for (const raw of records) {
      try {
        const normalized = await normalizeRecord(raw, transaction);

        if (await isDuplicate(normalized.providerCallId, transaction)) {
          failed += 1;
          failures.push({ providerCallId: normalized.providerCallId, reason: 'duplicate' });
          continue;
        }

        await storeCdr({ batchId: batch.id, record: normalized }, transaction);
        processed += 1;
      } catch (error) {
        failed += 1;
        const failure = { providerCallId: raw.providerCallId || null, reason: error.message };
        failures.push(failure);

        const fallbackStartedAt = parseTimestamp(raw.callStartedAt || raw.startedAt || raw.startTime);
        const fallbackDirection = raw.direction || 'unknown';

        if (fallbackStartedAt && fallbackDirection) {
          await CdrRecord.create(
            {
              batchId: batch.id,
              providerCallId: raw.providerCallId || null,
              status: 'failed',
              errorMessage: error.message,
              errorCode: 'ingestion_failed',
              rawPayload: raw,
              attemptCount: 1,
              retryAt: new Date(Date.now() + RETRY_BACKOFF_MS),
              direction: fallbackDirection,
              callStartedAt: fallbackStartedAt,
              durationSeconds: ensureSeconds(raw.durationSeconds || raw.duration || 0),
              billableSeconds: ensureSeconds(raw.billableSeconds || raw.billSec || raw.durationSeconds || raw.duration || 0),
            },
            { transaction }
          );
        }
      }
    }

    await markBatchCompleted(batch, { processed, failed, failures }, transaction);

    return {
      batchId: batch.id,
      processed,
      failed,
      failures,
    };
  });
}

async function ingestRealtime(rawRecord) {
  return sequelize.transaction(async (transaction) => {
    const normalized = await normalizeRecord(rawRecord, transaction);

    if (await isDuplicate(normalized.providerCallId, transaction)) {
      return { skipped: true, reason: 'duplicate' };
    }

    const record = await storeCdr({ batchId: null, record: normalized }, transaction);
    return { skipped: false, record };
  });
}

module.exports = {
  ingestBatch,
  ingestRealtime,
  normalizeRecord,
  createBatch,
  storeCdr,
  markBatchCompleted,
  markBatchStarted,
};
