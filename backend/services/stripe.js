const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.length < 32) {
  throw new Error('STRIPE_SECRET_KEY must be configured with a secure value.');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
});

module.exports = { stripe };
