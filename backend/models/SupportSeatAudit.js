const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class SupportSeatAudit extends Model {}

SupportSeatAudit.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'admin_id',
    },
    actorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'actor_id',
    },
    supportUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'support_user_id',
    },
    action: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'SupportSeatAudit',
    tableName: 'support_seat_audit_logs',
    timestamps: true,
  }
);

module.exports = SupportSeatAudit;
