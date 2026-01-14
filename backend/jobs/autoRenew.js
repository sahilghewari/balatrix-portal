const { processDueSubscriptions } = require('../services/billingSchedulerService');

let isProcessing = false;

async function runAutoRenewCycle() {
  if (isProcessing) {
    return { skipped: true };
  }

  isProcessing = true;
  try {
    const results = await processDueSubscriptions({ limit: 100 });
    return { skipped: false, results };
  } catch (error) {
    console.error('Auto-renew cycle failed', error);
    return { skipped: false, error: error.message };
  } finally {
    isProcessing = false;
  }
}

module.exports = {
  runAutoRenewCycle,
};
