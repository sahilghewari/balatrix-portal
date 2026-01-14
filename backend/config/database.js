const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');

dotenv.config();

const sequelize =
  process.env.NODE_ENV === 'test'
    ? new Sequelize('sqlite::memory:', {
        logging: false,
      })
    : new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS,
        {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT || 5432,
          dialect: 'postgres',
          logging: false,
        }
      );

module.exports = sequelize;
