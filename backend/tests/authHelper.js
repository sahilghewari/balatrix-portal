const request = require('supertest');
const app = require('../backend/app');
const { truncateTables, setupDatabase } = require('./helpers/db');

async function signupAndLogin() {
  await setupDatabase();
  await truncateTables();

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

  const { token } = response.body;
  return { token, email, password };
}

module.exports = {
  signupAndLogin,
};
