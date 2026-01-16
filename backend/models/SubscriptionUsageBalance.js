const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Subscription = require('./Subscription');

class SubscriptionUsageBalance extends Model {}

SubscriptionUsageBalance.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
        key: 'id',
      },
    },
    billingPeriodStart: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'billing_period_start',
    },
    billingPeriodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'billing_period_end',
    },
    includedSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'included_seconds',
    },
    rolloverSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'rollover_seconds',
    },
    consumedSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'consumed_seconds',
    },
    remainingSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'remaining_seconds',
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'open',
    },
  },
  {
    sequelize,
    modelName: 'SubscriptionUsageBalance',
    tableName: 'subscription_usage_balances',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['subscription_id', 'billing_period_start', 'billing_period_end'],
      },
      {
        fields: ['status'],
      },
    ],
  }
);

SubscriptionUsageBalance.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(SubscriptionUsageBalance, { foreignKey: 'subscriptionId', as: 'usageBalances' });

module.exports = SubscriptionUsageBalance;
