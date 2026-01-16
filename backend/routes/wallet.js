const express = require('express');
const dotenv = require('dotenv');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getWalletWithTransactions } = require('../services/walletService');

dotenv.config();

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { wallet, transactions } = await getWalletWithTransactions(req.user.id, 50);

    return res.status(200).json({
      wallet: {
        id: wallet.id,
        balance: Number(wallet.balance),
        currency: wallet.currency,
        balanceZero: wallet.balanceZero,
        reservedCents: wallet.reservedCents,
        lowBalanceThresholdCents: wallet.lowBalanceThresholdCents,
        defaultCard: wallet.defaultCard,
        autoCharge: wallet.autoCharge,
        updatedAt: wallet.updatedAt,
      },
      transactions,
    });
  })
);

router.get(
  '/summary',
  authenticate,
  asyncHandler(async (req, res) => {
    const { wallet } = await getWalletWithTransactions(req.user.id, 0);

    return res.status(200).json({
      balance: Number(wallet.balance),
      currency: wallet.currency,
      balanceZero: wallet.balanceZero,
      defaultCard: wallet.defaultCard,
      autoCharge: wallet.autoCharge,
      updatedAt: wallet.updatedAt,
    });
  })
);

module.exports = router;
