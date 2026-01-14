const express = require('express');
const dotenv = require('dotenv');
const { authenticate, requireRole } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const Subscription = require('../models/Subscription');
const { cancelSubscription } = require('../services/subscriptionService');

dotenv.config();

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const subscriptions = await Subscription.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
    });
    return res.status(200).json({ subscriptions });
  })
);

router.get(
  '/summary',
  authenticate,
  asyncHandler(async (req, res) => {
    if (!['admin', 'support', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    let activeSubscription = null;
    let fallbackSubscription = null;

    try {
      activeSubscription = await Subscription.findOne({
        where: { userId: req.user.id, status: 'active' },
        order: [['startDate', 'DESC']],
      });

      fallbackSubscription = await Subscription.findOne({
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC']],
      });
    } catch (error) {
      console.error('Subscription summary lookup failed', error);
      return res.status(200).json({ summary: null, error: 'lookup_failed' });
    }

    const target = activeSubscription || fallbackSubscription;

    if (!target) {
      return res.status(200).json({ summary: null });
    }

    const totalAmountCents = (target.planAmountCents || 0) + (target.addonAmountCents || 0);

    return res.status(200).json({
      summary: {
        id: target.id,
        status: target.status,
        planTier: target.planTier,
        billingCycle: target.billingCycle,
        currency: target.currency,
        planAmountCents: target.planAmountCents,
        addonAmountCents: target.addonAmountCents,
        totalAmountCents,
        autoRenew: target.autoRenew,
        monitoringPurchased: target.monitoringPurchased,
        startDate: target.startDate,
        nextBillingDate: target.nextBillingDate,
        endDate: target.endDate,
        lastChargeAttemptAt: target.lastChargeAttemptAt,
        balanceZeroFlaggedAt: target.balanceZeroFlaggedAt,
        hasActiveSubscription: Boolean(activeSubscription),
      },
    });
  })
);

router.post(
  '/cancel',
  authenticate,
  requireRole('admin'),
  validateRequest(['subscriptionId']),
  asyncHandler(async (req, res) => {
    const { subscriptionId } = req.body;
    const subscription = await cancelSubscription(req.user.id, subscriptionId);
    return res.status(200).json({
      message: 'Subscription cancelled successfully.',
      subscription,
    });
  })
);

module.exports = router;
