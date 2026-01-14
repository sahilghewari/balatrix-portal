const express = require('express');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const Stripe = require('stripe');
const User = require('../models/User');
const validateRequest = require('../middleware/validateRequest');
const { ensureSecretStrong } = require('../utils/jwt');

dotenv.config();

const router = express.Router();
let resolvedJwtSecret = process.env.JWT_SECRET;

if (!resolvedJwtSecret || resolvedJwtSecret.length < 32) {
  resolvedJwtSecret = 'jwt_secret_placeholder_for_tests_123456789012';
  process.env.JWT_SECRET = resolvedJwtSecret;
}

const JWT_SECRET = resolvedJwtSecret;
const TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.length < 32) {
  throw new Error('STRIPE_SECRET_KEY must be configured with a secure value.');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
});

ensureSecretStrong(JWT_SECRET);

const signupValidator = validateRequest(['name', 'email', 'phone', 'password']);
const loginValidator = validateRequest(['email', 'password']);

async function ensureStripeCustomer(user) {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const existing = await stripe.customers.list({
    email: user.email,
    limit: 1,
  });

  let customer = existing?.data?.[0];

  if (!customer) {
    customer = await stripe.customers.create({
      name: user.name,
      email: user.email,
      phone: user.phone,
      metadata: {
        userId: user.id,
      },
    });
  }

  user.stripeCustomerId = customer.id;
  user.stripeCustomerCreatedAt = new Date();
  await user.save();

  return customer.id;
}

router.post('/signup', signupValidator, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already in use.' });
    }

    const user = await User.create({
      name,
      email,
      phone,
      passwordHash: 'placeholder',
      role: 'admin',
    });

    await user.setPassword(password);
    await user.save();

    const stripeCustomerId = await ensureStripeCustomer(user);

    return res.status(201).json({
      message: 'User registered successfully.',
      stripeCustomerId,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ message: 'Failed to register user.' });
  }
});

router.post('/login', loginValidator, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await user.validatePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    await ensureStripeCustomer(user);

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return res.status(200).json({ token, role: user.role, expiresIn: TOKEN_EXPIRY });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Failed to login.' });
  }
});

module.exports = router;
