const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CdrImportBatch extends Model {}

CdrImportBatch.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    source: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'pending',
    },
    totalRecords: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_records',
    },
    processedRecords: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'processed_records',
    },
    failedRecords: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'failed_records',
    },
    checksum: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'started_at',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    sequelize,
    modelName: 'CdrImportBatch',
    tableName: 'cdr_import_batches',
    timestamps: true,
  }
);

module.exports = CdrImportBatch;
