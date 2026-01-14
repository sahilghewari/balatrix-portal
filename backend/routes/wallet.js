const express = require('express');
const dotenv = require('dotenv');
const { authenticate, requireRole } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');
const asyncHandler = require('../middleware/asyncHandler');
const { addFunds, getWalletWithTransactions } = require('../services/walletService');

dotenv.config();

const router = express.Router();

router.get(
  '/',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { wallet, transactions } = await getWalletWithTransactions(req.user.id, 50);

    return res.status(200).json({
      balance: wallet.balance,
      balanceZero: wallet.balanceZero,
      defaultCard: wallet.defaultCard,
      autoCharge: wallet.autoCharge,
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
      balance: wallet.balance,
      balanceZero: wallet.balanceZero,
      defaultCard: wallet.defaultCard,
      autoCharge: wallet.autoCharge,
      updatedAt: wallet.updatedAt,
    });
  })
);

router.post(
  '/recharge',
  authenticate,
  requireRole('admin'),
  validateRequest(['amount']),
  asyncHandler(async (req, res) => {
    const { amount, metadata = {} } = req.body;
    const wallet = await addFunds(req.user.id, amount, metadata);

    return res.status(200).json({
      message: 'Wallet recharged successfully.',
      balance: wallet.balance,
      balanceZero: wallet.balanceZero,
    });
  })
);

module.exports = router;
