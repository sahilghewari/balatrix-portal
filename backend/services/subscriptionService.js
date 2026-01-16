const sequelize = require('../config/database');
const Subscription = require('../models/Subscription');
const { releaseTfnsForSubscription } = require('./tfnService');
const { getOrCreateWallet } = require('./walletService');

async function cancelSubscription(userId, subscriptionId) {
  return sequelize.transaction(async (t) => {
    const subscription = await Subscription.findOne({
      where: { id: subscriptionId, userId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!subscription) {
      throw new Error('Subscription not found.');
    }

    subscription.status = 'cancelled';
    subscription.endDate = new Date();
    await subscription.save({ transaction: t });

    await releaseTfnsForSubscription(subscription.id);

    return subscription;
  });
}

async function activateSubscriptionFromCheckout(record, options = {}) {
  return sequelize.transaction(
    {
      transaction: options.transaction,
      isolationLevel: 'READ COMMITTED',
    },
    async (transaction) => {
      let subscription = await Subscription.findOne({
        where: {
          userId: record.userId,
          planTier: record.planTier,
          billingCycle: record.billingCycle,
          status: 'pending',
        },
        order: [['createdAt', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!subscription) {
        subscription = await Subscription.create(
          {
            userId: record.userId,
            planTier: record.planTier,
            billingCycle: record.billingCycle,
            planAmountCents: record.planAmount,
            addonAmountCents: record.addonAmount,
            currency: record.currency,
            status: 'pending',
          },
          { transaction }
        );
      }

      const now = new Date();

      subscription.planAmountCents = record.planAmount;
      subscription.addonAmountCents = record.addonAmount;
      subscription.currency = record.currency;
      subscription.status = 'active';
      subscription.startDate = subscription.startDate || now;
      subscription.lastChargeAttemptAt = now;

      const billingCycleMonths =
        record.billingCycle === 'monthly' ? 1 : record.billingCycle === 'quarterly' ? 3 : 12;
      const nextBillingDate = new Date(now);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + billingCycleMonths);
      subscription.nextBillingDate = nextBillingDate;

      await subscription.save({ transaction });

      const { getOrCreateWallet } = require('./walletService');
      await getOrCreateWallet(record.userId, { transaction });

      return subscription;
    }
  );
}

module.exports = {
  cancelSubscription,
  activateSubscriptionFromCheckout,
};
