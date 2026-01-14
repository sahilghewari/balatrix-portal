const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const Subscription = require('./Subscription');

class Extension extends Model {}

Extension.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'subscriptions',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    extNumber: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isMonitoring: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    webrtcUsername: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'webrtc_username',
    },
  },
  {
    sequelize,
    modelName: 'Extension',
    tableName: 'extensions',
    timestamps: true,
  }
);

Extension.belongsTo(Subscription, { foreignKey: 'subscriptionId', as: 'subscription' });
Subscription.hasMany(Extension, { foreignKey: 'subscriptionId', as: 'extensions' });

module.exports = Extension;
