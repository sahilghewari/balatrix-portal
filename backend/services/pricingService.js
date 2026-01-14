const AVAILABLE_PLANS = {
  starter: { monthly: 4999, quarterly: 13999, yearly: 49999 },
  professional: { monthly: 9999, quarterly: 27999, yearly: 99999 },
  call_center: { monthly: 14999, quarterly: 41999, yearly: 149999 },
};

const AVAILABLE_ADDONS = {
  tfn: 9999,
  extension: 2999,
  monitoring: 6999,
};

function calculatePlanAmount(planTier, billingCycle) {
  const tier = AVAILABLE_PLANS[planTier];
  if (!tier) {
    throw new Error('Invalid plan tier');
  }

  const amount = tier[billingCycle];
  if (!amount) {
    throw new Error('Invalid billing cycle');
  }

  return amount;
}

function calculateAddons(addons = []) {
  return addons.reduce((total, addonCode) => {
    const amount = AVAILABLE_ADDONS[addonCode];
    if (!amount) {
      throw new Error(`Invalid add-on: ${addonCode}`);
    }
    return total + amount;
  }, 0);
}

function calculateTotal(planTier, billingCycle, addons = []) {
  const planAmount = calculatePlanAmount(planTier, billingCycle);
  const addonAmount = calculateAddons(addons);
  return {
    planAmount,
    addonAmount,
    totalAmount: planAmount + addonAmount,
  };
}

module.exports = {
  calculateTotal,
  calculatePlanAmount,
  calculateAddons,
  AVAILABLE_PLANS,
  AVAILABLE_ADDONS,
};
