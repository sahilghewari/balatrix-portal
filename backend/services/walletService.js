const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

const ZERO = 0.0;

function toNumber(value) {
  return Number.parseFloat(value);
}

async function getOrCreateWallet(userId, options = {}) {
  const [wallet] = await Wallet.findOrCreate({
    where: { userId },
    defaults: {
      balance: ZERO,
      balanceZero: true,
      autoCharge: false,
      defaultCard: null,
    },
    transaction: options.transaction,
  });

  return wallet;
}

async function recordTransaction(wallet, type, amount, balanceAfter, metadata = {}, options = {}) {
  return Transaction.create(
    {
      walletId: wallet.id,
      type,
      amount,
      balanceAfter,
      metadata,
    },
    { transaction: options.transaction }
  );
}

async function updateBalanceZero(wallet, transaction) {
  wallet.balanceZero = Number(wallet.balance) === ZERO;
  await wallet.save({ transaction });
}

async function addFunds(userId, amount, metadata = {}, options = {}) {
  if (Number.isNaN(Number(amount)) || Number(amount) <= ZERO) {
    throw new Error('Amount must be greater than zero.');
  }

  const externalTransaction = options.transaction;
  const transaction = externalTransaction || (await sequelize.transaction());

  try {
    const wallet = await getOrCreateWallet(userId, { transaction });

    const currentBalance = toNumber(wallet.balance);
    const newBalance = (currentBalance + Number(amount)).toFixed(2);

    wallet.balance = newBalance;
    await wallet.save({ transaction });
    await recordTransaction(wallet, 'recharge', Number(amount).toFixed(2), newBalance, metadata, { transaction });
    await updateBalanceZero(wallet, transaction);

    if (!externalTransaction) {
      await transaction.commit();
    }

    return wallet;
  } catch (error) {
    if (!externalTransaction && transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function deductFunds(userId, amount, metadata = {}, options = {}) {
  if (Number.isNaN(Number(amount)) || Number(amount) <= ZERO) {
    throw new Error('Amount must be greater than zero.');
  }

  const externalTransaction = options.transaction;
  const transaction = externalTransaction || (await sequelize.transaction());

  try {
    const wallet = await getOrCreateWallet(userId, { transaction });
    const currentBalance = toNumber(wallet.balance);

    if (currentBalance < Number(amount)) {
      throw new Error('Insufficient wallet balance.');
    }

    const newBalance = (currentBalance - Number(amount)).toFixed(2);
    wallet.balance = newBalance;
    await wallet.save({ transaction });
    await recordTransaction(wallet, 'deduction', Number(amount).toFixed(2), newBalance, metadata, { transaction });
    await updateBalanceZero(wallet, transaction);

    if (!externalTransaction) {
      await transaction.commit();
    }

    return wallet;
  } catch (error) {
    if (!externalTransaction && transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function getWalletWithTransactions(userId, limit = 20) {
  const wallet = await getOrCreateWallet(userId);
  const transactions = await Transaction.findAll({
    where: { walletId: wallet.id },
    order: [['createdAt', 'DESC']],
    limit,
  });

  return { wallet, transactions };
}

module.exports = {
  getOrCreateWallet,
  addFunds,
  deductFunds,
  getWalletWithTransactions,
};
