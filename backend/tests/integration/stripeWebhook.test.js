const request = require('supertest');
const crypto = require('crypto');
const appModule = require('../../app');
const StripeWebhookEvent = require('../../models/StripeWebhookEvent');
const StripeCheckoutSession = require('../../models/StripeCheckoutSession');
const { truncateTables } = require('../helpers/db');
const { resetStripeMock, setNextWebhookEvent } = require('../helpers/stripeMock');

jest.mock('stripe', () => {
  const { getStripeMock } = require('../helpers/stripeMock');
  return jest.fn(() => getStripeMock());
});

const app = appModule.app;

describe('Stripe webhook handling', () => {
  beforeAll(async () => {
    await appModule.initializeDatabase();
  });

  beforeEach(async () => {
    await truncateTables();
    resetStripeMock();
  });

  test('processes checkout completed event and stores dedupe record', async () => {
    const clientToken = crypto.randomBytes(16).toString('hex');
    const sessionId = `cs_test_${crypto.randomBytes(4).toString('hex')}`;
    const paymentIntentId = `pi_test_${crypto.randomBytes(4).toString('hex')}`;
    const eventId = `evt_test_${crypto.randomBytes(4).toString('hex')}`;

    await StripeCheckoutSession.create({
      userId: crypto.randomUUID(),
      clientToken,
      stripeSessionId: sessionId,
      stripeCustomerId: 'cus_test_123',
      intent: 'plan_purchase',
      planTier: 'starter',
      billingCycle: 'monthly',
      addons: [],
      planAmount: 5000,
      addonAmount: 0,
      totalAmount: 5000,
      currency: 'usd',
      status: 'pending',
    });

    const eventPayload = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_intent: paymentIntentId,
          payment_method: 'pm_test_123',
          customer: 'cus_test_123',
          metadata: {
            clientToken,
          },
        },
      },
    };

    setNextWebhookEvent(eventPayload);

    const response = await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'test')
      .send(eventPayload)
      .expect(200);

    expect(response.body.received).toBe(true);

    const storedEvent = await StripeWebhookEvent.findOne({ where: { eventId } });
    expect(storedEvent).not.toBeNull();
    expect(storedEvent.status).toBe('processed');
    expect(storedEvent.attempts).toBe(1);

    const updatedSession = await StripeCheckoutSession.findOne({ where: { clientToken } });
    expect(updatedSession.status).toBe('awaiting_capture');
    expect(updatedSession.paymentIntentId).toBe(paymentIntentId);

    setNextWebhookEvent(eventPayload);
    const replayResponse = await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'test')
      .send(eventPayload)
      .expect(200);

    expect(replayResponse.body.deduplicated).toBe(true);

    const replayEvent = await StripeWebhookEvent.findOne({ where: { eventId } });
    expect(replayEvent.attempts).toBe(1);
  });

  test('marks event failed when handler throws', async () => {
    const clientToken = crypto.randomBytes(16).toString('hex');
    const eventId = `evt_test_${crypto.randomBytes(4).toString('hex')}`;
    const sessionId = `cs_test_${crypto.randomBytes(4).toString('hex')}`;
    const paymentIntentId = `pi_test_${crypto.randomBytes(4).toString('hex')}`;

    await StripeCheckoutSession.create({
      userId: crypto.randomUUID(),
      clientToken,
      stripeSessionId: sessionId,
      stripeCustomerId: 'cus_test_456',
      intent: 'plan_purchase',
      planTier: 'growth',
      billingCycle: 'monthly',
      addons: [],
      planAmount: 8000,
      addonAmount: 0,
      totalAmount: 8000,
      currency: 'usd',
      status: 'pending',
    });

    const eventPayload = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_intent: paymentIntentId,
          metadata: {
            clientToken,
          },
        },
      },
    };

    setNextWebhookEvent(eventPayload);

    const failureError = new Error('Simulated query failure');
    const findOneSpy = jest
      .spyOn(StripeCheckoutSession, 'findOne')
      .mockImplementationOnce(() => {
        throw failureError;
      });

    await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'test')
      .send(eventPayload)
      .expect(500);

    const storedEvent = await StripeWebhookEvent.findOne({ where: { eventId } });
    expect(storedEvent).not.toBeNull();
    expect(storedEvent.status).toBe('failed');
    expect(storedEvent.attempts).toBe(1);
    expect(storedEvent.lastError).toBeDefined();

    findOneSpy.mockRestore();

    setNextWebhookEvent(eventPayload);

    await request(app)
      .post('/billing/webhook')
      .set('stripe-signature', 'test')
      .send(eventPayload)
      .expect(200);

    const retriedEvent = await StripeWebhookEvent.findOne({ where: { eventId } });
    expect(retriedEvent.attempts).toBe(2);
    expect(retriedEvent.status).toBe('processed');
    expect(retriedEvent.processedAt).not.toBeNull();
  });
});
