const sequelize = require('../../config/database');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const User = require('../../models/User');

const {
  creditCents,
  debitCents,
  reserveCents,
  captureReservation,
  releaseReservation,
  centsFromAmount,
  amountFromCents,
  InsufficientFundsError,
  ReservationError,
} = require('../../services/walletService');

describe('walletService helpers', () => {
  let user;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    user = await User.create({
      name: 'Wallet Tester',
      email: `wallet_${Date.now()}@example.com`,
      phone: '5550000000',
      passwordHash: 'test',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await Transaction.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
  });

  test('creditCents increases balance and records transaction', async () => {
    await creditCents(user.id, BigInt(5000), { reason: 'test_credit' });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(Number(wallet.balance)).toBeCloseTo(50.0, 2);

    const transactions = await Transaction.findAll();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].type).toBe('recharge');
    expect(Number(transactions[0].amount)).toBeCloseTo(50.0, 2);
  });

  test('debitCents reduces balance when funds available', async () => {
    await creditCents(user.id, BigInt(10000));

    await debitCents(user.id, BigInt(2500), { reason: 'usage_charge' });

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(Number(wallet.balance)).toBeCloseTo(75.0, 2);

    const transactions = await Transaction.findAll({ order: [['createdAt', 'ASC']] });
    expect(transactions).toHaveLength(2);
    expect(transactions[1].type).toBe('deduction');
    expect(Number(transactions[1].amount)).toBeCloseTo(25.0, 2);
  });

  test('debitCents throws when balance insufficient', async () => {
    await creditCents(user.id, BigInt(1000));

    await expect(debitCents(user.id, BigInt(5000))).rejects.toThrow(InsufficientFundsError);
  });

  test('reserve and capture flow updates reserved cents and balance', async () => {
    await creditCents(user.id, BigInt(10000));

    await reserveCents(user.id, BigInt(4000), 'resv-1', { reason: 'tfn_hold' });

    let wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(wallet.reservedCents).toBe(4000);
    expect(Number(wallet.balance)).toBeCloseTo(100.0, 2);

    await captureReservation(user.id, 'resv-1', { reason: 'tfn_capture' });

    wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(Number(wallet.balance)).toBeCloseTo(60.0, 2);
    expect(wallet.reservedCents).toBe(0);

    const transactions = await Transaction.findAll({ order: [['createdAt', 'ASC']] });
    expect(transactions.map((t) => t.type)).toEqual(['recharge', 'reservation', 'deduction']);
  });

  test('releaseReservation frees reserved cents without debiting balance', async () => {
    await creditCents(user.id, BigInt(5000));
    await reserveCents(user.id, BigInt(2000), 'resv-2');

    await releaseReservation(user.id, 'resv-2');

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(Number(wallet.balance)).toBeCloseTo(50.0, 2);
    expect(wallet.reservedCents).toBe(0);

    const transactions = await Transaction.findAll({ order: [['createdAt', 'ASC']] });
    expect(transactions.map((t) => t.type)).toEqual(['recharge', 'reservation', 'reservation_release']);
  });

  test('captureReservation throws when reservation missing', async () => {
    await expect(captureReservation(user.id, 'missing')).rejects.toThrow(ReservationError);
  });

  test('cents conversion helpers behave as expected', () => {
    expect(centsFromAmount('12.34')).toBe(BigInt(1234));
    expect(amountFromCents(BigInt(999))).toBe(9.99);
  });
});
