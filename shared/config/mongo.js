const mongoose = require('mongoose');
const logger = require('../utils/logger');
let connectionListenersBound = false;

/**
 * Lưu ý: trong mỗi microservice, model/controller PHẢI dùng cùng `mongoose` với module này
 * (ví dụ `src/db.js` re-export `require('../../../shared/config/mongo').mongoose`).
 * `require('mongoose')` trực tiếp trong service dùng bản từ `service/node_modules` → khác singleton
 * → kết nối từ connectDB() không áp dụng → lỗi buffering timed out.
 */

/**
 * Kết nối MongoDB
 * @param {string} mongoUri - MongoDB connection string
 * @param {Object} options - Mongoose connection options
 * @returns {Promise<mongoose.Connection>}
 */
const connectDB = async (mongoUri = null, options = {}) => {
  try {
    const { exitOnFailure = true, ...mongooseOptions } = options || {};
    let uri = mongoUri || process.env.MONGODB_URI;
    let reconnectTimer = null;
    let reconnectDelayMs = 5000;
    let manualReconnectInFlight = false;

    if (!uri) {
      throw new Error('MONGODB_URI is not defined');
    }

    // MongoDB driver không hỗ trợ query option `charset`.
    // Nếu URI cũ có tham số này thì loại bỏ để tránh lỗi:
    // "MongoDB connection error: option charset is not supported"
    if (uri.includes('charset=')) {
      uri = uri.replace(/([?&])charset=[^&]*(&)?/i, (match, prefix, hasNext) => {
        if (prefix === '?' && hasNext) return '?';
        if (prefix === '&' && hasNext) return '&';
        return '';
      });
      uri = uri.replace(/[?&]$/, '');
    }

    // Kiểm tra xem có phải Atlas connection string không
    const isAtlas = uri.includes('mongodb+srv://') || uri.includes('mongodb.net');
    
    const defaultOptions = {
      serverSelectionTimeoutMS: 60000, // 60 seconds (tăng cho Atlas)
      socketTimeoutMS: 90000, // 90 seconds (tăng cho Atlas)
      connectTimeoutMS: 60000, // 60 seconds (tăng cho Atlas)
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 2, // Maintain at least 2 socket connections
      // Giữ connection sống
      heartbeatFrequencyMS: 10000, // Ping server mỗi 10 giây
      // Retry options cho Atlas
      retryWrites: true,
      retryReads: true,
      ...mongooseOptions,
    };
    
    if (isAtlas) {
      logger.info('Connecting to MongoDB Atlas...');
      console.log('[MongoDB] Using Atlas connection (mongodb+srv://)');
      console.log('[MongoDB] SSL/TLS will be automatically enabled for Atlas');
    } else {
      logger.info('Connecting to local MongoDB...');
      console.log('[MongoDB] Using local MongoDB connection');
    }

    const conn = await mongoose.connect(uri, defaultOptions);
    
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // Verify connection is ready
    try {
      await mongoose.connection.db.admin().ping();
      logger.info('MongoDB connection verified and ready');
    } catch (error) {
      logger.error('MongoDB ping failed:', error);
      throw error;
    }

    // Sau khi đã kết nối thật: không xếp hàng lệnh khi mất kết nối (tránh lỗi khó hiểu
    // "buffering timed out after 10000ms" — thay vào đó lỗi ngay nếu DB không sẵn sàng).
    mongoose.set('bufferCommands', false);
    logger.info('Mongoose bufferCommands=false (fail-fast khi Mongo không connected)');

    // Bind listeners đúng một lần để tránh leak khi service retry connect nhiều đợt.
    if (!connectionListenersBound) {
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
        console.error('[MongoDB] Connection error:', err.message);
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
        console.warn('[MongoDB] ⚠️ Disconnected from MongoDB');

        // MongoDB driver đã tự reconnect; chỉ fallback reconnect thủ công nếu bị disconnected kéo dài.
        if (reconnectTimer) return;

        reconnectTimer = setTimeout(async () => {
          reconnectTimer = null;

          // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
          if (mongoose.connection.readyState !== 0 || manualReconnectInFlight) return;

          const reconnectUri = uri || process.env.MONGODB_URI;
          if (!reconnectUri) {
            logger.error('MongoDB reconnect skipped: missing MONGODB_URI');
            return;
          }

          manualReconnectInFlight = true;
          try {
            logger.warn(`MongoDB still disconnected after ${reconnectDelayMs}ms, trying manual reconnect...`);
            await mongoose.connect(reconnectUri, defaultOptions);
            reconnectDelayMs = 5000; // reset backoff sau khi reconnect thành công
          } catch (err) {
            const message = err?.message || String(err);
            const isLikelyTransient =
              /tlsv1 alert internal error|server selection|whitelist|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message);

            if (isLikelyTransient) {
              logger.warn(`MongoDB manual reconnect transient failure: ${message}`);
            } else {
              logger.error(`MongoDB manual reconnect failed: ${message}`);
            }

            // exponential backoff, tối đa 30s
            reconnectDelayMs = Math.min(reconnectDelayMs * 2, 30000);
          } finally {
            manualReconnectInFlight = false;
          }
        }, reconnectDelayMs);
      });

      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
        console.log('[MongoDB] ✅ Reconnected to MongoDB');
      });
      
      mongoose.connection.on('connected', () => {
        logger.info('MongoDB connected');
        console.log('[MongoDB] ✅ Connected to MongoDB');
      });

      connectionListenersBound = true;
    }

    return conn;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    if (options?.exitOnFailure !== false) {
      process.exit(1);
    }
    throw error;
  }
};

/**
 * Đóng kết nối MongoDB
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
  }
};

module.exports = {
  connectDB,
  disconnectDB,
  mongoose,
};

