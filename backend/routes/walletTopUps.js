const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { getOrCreateWallet } = require('../services/walletService');
const Subscription = require('../models/Subscription');
const {
  createTopUp,
  listTopUps,
} = require('../services/walletTopUpService');

const router = express.Router();

router.post(
  '/',
  authenticate,
  requireRole('admin'),
  body('amountCents', 'amountCents must be positive integer cents').isInt({ gt: 0 }),
  body('currency').optional().isString().isLength({ min: 3, max: 8 }),
  body('subscriptionId').optional().isUUID(),
  body('amountCents').isInt({ gt: 0 }),
  body('currency').optional().isString().isLength({ min: 3, max: 8 }),
  body('subscriptionId').optional().isUUID(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid payload', errors: errors.array() });
    }

    try {
      const amountCents = Number(req.body.amountCents);
      const subscriptionId = req.body.subscriptionId || null;
      const paymentMethodId = req.body.paymentMethodId || null;

      const wallet = await getOrCreateWallet(req.user.id);

      let currency = req.body.currency ? String(req.body.currency).toLowerCase() : wallet.currency;
      const walletCurrency = (wallet.currency || 'usd').toLowerCase();

      if (!currency) {
        currency = walletCurrency;
      }

      if (currency !== walletCurrency) {
        return res.status(422).json({
          message: `Wallet currency mismatch. Wallet uses ${walletCurrency.toUpperCase()}. Please request a top-up in the same currency.`,
        });
      }

      if (subscriptionId) {
        const subscription = await Subscription.findOne({ where: { id: subscriptionId, userId: req.user.id } });
        if (!subscription) {
          return res.status(404).json({ message: 'Subscription not found for this user.' });
        }
      }

      const { topUp, paymentIntent } = await createTopUp({
        user: req.user,
        wallet,
        subscriptionId,
        amountCents,
        currency,
        paymentMethodId,
        metadata: req.body.metadata || {},
      });

      return res.status(201).json({
        id: topUp.id,
        clientSecret: paymentIntent.client_secret,
        status: topUp.status,
        paymentIntentId: topUp.stripePaymentIntentId,
        currency: topUp.currency,
        amountCents: topUp.amountCents,
      });
    } catch (error) {
      const statusCode = error?.statusCode || error?.raw?.statusCode || 500;
      return res.status(statusCode).json({
        message: error?.raw?.message || error.message || 'Failed to create wallet top-up',
      });
    }
  }
);

router.get(
  '/',
  authenticate,
  query('limit').optional().isInt({ gt: 0, lt: 101 }),
  query('offset').optional().isInt({ min: 0 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid query params', errors: errors.array() });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const { rows, count } = await listTopUps(req.user.id, { limit, offset });

    return res.json({
      count,
      items: rows.map((item) => ({
        id: item.id,
        amountCents: item.amountCents,
        currency: item.currency,
        status: item.status,
        paymentIntentId: item.stripePaymentIntentId,
        processedAt: item.processedAt,
        createdAt: item.createdAt,
      })),
    });
  }
);

module.exports = router;
