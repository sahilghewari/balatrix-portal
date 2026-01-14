const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

class SupportSeatAllocation extends Model {}

SupportSeatAllocation.init(
  {
    adminId: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
      field: 'admin_id',
    },
    totalSeats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_seats',
    },
    usedSeats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'used_seats',
    },
    maxMonitoringSeats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'max_monitoring_seats',
    },
  },
  {
    sequelize,
    modelName: 'SupportSeatAllocation',
    tableName: 'support_seat_allocations',
    timestamps: true,
  }
);

SupportSeatAllocation.belongsTo(User, { foreignKey: 'adminId', as: 'admin' });
User.hasOne(SupportSeatAllocation, { foreignKey: 'adminId', as: 'seatAllocation' });

module.exports = SupportSeatAllocation;
