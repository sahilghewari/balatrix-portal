const sequelize = require('../config/database');
const Subscription = require('../models/Subscription');
const SupportUser = require('../models/SupportUser');
const Extension = require('../models/Extension');
const { deductFunds } = require('./walletService');
const {
  enforceMonitoringSeatLimit,
  recordAudit,
  resolveAdminContext,
} = require('./supportSeatService');

const MONITORING_ADDON_COST = Number(process.env.MONITORING_ADDON_COST_CENTS || 9900);

function sanitizeSubscription(subscriptionInstance) {
  if (!subscriptionInstance) return null;
  const plain = subscriptionInstance.get({ plain: true });
  return {
    id: plain.id,
    planTier: plain.planTier,
    billingCycle: plain.billingCycle,
    status: plain.status,
    monitoringPurchased: plain.monitoringPurchased,
    nextBillingDate: plain.nextBillingDate,
  };
}

function sanitizeSupportUser(supportUserInstance) {
  if (!supportUserInstance) return null;
  const plain = supportUserInstance.get({ plain: true });
  delete plain.passwordHash;

  if (plain.monitoringExtension) {
    plain.monitoringExtension = {
      id: plain.monitoringExtension.id,
      extNumber: plain.monitoringExtension.extNumber,
      isMonitoring: plain.monitoringExtension.isMonitoring,
      webrtcUsername: plain.monitoringExtension.webrtcUsername,
    };
  }

  return plain;
}

async function purchaseMonitoringAddon({ actor, targetAdminId, subscriptionId }) {
  return sequelize.transaction(async (transaction) => {
    const adminId = await resolveAdminContext({ actor, targetAdminId, transaction });
    const subscription = await Subscription.findOne({
      where: { id: subscriptionId, userId: adminId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!subscription) {
      throw new Error('Subscription not found for this user.');
    }

    if (subscription.status !== 'active') {
      throw new Error('Subscription must be active to purchase monitoring.');
    }

    if (subscription.monitoringPurchased) {
      throw new Error('Monitoring add-on already active.');
    }

    if (MONITORING_ADDON_COST > 0) {
      await deductFunds(
        adminId,
        (MONITORING_ADDON_COST / 100).toFixed(2),
        { reason: 'monitoring_addon_purchase', subscriptionId },
        { transaction }
      );
    }

    subscription.monitoringPurchased = true;
    await subscription.save({ transaction });

    await recordAudit(
      {
        adminId,
        actorId: actor.id,
        action: 'monitoring_addon_purchased',
        metadata: { subscriptionId },
      },
      { transaction }
    );

    return sanitizeSubscription(subscription);
  });
}

async function getMonitoringStatus(actor, targetAdminId) {
  const adminId = await resolveAdminContext({ actor, targetAdminId });
  const subscription = await Subscription.findOne({
    where: { userId: adminId },
    order: [['createdAt', 'DESC']],
  });

  if (!subscription) {
    return {
      monitoringPurchased: false,
      subscriptionId: null,
      planTier: null,
      billingCycle: null,
      status: null,
      nextBillingDate: null,
      addonCostCents: MONITORING_ADDON_COST,
    };
  }

  return {
    subscriptionId: subscription.id,
    planTier: subscription.planTier,
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    monitoringPurchased: Boolean(subscription.monitoringPurchased),
    nextBillingDate: subscription.nextBillingDate,
    addonCostCents: MONITORING_ADDON_COST,
  };
}

async function revokeMonitoringAccess({ actor, targetAdminId, supportUserId }) {
  return sequelize.transaction(async (transaction) => {
    const adminId = await resolveAdminContext({ actor, targetAdminId, transaction });
    const supportUser = await SupportUser.findOne({
      where: { id: supportUserId, adminId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!supportUser) {
      throw new Error('Support user not found.');
    }

    supportUser.monitoringAccess = false;
    supportUser.monitoringExtensionId = null;
    await supportUser.save({ transaction });

    await recordAudit(
      {
        adminId,
        actorId: actor.id,
        supportUserId,
        action: 'monitoring_revoked',
      },
      { transaction }
    );

    return sanitizeSupportUser(supportUser);
  });
}

async function grantMonitoringAccess({ actor, targetAdminId, supportUserId, extensionId }) {
  return sequelize.transaction(async (transaction) => {
    const adminId = await resolveAdminContext({ actor, targetAdminId, transaction });
    const supportUser = await SupportUser.findOne({
      where: { id: supportUserId, adminId },
      include: [
        {
          model: Extension,
          as: 'monitoringExtension',
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!supportUser) {
      throw new Error('Support user not found.');
    }

    const extension = await Extension.findOne({
      where: { id: extensionId },
      include: [
        {
          model: Subscription,
          as: 'subscription',
          where: { userId: adminId },
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!extension) {
      throw new Error('Extension not found for this admin.');
    }

    if (!extension.isMonitoring) {
      throw new Error('Extension must be marked as monitoring to grant access.');
    }

    const subscription = extension.subscription;
    if (!subscription.monitoringPurchased) {
      throw new Error('Monitoring add-on not purchased for this subscription.');
    }

    await enforceMonitoringSeatLimit(adminId, { transaction });

    supportUser.monitoringAccess = true;
    supportUser.monitoringExtensionId = extension.id;
    await supportUser.save({ transaction });

    supportUser.setDataValue('monitoringExtension', extension);

    await recordAudit(
      {
        adminId,
        actorId: actor.id,
        supportUserId,
        action: 'monitoring_granted',
        metadata: { extensionId },
      },
      { transaction }
    );

    return sanitizeSupportUser(supportUser);
  });
}

module.exports = {
  purchaseMonitoringAddon,
  grantMonitoringAccess,
  revokeMonitoringAccess,
  getMonitoringStatus,
};
