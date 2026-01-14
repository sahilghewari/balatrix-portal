let stripeInstance = null;
let webhookEventOverride = null;

function createStripeMock() {
  let customerCounter = 1;
  const customers = new Map();
  const sessions = new Map();
  const paymentIntents = new Map();

  const api = {
    __reset() {
      customerCounter = 1;
      customers.clear();
      sessions.clear();
      paymentIntents.clear();
      webhookEventOverride = null;
    },
    customers: {
      async create({ name, email, phone }) {
        const id = `cus_test_${customerCounter++}`;
        const customer = { id, name, email, phone };
        customers.set(id, customer);
        return customer;
      },
      async list({ email, limit }) {
        const matches = Array.from(customers.values()).filter((customer) => customer.email === email);
        return { data: matches.slice(0, limit || matches.length) };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          const suffix = Math.random().toString(36).slice(2, 10);
          const id = `cs_test_${suffix}`;
          const amount = params.line_items.reduce(
            (total, item) => total + item.price_data.unit_amount * item.quantity,
            0
          );

          const paymentIntentId = `pi_test_${suffix}`;
          const paymentIntent = {
            id: paymentIntentId,
            amount,
            currency: params.line_items[0]?.price_data?.currency || 'usd',
            status: 'succeeded',
            charges: {
              data: [
                {
                  id: `ch_test_${suffix}`,
                  amount,
                  currency: 'usd',
                  payment_method_details: {
                    card: {
                      brand: 'visa',
                      last4: '4242',
                    },
                  },
                },
              ],
            },
            payment_method: `pm_test_${suffix}`,
          };

          paymentIntents.set(paymentIntentId, paymentIntent);

          const session = {
            id,
            ...params,
            status: 'complete',
            payment_status: 'paid',
            payment_intent: paymentIntent,
            payment_method: paymentIntent.payment_method,
            url: `https://checkout.test/${id}`,
          };

          sessions.set(id, session);
          return session;
        },
        async retrieve(id) {
          const session = sessions.get(id);
          if (!session) {
            throw new Error(`No session found for ${id}`);
          }
          return session;
        },
      },
    },
    paymentIntents: {
      async retrieve(id) {
        const intent = paymentIntents.get(id);
        if (!intent) {
          throw new Error(`No payment intent found for ${id}`);
        }
        return intent;
      },
    },
    webhooks: {
      constructEvent(payload) {
        if (webhookEventOverride) {
          const event = webhookEventOverride;
          webhookEventOverride = null;
          return event;
        }

        const raw = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      },
    },
  };

  stripeInstance = api;
  return api;
}

function getStripeMock() {
  if (!stripeInstance) {
    stripeInstance = createStripeMock();
  }
  return stripeInstance;
}

function resetStripeMock() {
  if (stripeInstance && typeof stripeInstance.__reset === 'function') {
    stripeInstance.__reset();
  }
}

function setNextWebhookEvent(event) {
  webhookEventOverride = event;
}

module.exports = {
  createStripeMock,
  getStripeMock,
  resetStripeMock,
  setNextWebhookEvent,
};
