const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class AddOn extends Model {}

AddOn.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: 'usd',
    },
    monthlyPriceCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'monthly_price_cents',
    },
    setupFeeCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'setup_fee_cents',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
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
    modelName: 'AddOn',
    tableName: 'addons',
    timestamps: true,
  }
);

module.exports = AddOn;
