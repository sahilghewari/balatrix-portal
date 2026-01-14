const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Wallet = require('./Wallet');

class Transaction extends Model {}

Transaction.init(
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
    },
    type: {
      type: DataTypes.ENUM('recharge', 'deduction'),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    timestamps: true,
  }
);

Transaction.belongsTo(Wallet, { foreignKey: 'walletId', as: 'wallet' });
Wallet.hasMany(Transaction, { foreignKey: 'walletId', as: 'transactions' });

module.exports = Transaction;
