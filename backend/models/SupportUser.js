const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Extension = require('./Extension');

class SupportUser extends Model {}

SupportUser.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    seatNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'seat_number',
    },
    status: {
      type: DataTypes.ENUM('active', 'suspended'),
      allowNull: false,
      defaultValue: 'active',
    },
    monitoringAccess: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    monitoringExtensionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'extensions',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    invitedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'invited_at',
    },
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'invited_by',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_login_at',
    },
  },
  {
    sequelize,
    modelName: 'SupportUser',
    tableName: 'support_users',
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['adminId', 'email'],
        name: 'support_users_admin_email_unique',
      },
    ],
  }
);

SupportUser.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });
User.hasMany(SupportUser, { foreignKey: 'adminId', as: 'supportUsers' });
SupportUser.belongsTo(Extension, { foreignKey: 'monitoringExtensionId', as: 'monitoringExtension' });

module.exports = SupportUser;
