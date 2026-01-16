const sequelize = require('../../config/database');
const models = {
  User: require('../../models/User'),
  Wallet: require('../../models/Wallet'),
  Transaction: require('../../models/Transaction'),
  Subscription: require('../../models/Subscription'),
  StripeCheckoutSession: require('../../models/StripeCheckoutSession'),
  StripeWebhookEvent: require('../../models/StripeWebhookEvent'),
  SupportUser: require('../../models/SupportUser'),
  SupportSeatAllocation: require('../../models/SupportSeatAllocation'),
  SupportSeatAudit: require('../../models/SupportSeatAudit'),
  CdrImportBatch: require('../../models/CdrImportBatch'),
  CdrRecord: require('../../models/CdrRecord'),
  SubscriptionUsageBalance: require('../../models/SubscriptionUsageBalance'),
  SubscriptionUsageLedger: require('../../models/SubscriptionUsageLedger'),
  UsageDeductionBatch: require('../../models/UsageDeductionBatch'),
  Invoice: require('../../models/Invoice'),
  WalletTopUp: require('../../models/WalletTopUp'),
};

async function setupDatabase() {
  await sequelize.sync({ force: true });
}

async function truncateTables() {
  if (sequelize.getDialect() === 'sqlite') {
    await sequelize.sync({ force: true });
    return;
  }

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
