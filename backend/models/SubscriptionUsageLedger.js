const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Subscription = require('./Subscription');
const CdrRecord = require('./CdrRecord');

class SubscriptionUsageLedger extends Model {}

SubscriptionUsageLedger.init(
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
    cdrRecordId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cdr_record_id',
      references: {
        model: 'cdr_records',
        key: 'id',
      },
    },
    occurredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'occurred_at',
      defaultValue: DataTypes.NOW,
    },
    entryType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      field: 'entry_type',
    },
    secondsDelta: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'seconds_delta',
    },
    amountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'amount_cents',
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    balanceSecondsAfter: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'balance_seconds_after',
    },
    balanceCentsAfter: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'balance_cents_after',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'SubscriptionUsageLedger',
    tableName: 'subscription_usage_ledger',
    timestamps: true,
    indexes: [
      {
        fields: ['subscription_id', 'occurred_at'],
      },
      {
        fields: ['cdr_record_id'],
      },
    ],
  }
);

SubscriptionUsageLedger.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(SubscriptionUsageLedger, { foreignKey: 'subscriptionId', as: 'usageLedger' });

SubscriptionUsageLedger.belongsTo(CdrRecord, { foreignKey: 'cdrRecordId', as: 'cdrRecord' });
CdrRecord.hasMany(SubscriptionUsageLedger, { foreignKey: 'cdrRecordId', as: 'ledgerEntries' });

module.exports = SubscriptionUsageLedger;
