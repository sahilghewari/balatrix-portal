const express = require('express');
const { Op } = require('sequelize');
const { authenticate, requireRole } = require('../middleware/auth');
const { resolveAdminContext } = require('../services/supportSeatService');
const asyncHandler = require('../middleware/asyncHandler');
const SubscriptionUsageBalance = require('../models/SubscriptionUsageBalance');
const SubscriptionUsageLedger = require('../models/SubscriptionUsageLedger');
const CdrRecord = require('../models/CdrRecord');
const Wallet = require('../models/Wallet');
const Subscription = require('../models/Subscription');

const router = express.Router();

async function resolveUserContext(req) {
  const adminId = await resolveAdminContext({
    actor: req.user,
    targetAdminId: req.query.adminId,
  });

  return {
    adminId,
    isSuperAdmin: req.user.role === 'super_admin',
  };
}

async function findLatestSubscription(adminId) {
  const subscription = await Subscription.findOne({
    where: { userId: adminId },
    order: [
      ['status', 'ASC'],
      ['startDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  return subscription;
}

async function findActiveOrLatestSubscription(adminId) {
  const active = await Subscription.findOne({
    where: { userId: adminId, status: 'active' },
    order: [
      ['startDate', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  if (active) {
    return active;
  }

  return findLatestSubscription(adminId);
}

function parseLimit(value, { defaultValue, max }) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, max);
  }
  return defaultValue;
}

function parseOffset(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return 0;
}

router.get(
  '/summary',
  authenticate,
  requireRole('admin', 'support', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { adminId } = await resolveUserContext(req);
    const subscription = await findActiveOrLatestSubscription(adminId);

    if (!subscription) {
      return res.json({ summary: null });
    }

    let balance = await SubscriptionUsageBalance.findOne({
      where: {
        subscriptionId: subscription.id,
        status: 'open',
      },
      order: [['billingPeriodStart', 'DESC']],
    });

    if (!balance) {
      balance = await SubscriptionUsageBalance.findOne({
        where: { subscriptionId: subscription.id },
        order: [['billingPeriodStart', 'DESC']],
      });
    }

    const includedSeconds = balance?.includedSeconds || 0;
    const remainingSeconds = balance?.remainingSeconds || 0;
    const consumedSeconds = balance?.consumedSeconds || 0;
    const rolloverSeconds = balance?.rolloverSeconds || 0;

    const remainingMinutes = remainingSeconds / 60;
    const consumedMinutes = consumedSeconds / 60;
    const includedMinutes = includedSeconds / 60;
    const rolloverMinutes = rolloverSeconds / 60;

    return res.json({
      summary: {
        subscriptionId: subscription.id,
        billingPeriodStart: balance?.billingPeriodStart,
        billingPeriodEnd: balance?.billingPeriodEnd,
        includedMinutes,
        remainingMinutes,
        consumedMinutes,
        rolloverMinutes,
        remainingSeconds,
        includedSeconds,
        rolloverSeconds,
        currency: subscription.currency,
        planTier: subscription.planTier,
      },
    });
  })
);

router.get(
  '/cdrs',
  authenticate,
  requireRole('admin', 'support', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { adminId } = await resolveUserContext(req);
    const subscription = await findLatestSubscription(adminId);

    if (!subscription) {
      return res.json({ cdrs: [] });
    }

    const limit = parseLimit(req.query.limit, { defaultValue: 50, max: 200 });
    const offset = parseOffset(req.query.offset);
    const since = req.query.since ? new Date(req.query.since) : null;

    const cdrs = await CdrRecord.findAll({
      where: {
        subscriptionId: subscription.id,
        ...(since ? { callStartedAt: { [Op.gte]: since } } : {}),
      },
      order: [['callStartedAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      subscriptionId: subscription.id,
      limit,
      offset,
      cdrs,
    });
  })
);

router.get(
  '/ledger',
  authenticate,
  requireRole('admin', 'support', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { adminId } = await resolveUserContext(req);
    const subscription = await findLatestSubscription(adminId);

    if (!subscription) {
      return res.json({ entries: [] });
    }

    const limit = parseLimit(req.query.limit, { defaultValue: 100, max: 500 });
    const offset = parseOffset(req.query.offset);
    const entryType = req.query.entryType;

    const where = {
      subscriptionId: subscription.id,
      ...(entryType ? { entryType } : {}),
    };

    const entries = await SubscriptionUsageLedger.findAll({
      where,
      order: [['occurredAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      subscriptionId: subscription.id,
      limit,
      offset,
      entryType: entryType || null,
      entries,
    });
  })
);

router.get(
  '/wallet-deductions',
  authenticate,
  requireRole('admin', 'support', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { adminId } = await resolveUserContext(req);
    const subscription = await findLatestSubscription(adminId);
    const wallet = await Wallet.findOne({ where: { userId: adminId } });

    if (!wallet) {
      return res.json({ wallet: null, deductions: [] });
    }

    if (!subscription) {
      return res.json({
        wallet: {
          balance: wallet.balance,
          balanceZero: wallet.balanceZero,
          currency: wallet.currency,
          autoCharge: wallet.autoCharge,
        },
        deductions: [],
      });
    }

    const limit = parseLimit(req.query.limit, { defaultValue: 50, max: 200 });
    const offset = parseOffset(req.query.offset);

    const deductions = await SubscriptionUsageLedger.findAll({
      where: {
        subscriptionId: subscription.id,
        entryType: 'wallet_deduction',
      },
      order: [['occurredAt', 'DESC']],
      limit,
      offset,
    });

    return res.json({
      wallet: {
        balance: wallet.balance,
        balanceZero: wallet.balanceZero,
        currency: wallet.currency,
        autoCharge: wallet.autoCharge,
      },
      subscriptionId: subscription.id,
      limit,
      offset,
      deductions,
    });
  })
);

module.exports = router;
