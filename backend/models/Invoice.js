const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Subscription = require('./Subscription');
const User = require('./User');

class Invoice extends Model {}

Invoice.init(
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    invoiceNumber: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true,
      field: 'invoice_number',
    },
    status: {
      type: DataTypes.ENUM('draft', 'issued', 'paid', 'void', 'overdue'),
      allowNull: false,
      defaultValue: 'draft',
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    billingCycle: {
      type: DataTypes.STRING(16),
      allowNull: false,
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'period_start',
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'period_end',
    },
    issueDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'issue_date',
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'due_date',
    },
    subtotalCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'subtotal_cents',
    },
    usageAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'usage_amount_cents',
    },
    planAmountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'plan_amount_cents',
    },
    walletOffsetCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'wallet_offset_cents',
    },
    totalCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_cents',
    },
    lineItems: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'line_items',
    },
    notes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'Invoice',
    tableName: 'invoices',
    timestamps: true,
    indexes: [
      {
        fields: ['subscription_id', 'period_start', 'period_end'],
      },
      {
        fields: ['user_id', 'status'],
      },
    ],
  }
);

Invoice.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(Invoice, { foreignKey: 'subscriptionId', as: 'invoices' });

Invoice.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Invoice, { foreignKey: 'userId', as: 'invoices' });

module.exports = Invoice;
