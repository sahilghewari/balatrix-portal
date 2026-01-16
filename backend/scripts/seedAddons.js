#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sequelize = require('../config/database');
const AddOn = require('../models/AddOn');

const ADDONS = [
  {
    code: 'call_recording',
    name: 'Call Recording',
    description: 'Store and review recorded calls with 500 GB storage included.',
    currency: 'usd',
    monthlyPriceCents: 2500,
    setupFeeCents: 0,
  },
  {
    code: 'advanced_reporting',
    name: 'Advanced Reporting',
    description: 'Usage dashboards, export automation, and custom alerts.',
    currency: 'usd',
    monthlyPriceCents: 1500,
    setupFeeCents: 0,
  },
  {
    code: 'fraud_guard',
    name: 'Fraud Guard',
    description: 'Real-time fraud detection with automated blocking rules.',
    currency: 'usd',
    monthlyPriceCents: 3000,
    setupFeeCents: 5000,
  },
];

async function seed() {
  try {
    await sequelize.authenticate();

    for (const addon of ADDONS) {
      await AddOn.upsert(addon, { conflictFields: ['code'] });
    }

    console.log(`Seeded ${ADDONS.length} add-ons.`);
  } catch (error) {
    console.error('Failed to seed add-ons:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

seed();
