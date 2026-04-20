/**
 * Mongoose singleton — phải dùng chung instance từ shared/config/mongo.js
 * (tránh buffering timed out do nhiều bản mongoose).
 */
const { mongoose } = require('../../../shared/config/mongo');

module.exports = mongoose;

