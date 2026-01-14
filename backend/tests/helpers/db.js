const sequelize = require('../../config/database');
const models = {
  User: require('../../models/User'),
  Wallet: require('../../models/Wallet'),
  Transaction: require('../../models/Transaction'),
  Subscription: require('../../models/Subscription'),
  StripeCheckoutSession: require('../../models/StripeCheckoutSession'),
  StripeWebhookEvent: require('../../models/StripeWebhookEvent'),
};

async function setupDatabase() {
  await sequelize.sync({ force: true });
}

async function truncateTables() {
  const modelKeys = Object.keys(models);
  for (const key of modelKeys) {
    await models[key].destroy({ where: {}, truncate: true, cascade: true, force: true });
  }
}

module.exports = {
  sequelize,
  setupDatabase,
  truncateTables,
};
