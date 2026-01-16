const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const CdrImportBatch = require('./CdrImportBatch');
const Subscription = require('./Subscription');
const User = require('./User');

class CdrRecord extends Model {}

CdrRecord.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    batchId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'batch_id',
      references: {
        model: 'cdr_import_batches',
        key: 'id',
      },
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'subscription_id',
      references: {
        model: 'subscriptions',
        key: 'id',
      },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
    },
    providerCallId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      unique: true,
      field: 'provider_call_id',
    },
    direction: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    destination: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    destinationGroup: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'destination_group',
    },
    callStartedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'call_started_at',
    },
    callEndedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'call_ended_at',
    },
    durationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'duration_seconds',
    },
    billableSeconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'billable_seconds',
    },
    rateCents: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'rate_cents',
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    costCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'cost_cents',
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending',
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'attempt_count',
    },
    retryAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'retry_at',
    },
    errorCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'error_code',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    },
    rawPayload: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'raw_payload',
    },
  },
  {
    sequelize,
    modelName: 'CdrRecord',
    tableName: 'cdr_records',
    timestamps: true,
  }
);

CdrRecord.belongsTo(CdrImportBatch, { foreignKey: 'batchId', as: 'batch' });
CdrImportBatch.hasMany(CdrRecord, { foreignKey: 'batchId', as: 'cdrRecords' });

CdrRecord.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(CdrRecord, { foreignKey: 'subscriptionId', as: 'cdrRecords' });

CdrRecord.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(CdrRecord, { foreignKey: 'userId', as: 'cdrRecords' });

module.exports = CdrRecord;
