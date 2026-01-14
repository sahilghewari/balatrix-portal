process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'balatrix_portal_test';
process.env.DB_USER = process.env.DB_USER_TEST || process.env.DB_USER || 'postgres';
process.env.DB_PASS = process.env.DB_PASS_TEST || process.env.DB_PASS || '';
process.env.DB_HOST = process.env.DB_HOST_TEST || process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT_TEST || process.env.DB_PORT || 5432;
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_123456789012345678901234567890123';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.STRIPE_SUCCESS_URL = 'http://localhost/success';
process.env.STRIPE_CANCEL_URL = 'http://localhost/cancel';

jest.setTimeout(30000);

const { sequelize } = require('./helpers/db');
const { resetStripeMock, getStripeMock } = require('./helpers/stripeMock');

jest.mock('stripe', () => {
  const { getStripeMock } = require('./helpers/stripeMock');
  return jest.fn(() => getStripeMock());
});

beforeAll(async () => {
  await sequelize.authenticate();
  getStripeMock();
});

afterEach(() => {
  resetStripeMock();
});

afterAll(async () => {
  await sequelize.close();
});
