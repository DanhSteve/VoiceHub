/**
 * Shared utilities và configurations
 * Export tất cả modules để dễ import
 */

// Config
const mongo = require('./config/mongo');
const redis = require('./config/redis');

// Middleware
const auth = require('./middleware/auth');

// Utils
const logger = require('./utils/logger');

module.exports = {
  // Config
  mongo,
  redis,
  
  // Middleware
  auth,
  
  // Utils
  logger,
  
  // Named exports for convenience
  connectDB: mongo.connectDB,
  disconnectDB: mongo.disconnectDB,
  connectRedis: redis.connectRedis,
  getRedisClient: redis.getRedisClient,
  disconnectRedis: redis.disconnectRedis,
  authenticate: auth.authenticate,
  socketAuth: auth.socketAuth,
  optionalAuth: auth.optionalAuth,
  
  // Webhook utilities
  ...require('./utils/webhook'),
  // Realtime utilities
  ...require('./utils/realtime'),
  // Field encryption & metrics
  ...require('./utils/fieldCrypto'),
  ...require('./utils/cryptoMetrics'),
  ...require('./utils/migration'),
  firebaseStorage: require('./utils/firebaseStorage'),
  ...require('./utils/userServiceInternal'),
};

