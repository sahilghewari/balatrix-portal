const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

class Wallet extends Model {}

Wallet.init(
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
      unique: true,
    },
    balance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
    balanceZero: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    defaultCard: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    autoCharge: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'Wallet',
    tableName: 'wallets',
    timestamps: true,
  }
);

Wallet.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(Wallet, { foreignKey: 'userId', as: 'wallet' });

module.exports = Wallet;
