const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

class Subscription extends Model {}

Subscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    planTier: {
      type: DataTypes.ENUM('starter', 'professional', 'call_center'),
      allowNull: false,
    },
    planAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'plan_amount_cents',
      defaultValue: 0,
    },
    addonAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'addon_amount_cents',
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'yearly'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'pending', 'cancelled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    autoRenew: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'auto_renew',
    },
    balanceZeroFlaggedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'balance_zero_flagged_at',
    },
    monitoringPurchased: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastChargeAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_charge_attempt_at',
    },
    nextBillingDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_billing_date',
    },
  },
  {
    sequelize,
    modelName: 'Subscription',
    tableName: 'subscriptions',
    timestamps: true,
  }
);

Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Subscription, { foreignKey: 'userId', as: 'subscriptions' });

module.exports = Subscription;
