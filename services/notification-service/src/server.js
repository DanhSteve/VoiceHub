require('dotenv').config();
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('/shared');
const {
  startNotificationDispatchWorker,
  stopNotificationDispatchWorker,
} = require('./workers/notificationDispatch.worker');

const PORT = process.env.PORT || 3003;

// Kết nối MongoDB
connectDB()
  .then(() => {
    // Kết nối Redis
    connectRedis();

    startNotificationDispatchWorker().catch((err) => {
      logger.error('notificationDispatchWorker failed:', err.message);
    });

    // Khởi động server
    const server = app.listen(PORT, () => {
      logger.info(`Notification Service đang chạy trên cổng ${PORT}`);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        try {
          await stopNotificationDispatchWorker();
        } catch (e) {
          logger.error('stopNotificationDispatchWorker', e.message);
        }
        try {
          await disconnectDB();
        } catch {
          /* ignore */
        }
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

