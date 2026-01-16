const sequelize = require('../config/database');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

class WalletError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WalletError';
  }
}

class InsufficientFundsError extends WalletError {
  constructor(message = 'Insufficient wallet balance.') {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}

class ReservationError extends WalletError {
  constructor(message = 'Wallet reservation error.') {
    super(message);
    this.name = 'ReservationError';
  }
}

const ZERO = BigInt(0);
const DEFAULT_CURRENCY = 'usd';

function centsFromAmount(amount) {
  if (amount == null) {
    throw new WalletError('Amount is required.');
  }
  const value = Number.parseFloat(amount);
  if (!Number.isFinite(value)) {
    throw new WalletError('Amount must be a number.');
  }
  return BigInt(Math.round(value * 100));
}

function amountFromCents(cents) {
  return Number(cents) / 100;
}

function toBalanceCents(wallet) {
  return centsFromAmount(wallet.balance || '0');
}

function toReservedCents(wallet) {
  return BigInt(wallet.reservedCents || 0);
}

function normalizeDefaults() {
  return {
    balance: '0.00',
    balanceZero: true,
    reservedCents: 0,
    currency: DEFAULT_CURRENCY,
    lowBalanceThresholdCents: 0,
    autoCharge: false,
    defaultCard: null,
  };
}

async function ensureWallet(userId, options = {}) {
  const { transaction } = options;
  const lockMode = transaction?.LOCK?.UPDATE;

  let wallet = await Wallet.findOne({
    where: { userId },
    transaction,
    ...(lockMode ? { lock: lockMode } : {}),
  });

  if (!wallet) {
    wallet = await Wallet.create(
      {
        userId,
        ...normalizeDefaults(),
      },
      { transaction }
    );
  }

  if (transaction) {
    await wallet.reload({ transaction, ...(lockMode ? { lock: lockMode } : {}) });
  }

  return wallet;
}

async function loadWalletForUpdate(userId, options = {}) {
  return ensureWallet(userId, options);
}

async function updateWalletState(wallet, balanceCents, reservedCents, transaction) {
  wallet.balance = amountFromCents(balanceCents).toFixed(2);
  wallet.reservedCents = Number(reservedCents);
  wallet.balanceZero = balanceCents === ZERO && reservedCents === ZERO;
  await wallet.save({ transaction });
}

async function recordTransaction(wallet, type, amountCents, balanceAfterCents, metadata = {}, options = {}, reservationId = null) {
  return Transaction.create(
    {
      walletId: wallet.id,
      type,
      reservationId,
      amount: amountFromCents(amountCents).toFixed(2),
      balanceAfter: amountFromCents(balanceAfterCents).toFixed(2),
      metadata,
    },
    { transaction: options.transaction }
  );
}

async function creditCents(userId, amountCents, metadata = {}, options = {}) {
  if (amountCents <= ZERO) {
    throw new WalletError('Credit amount must be positive.');
  }

  const external = Boolean(options.transaction);
  const transaction = options.transaction || (await sequelize.transaction());

  try {
    const wallet = await loadWalletForUpdate(userId, { transaction });
    const balanceCents = toBalanceCents(wallet);
    const reservedCents = toReservedCents(wallet);

    const newBalance = balanceCents + amountCents;
    await updateWalletState(wallet, newBalance, reservedCents, transaction);
    await recordTransaction(wallet, 'recharge', amountCents, newBalance, metadata, { transaction });

    if (!external) await transaction.commit();
    return wallet;
  } catch (error) {
    if (!external && transaction) await transaction.rollback();
    throw error;
  }
}

async function debitCents(userId, amountCents, metadata = {}, options = {}) {
  if (amountCents <= ZERO) {
    throw new WalletError('Debit amount must be positive.');
  }

  const external = Boolean(options.transaction);
  const transaction = options.transaction || (await sequelize.transaction());

  try {
    const wallet = await loadWalletForUpdate(userId, { transaction });
    const balanceCents = toBalanceCents(wallet);
    const reservedCents = toReservedCents(wallet);
    const available = balanceCents - reservedCents;

    if (available < amountCents) {
      throw new InsufficientFundsError();
    }

    const newBalance = balanceCents - amountCents;
    await updateWalletState(wallet, newBalance, reservedCents, transaction);
    await recordTransaction(wallet, 'deduction', amountCents, newBalance, metadata, { transaction });

    if (!external) await transaction.commit();
    return wallet;
  } catch (error) {
    if (!external && transaction) await transaction.rollback();
    throw error;
  }
}

async function reserveCents(userId, amountCents, reservationId, metadata = {}, options = {}) {
  if (amountCents <= ZERO) {
    throw new WalletError('Reservation amount must be positive.');
  }
  if (!reservationId) {
    throw new ReservationError('Reservation ID is required.');
  }

  const external = Boolean(options.transaction);
  const transaction = options.transaction || (await sequelize.transaction());

  try {
    const wallet = await loadWalletForUpdate(userId, { transaction });
    const balanceCents = toBalanceCents(wallet);
    const reservedCents = toReservedCents(wallet);
    const available = balanceCents - reservedCents;

    if (available < amountCents) {
      throw new InsufficientFundsError();
    }

    const newReserved = reservedCents + amountCents;
    await updateWalletState(wallet, balanceCents, newReserved, transaction);
    await recordTransaction(
      wallet,
      'reservation',
      amountCents,
      balanceCents,
      { ...metadata, reservationId },
      { transaction },
      reservationId
    );

    if (!external) await transaction.commit();
    return wallet;
  } catch (error) {
    if (!external && transaction) await transaction.rollback();
    throw error;
  }
}

async function captureReservation(userId, reservationId, metadata = {}, options = {}) {
  if (!reservationId) {
    throw new ReservationError('Reservation ID is required.');
  }

  const external = Boolean(options.transaction);
  const transaction = options.transaction || (await sequelize.transaction());

  try {
    const wallet = await loadWalletForUpdate(userId, { transaction });
    const balanceCents = toBalanceCents(wallet);
    const reservedCents = toReservedCents(wallet);

    const reservation = await Transaction.findOne({
      where: {
        walletId: wallet.id,
        type: 'reservation',
        reservationId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!reservation) {
      throw new ReservationError('Reservation not found.');
    }

    const amountCents = centsFromAmount(reservation.amount);
    const newReserved = reservedCents - amountCents;
    if (newReserved < ZERO) {
      throw new ReservationError('Reservation amount exceeds reserved funds.');
    }

    const newBalance = balanceCents - amountCents;
    if (newBalance < ZERO) {
      throw new ReservationError('Wallet balance cannot cover capture.');
    }

    await updateWalletState(wallet, newBalance, newReserved, transaction);
    await recordTransaction(
      wallet,
      'deduction',
      amountCents,
      newBalance,
      { ...metadata, reservationId },
      { transaction },
      reservationId
    );

    if (!external) await transaction.commit();
    return wallet;
  } catch (error) {
    if (!external && transaction) await transaction.rollback();
    throw error;
  }
}

async function releaseReservation(userId, reservationId, metadata = {}, options = {}) {
  if (!reservationId) {
    throw new ReservationError('Reservation ID is required.');
  }

  const external = Boolean(options.transaction);
  const transaction = options.transaction || (await sequelize.transaction());

  try {
    const wallet = await loadWalletForUpdate(userId, { transaction });
    const balanceCents = toBalanceCents(wallet);
    const reservedCents = toReservedCents(wallet);

    const reservation = await Transaction.findOne({
      where: {
        walletId: wallet.id,
        type: 'reservation',
        reservationId,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!reservation) {
      throw new ReservationError('Reservation not found.');
    }

    const amountCents = centsFromAmount(reservation.amount);
    const newReserved = reservedCents - amountCents;
    if (newReserved < ZERO) {
      throw new ReservationError('Reservation amount exceeds reserved funds.');
    }

    await updateWalletState(wallet, balanceCents, newReserved, transaction);
    await recordTransaction(
      wallet,
      'reservation_release',
      amountCents,
      balanceCents,
      { ...metadata, reservationId },
      { transaction },
      reservationId
    );

    if (!external) await transaction.commit();
    return wallet;
  } catch (error) {
    if (!external && transaction) await transaction.rollback();
    throw error;
  }
}

async function getWalletWithTransactions(userId, limit = 20) {
  const wallet = await ensureWallet(userId);
  const transactions = await Transaction.findAll({
    where: { walletId: wallet.id },
    order: [['createdAt', 'DESC']],
    limit,
  });

  return { wallet, transactions };
}

// Backward-compatible helpers expecting decimal amounts
async function addFunds(userId, amount, metadata = {}, options = {}) {
  const amountCents = centsFromAmount(amount);
  return creditCents(userId, amountCents, metadata, options);
}

async function deductFunds(userId, amount, metadata = {}, options = {}) {
  const amountCents = centsFromAmount(amount);
  return debitCents(userId, amountCents, metadata, options);
}

module.exports = {
  WalletError,
  InsufficientFundsError,
  ReservationError,
  centsFromAmount,
  amountFromCents,
  getOrCreateWallet: ensureWallet,
  addFunds,
  deductFunds,
  creditCents,
  debitCents,
  reserveCents,
  captureReservation,
  releaseReservation,
  getWalletWithTransactions,
};
