const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Subscription = require('./Subscription');

class UsageDeductionBatch extends Model {}

UsageDeductionBatch.init(
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
      onDelete: 'CASCADE',
    },
    chargeDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: 'charge_date',
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    totalAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_amount_cents',
    },
    pendingAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'pending_amount_cents',
    },
    status: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'pending',
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'attempt_count',
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_attempt_at',
    },
    retryAfter: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'retry_after',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    sequelize,
    modelName: 'UsageDeductionBatch',
    tableName: 'usage_deduction_batches',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['subscription_id', 'charge_date'],
      },
      {
        fields: ['status'],
      },
    ],
  }
);

UsageDeductionBatch.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(UsageDeductionBatch, { foreignKey: 'subscriptionId', as: 'usageDeductionBatches' });

module.exports = UsageDeductionBatch;
