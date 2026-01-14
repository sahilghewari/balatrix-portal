const request = require('supertest');
const StripeCheckoutSession = require('../../models/StripeCheckoutSession');
const Wallet = require('../../models/Wallet');
const Subscription = require('../../models/Subscription');
const { truncateTables } = require('../helpers/db');
const { resetStripeMock } = require('../helpers/stripeMock');
const { initializeDatabase, app: expressApp } = require('../../app');

jest.mock('stripe', () => {
  const { getStripeMock } = require('../helpers/stripeMock');
  return jest.fn(() => getStripeMock());
});

let app;
async function createUser() {
  const suffix = Math.random().toString(36).slice(2, 8);
  const email = `user_${suffix}@example.com`;
  const password = 'Password123!';

  await request(app)
    .post('/auth/signup')
    .send({ name: 'Test User', email, phone: '1234567890', password })
    .expect(201);

  const response = await request(app)
    .post('/auth/login')
    .send({ email, password })
    .expect(200);

  return { token: response.body.token };
}

beforeAll(async () => {
  await initializeDatabase();
  app = expressApp;
});

beforeEach(async () => {
  await truncateTables();
});

afterEach(() => {
  resetStripeMock();
});

afterAll(async () => {
  // Global teardown handles DB connection closure.
});

describe('Billing checkout flows', () => {
  test('plan purchase checkout creates stripe session and pending record', async () => {
    const { token } = await createUser();

    const response = await request(app)
      .post('/billing/create-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'plan_purchase',
        planTier: 'starter',
        billingCycle: 'monthly',
        addons: [],
      })
      .expect(200);

    expect(response.body).toHaveProperty('url');
    expect(response.body).toHaveProperty('clientToken');

    const record = await StripeCheckoutSession.findOne({ where: { clientToken: response.body.clientToken } });
    expect(record).not.toBeNull();
    expect(record.intent).toBe('plan_purchase');
    expect(record.planTier).toBe('starter');
    expect(record.status).toBe('pending');
  });

  test('wallet top-up checkout creates session and records wallet amount', async () => {
    const { token } = await createUser();

    const response = await request(app)
      .post('/billing/create-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'wallet_top_up',
        walletTopUpCents: 5000,
      })
      .expect(200);

    const record = await StripeCheckoutSession.findOne({ where: { clientToken: response.body.clientToken } });
    expect(record).not.toBeNull();
    expect(record.intent).toBe('wallet_top_up');
    expect(record.walletTopUpCents).toBe(5000);
  });

  test('finalizing plan purchase activates subscription and ensures wallet exists', async () => {
    const { token } = await createUser();

    const createResponse = await request(app)
      .post('/billing/create-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'plan_purchase',
        planTier: 'starter',
        billingCycle: 'monthly',
        addons: [],
      })
      .expect(200);

    const finalizeResponse = await request(app)
      .post('/billing/finalize-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientToken: createResponse.body.clientToken })
      .expect(200);

    expect(finalizeResponse.body.status).toBe('captured');
    expect(finalizeResponse.body.subscription).toBeDefined();

    const subscription = await Subscription.findOne();
    expect(subscription).not.toBeNull();
    expect(subscription.status).toBe('active');
    expect(subscription.planTier).toBe('starter');

    const wallet = await Wallet.findOne();
    expect(wallet).not.toBeNull();
  });

  test('finalizing wallet top-up credits wallet balance', async () => {
    const { token } = await createUser();

    const createResponse = await request(app)
      .post('/billing/create-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        intent: 'wallet_top_up',
        walletTopUpCents: 7500,
      })
      .expect(200);

    const finalizeResponse = await request(app)
      .post('/billing/finalize-checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientToken: createResponse.body.clientToken })
      .expect(200);

    expect(finalizeResponse.body.status).toBe('captured');
    expect(finalizeResponse.body.wallet).toBeDefined();

    const wallet = await Wallet.findOne();
    expect(parseFloat(wallet.balance)).toBeCloseTo(75.0, 2);
  });
});
