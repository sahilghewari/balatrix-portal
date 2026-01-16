const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Wallet = require('./Wallet');
const Subscription = require('./Subscription');
const User = require('./User');

class WalletTopUp extends Model {}

WalletTopUp.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'wallets',
        key: 'id',
      },
      onDelete: 'CASCADE',
      field: 'wallet_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      field: 'user_id',
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'subscriptions',
        key: 'id',
      },
      onDelete: 'SET NULL',
      field: 'subscription_id',
    },
    amountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'amount_cents',
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'requires_action', 'succeeded', 'failed', 'canceled'),
      allowNull: false,
      defaultValue: 'pending',
    },
    stripePaymentIntentId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'stripe_payment_intent_id',
    },
    clientSecret: {
      type: DataTypes.STRING,
      allowNull: true,
      field: 'client_secret',
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    modelName: 'WalletTopUp',
    tableName: 'wallet_top_ups',
    timestamps: true,
  }
);

WalletTopUp.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
Wallet.hasMany(WalletTopUp, { foreignKey: 'walletId', as: 'topUps' });

WalletTopUp.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(WalletTopUp, { foreignKey: 'subscriptionId', as: 'walletTopUps' });

WalletTopUp.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(WalletTopUp, { foreignKey: 'userId', as: 'walletTopUps' });

module.exports = WalletTopUp;
