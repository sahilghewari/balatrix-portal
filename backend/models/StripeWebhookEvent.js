const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class StripeWebhookEvent extends Model {}

StripeWebhookEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    eventId: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      field: 'event_id',
    },
    type: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('processing', 'processed', 'failed'),
      allowNull: false,
      defaultValue: 'processing',
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
  },
  {
    sequelize,
    modelName: 'StripeWebhookEvent',
    tableName: 'stripe_webhook_events',
    timestamps: true,
    indexes: [
      {
        fields: ['event_id'],
        unique: true,
      },
    ],
  }
);

module.exports = StripeWebhookEvent;
