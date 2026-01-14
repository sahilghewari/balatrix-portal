const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const sequelize = require('../config/database');

class User extends Model {
  async setPassword(password) {
    const saltRounds = 10;
    this.passwordHash = await bcrypt.hash(password, saltRounds);
  }

  async validatePassword(password) {
    return bcrypt.compare(password, this.passwordHash);
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
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
    role: {
      type: DataTypes.ENUM('super_admin', 'admin', 'support'),
      allowNull: false,
      defaultValue: 'admin',
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      field: 'stripe_customer_id',
    },
    stripeCustomerCreatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'stripe_customer_created_at',
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
  }
);

module.exports = User;
