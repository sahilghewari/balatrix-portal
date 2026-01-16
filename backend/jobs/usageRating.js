const { ratePendingCdrs } = require('../services/ratingService');
const { processPendingBatches } = require('../services/usageDeductionService');

const DEFAULT_RATE_LIMIT = Number(process.env.USAGE_RATING_BATCH_LIMIT || 200);
const DEFAULT_DEDUCTION_LIMIT = Number(process.env.USAGE_DEDUCTION_BATCH_LIMIT || 50);

let isRunning = false;

async function runUsagePipeline({ rateLimit = DEFAULT_RATE_LIMIT, deductionLimit = DEFAULT_DEDUCTION_LIMIT } = {}) {
  if (isRunning) {
    return { skipped: true };
  }

  isRunning = true;
  const startedAt = new Date();
  const summary = {
    startedAt,
    rated: null,
    deductions: null,
    durationMs: null,
  };

  try {
    summary.rated = await ratePendingCdrs({ limit: rateLimit });
    summary.deductions = await processPendingBatches({ limit: deductionLimit });
    summary.durationMs = Date.now() - startedAt.getTime();
    return summary;
  } catch (error) {
    console.error('Usage pipeline failed', {
      error: error.message,
      stack: error.stack,
    });
    summary.error = error.message;
    summary.durationMs = Date.now() - startedAt.getTime();
    return summary;
  } finally {
    isRunning = false;
  }
}

module.exports = {
  runUsagePipeline,
};
