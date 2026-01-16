const request = require('supertest');
const { initializeDatabase, startServer, stopServer } = require('../../app');
const User = require('../../models/User');
const Wallet = require('../../models/Wallet');
const WalletTopUp = require('../../models/WalletTopUp');
const { centsFromAmount } = require('../../services/walletService');
const { handlePaymentIntentEvent } = require('../../services/walletTopUpService');

jest.mock('stripe', () => {
  const customers = {
    create: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
    list: jest.fn().mockResolvedValue({ data: [] }),
  };

  const paymentIntents = {
    create: jest.fn().mockResolvedValue({ id: 'pi_test_123', client_secret: 'secret_test', status: 'requires_payment_method' }),
    retrieve: jest.fn().mockResolvedValue({ id: 'pi_test_123', status: 'succeeded' }),
  };

  const Stripe = jest.fn(() => ({ customers, paymentIntents }));
  Stripe.customers = customers;
  Stripe.paymentIntents = paymentIntents;
  return Stripe;
});

const { stripe } = require('../../services/stripe');

async function createUser() {
  const user = await User.create({
    name: 'Wallet Top Up Tester',
    email: `wallet_topup_${Date.now()}@example.com`,
    phone: '5551112222',
    passwordHash: 'placeholder',
    role: 'admin',
  });
  await user.setPassword('password');
  await user.save();
  user.stripeCustomerId = 'cus_test_123';
  await user.save();
  return user;
}

describe('Wallet top-up flow', () => {
  let server;

  beforeAll(async () => {
    await initializeDatabase();
    const result = await startServer({ port: 4001 });
    server = result.server;
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(async () => {
    await WalletTopUp.destroy({ where: {} });
    await Wallet.destroy({ where: {} });
    await User.destroy({ where: {} });
  });

  test('creates a wallet top-up and processes webhook success', async () => {
    const user = await createUser();

    const loginResponse = await request(server)
      .post('/auth/login')
      .send({ email: user.email, password: 'password' })
      .expect(200);

    const token = loginResponse.body.token;

    const topUpResponse = await request(server)
      .post('/wallet/top-ups')
      .set('Authorization', `Bearer ${token}`)
      .send({ amountCents: 5000, currency: 'usd' })
      .expect(201);

    expect(topUpResponse.body.clientSecret).toBeDefined();
    expect(topUpResponse.body.paymentIntentId).toBe('pi_test_123');

    const topUp = await WalletTopUp.findOne({ where: { stripePaymentIntentId: 'pi_test_123' } });
    expect(topUp).not.toBeNull();
    expect(topUp.status).toBe('pending');

    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_test_123', status: 'succeeded' },
      },
    };

    await handlePaymentIntentEvent(event);

    const refreshedTopUp = await WalletTopUp.findByPk(topUp.id);
    expect(refreshedTopUp.status).toBe('succeeded');

    const wallet = await Wallet.findOne({ where: { userId: user.id } });
    expect(Number(wallet.balance)).toBeCloseTo(50, 2);
  });
});
