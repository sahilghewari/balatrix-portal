const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Subscription = require('./Subscription');

class Tfn extends Model {}

Tfn.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'subscriptions',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    provisioningStatus: {
      type: DataTypes.ENUM('available', 'pending', 'active', 'released'),
      allowNull: false,
      defaultValue: 'available',
    },
    setupFeeCharged: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    sequelize,
    modelName: 'Tfn',
    tableName: 'tfns',
    timestamps: true,
  }
);

Tfn.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(Tfn, { foreignKey: 'subscriptionId', as: 'tfns' });

module.exports = Tfn;
