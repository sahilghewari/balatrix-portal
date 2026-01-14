const bcrypt = require('bcrypt');
const sequelize = require('../config/database');
const Extension = require('../models/Extension');
const Subscription = require('../models/Subscription');
const User = require('../models/User');

const WEBRTC_USERNAME_PREFIX = 'rtc';

function sanitizeExtension(extensionInstance) {
  if (!extensionInstance) return null;
  const plain = extensionInstance.get({ plain: true });
  delete plain.passwordHash;

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

async function generateWebRtcUsername({ user, transaction }) {
  if (!user) {
    throw new Error('User context required for WebRTC credentials.');
  }

  const baseSource = user.name || user.email || user.id || 'user';
  const baseName = String(baseSource)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6);

  const base = baseName || String(user.id || 'user').slice(0, 6);

  const existingCount = await Extension.count({
    include: [
      {
        model: Subscription,
        as: 'subscription',
        where: { userId: user.id },
      },
    ],
    transaction,
  });

  const suffix = String(existingCount + 1).padStart(2, '0');
  return `${WEBRTC_USERNAME_PREFIX}-${base}-${suffix}`;
}

async function createExtension({ userId, subscriptionId, extNumber, password, isMonitoring = false }) {
  return sequelize.transaction(async (transaction) => {
    const subscription = await Subscription.findOne({
      where: { id: subscriptionId, userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!subscription || subscription.status !== 'active') {
      throw new Error('Active subscription required to create extensions.');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const webrtcUsername = await generateWebRtcUsername({ user: subscription.user, transaction });

    const extension = await Extension.create(
      {
        subscriptionId,
        extNumber,
        passwordHash,
        isMonitoring,
        webrtcUsername,
      },
      { transaction }
    );

    extension.setDataValue('subscription', {
      id: subscription.id,
      planTier: subscription.planTier,
      billingCycle: subscription.billingCycle,
      status: subscription.status,
    });

    return sanitizeExtension(extension);
  });
}

async function updateExtensionPassword({ userId, extensionId, password }) {
  return sequelize.transaction(async (transaction) => {
    const extension = await Extension.findOne({
      where: { id: extensionId },
      include: [{ model: Subscription, as: 'subscription', where: { userId } }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!extension) {
      throw new Error('Extension not found.');
    }

    extension.passwordHash = await bcrypt.hash(password, 10);
    await extension.save({ transaction });

    return sanitizeExtension(extension);
  });
}

async function deleteExtension({ userId, extensionId }) {
  return sequelize.transaction(async (transaction) => {
    const extension = await Extension.findOne({
      where: { id: extensionId },
      include: [{ model: Subscription, as: 'subscription', where: { userId } }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!extension) {
      throw new Error('Extension not found.');
    }

    await extension.destroy({ transaction });
  });
}

async function listExtensions(userId) {
  const extensions = await Extension.findAll({
    attributes: ['id', 'subscriptionId', 'extNumber', 'isMonitoring', 'webrtcUsername', 'createdAt', 'updatedAt'],
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

  return extensions.map(sanitizeExtension);
}

module.exports = {
  createExtension,
  updateExtensionPassword,
  deleteExtension,
  listExtensions,
};
