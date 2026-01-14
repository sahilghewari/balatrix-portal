const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class StripeCheckoutSession extends Model {}

StripeCheckoutSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    clientToken: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'client_token',
    },
    stripeSessionId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'stripe_session_id',
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'stripe_customer_id',
    },
    intent: {
      type: DataTypes.ENUM('plan_purchase', 'wallet_top_up'),
      allowNull: false,
      defaultValue: 'plan_purchase',
    },
    planTier: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'plan_tier',
    },
    billingCycle: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'billing_cycle',
    },
    addons: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    planAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'plan_amount',
    },
    addonAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'addon_amount',
    },
    totalAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'total_amount',
    },
    walletTopUpCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'wallet_topup_cents',
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    status: {
      type: DataTypes.ENUM('pending', 'awaiting_capture', 'captured', 'expired', 'failed'),
      allowNull: false,
      defaultValue: 'pending',
    },
    paymentIntentId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'payment_intent_id',
    },
    setupIntentId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'setup_intent_id',
    },
    paymentMethodId: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'payment_method_id',
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    capturedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'captured_at',
    },
  },
  {
    sequelize,
    modelName: 'StripeCheckoutSession',
    tableName: 'stripe_checkout_sessions',
    timestamps: true,
  }
);

module.exports = StripeCheckoutSession;
