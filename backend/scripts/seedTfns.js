#!/usr/bin/env node

/**
 * Seed the TFN table with a handful of available toll-free numbers.
 */

const path = require('path');
const dotenv = require('dotenv');

// Load env vars from backend/.env if present
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const sequelize = require('../config/database');
const Tfn = require('../models/Tfn');

const SEED_NUMBERS = [
  '+18885550101',
  '+18885550102',
  '+18885550103',
  '+18885550104',
  '+18885550105',
  '+18885550106',
  '+18885550107',
  '+18885550108',
  '+18885550109',
  '+18885550110',
];

async function seed() {
  try {
    await sequelize.authenticate();

    const rows = SEED_NUMBERS.map((phoneNumber) => ({
      phoneNumber,
      provisioningStatus: 'available',
    }));

    const result = await Tfn.bulkCreate(rows, {
      ignoreDuplicates: true,
    });

    console.log(`Seeded TFNs. Inserted/ignored: ${result.length}`);
  } catch (error) {
    console.error('Failed to seed TFNs:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

seed();
