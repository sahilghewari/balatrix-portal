const request = require('supertest');
const app = require('../../backend/app');

function getApp() {
  return request(app);
}

module.exports = {
  getApp,
};
