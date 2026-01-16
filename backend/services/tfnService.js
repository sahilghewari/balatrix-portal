const sequelize = require('../config/database');
const Tfn = require('../models/Tfn');
const Subscription = require('../models/Subscription');
const { deductFunds, getOrCreateWallet } = require('./walletService');

const SETUP_FEE_THRESHOLD_MONTHS = 3;
const TFN_SETUP_FEE_CENTS = Number(process.env.TFN_SETUP_FEE_CENTS || 9999);
const DEFAULT_AVAILABLE_LIMIT = Number(process.env.TFN_AVAILABLE_LIMIT || 25);

function sanitizeTfn(tfnInstance) {
  if (!tfnInstance) return null;
  const plain = tfnInstance.get({ plain: true });

  if (plain.subscription) {
    plain.subscription = {
      id: plain.subscription.id,
      planTier: plain.subscription.planTier,
      billingCycle: plain.subscription.billingCycle,
      status: plain.subscription.status,
    };
  }

  return plain;
}

function getBillingCycleMonths(billingCycle) {
  switch (billingCycle) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'yearly':
      return 12;
    default:
      return 0;
  }
}

async function selectTfn({ userId, subscriptionId, phoneNumber }) {
  return sequelize.transaction(async (t) => {
    const subscription = await Subscription.findOne({
      where: { id: subscriptionId, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!subscription) {
      throw new Error('Subscription not found for this user.');
    }

    if (subscription.status !== 'active') {
      throw new Error('Subscription must be active to assign TFNs.');
    }

    const tfn = await Tfn.findOne({
      where: { phoneNumber },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!tfn || tfn.provisioningStatus !== 'available') {
      throw new Error('Requested TFN is not available.');
    }

    const months = getBillingCycleMonths(subscription.billingCycle);
    const setupFeeCharged = months < SETUP_FEE_THRESHOLD_MONTHS;

    tfn.subscriptionId = subscription.id;
    tfn.provisioningStatus = 'active';
    tfn.setupFeeCharged = setupFeeCharged;

    if (setupFeeCharged && TFN_SETUP_FEE_CENTS > 0) {
      const amountDollars = (TFN_SETUP_FEE_CENTS / 100).toFixed(2);

      const wallet = await getOrCreateWallet(userId, { transaction: t });
      const currentBalance = Number(wallet.balance || 0);

      if (currentBalance < Number(amountDollars)) {
        const error = new Error(
          'Insufficient wallet balance to cover the toll-free number setup fee. Please add funds before assigning a number.'
        );
        error.statusCode = 402;
        throw error;
      }

      await deductFunds(
        userId,
        amountDollars,
        {
          reason: 'tfn_setup_fee',
          phoneNumber,
          subscriptionId: subscription.id,
          billingCycle: subscription.billingCycle,
        },
        { transaction: t }
      );
    }

    await tfn.save({ transaction: t });

    tfn.setDataValue('subscription', subscription);

    return sanitizeTfn(tfn);
  });
}

async function listActiveTfns(userId) {
  const tfns = await Tfn.findAll({
    where: { provisioningStatus: 'active' },
    include: [
      {
        model: Subscription,
        as: 'subscription',
        attributes: ['id', 'planTier', 'billingCycle', 'status'],
        where: { userId },
      },
    ],
    order: [['createdAt', 'DESC']],
  });

  return tfns.map(sanitizeTfn);
}

async function listAvailableTfns({ limit = DEFAULT_AVAILABLE_LIMIT } = {}) {
  const tfns = await Tfn.findAll({
    where: { provisioningStatus: 'available' },
    order: [['createdAt', 'ASC']],
    limit,
  });

  return tfns.map(sanitizeTfn);
}

async function releaseTfnsForSubscription(subscriptionId) {
  await Tfn.update(
    {
      provisioningStatus: 'released',
      subscriptionId: null,
    },
    {
      where: { subscriptionId },
    }
  );
}

module.exports = {
  selectTfn,
  listActiveTfns,
  listAvailableTfns,
  releaseTfnsForSubscription,
};
