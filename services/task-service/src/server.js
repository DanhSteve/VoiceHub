require('dotenv').config();
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, disconnectRedis, logger } = require('/shared');
const { startTaskFromFileWorker, stopTaskFromFileWorker } = require('./workers/taskFromFileWorker');

const PORT = process.env.PORT || 3009;

// Kết nối MongoDB
connectDB()
  .then(() => {
    // Kết nối Redis
    connectRedis();

    startTaskFromFileWorker().catch((err) => {
      logger.error('taskFromFileWorker failed:', err.message);
    });

    // Khởi động server
    const server = app.listen(PORT, () => {
      logger.info(`Task Service đang chạy trên cổng ${PORT}`);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received: closing HTTP server');
      server.close(async () => {
        try {
          await stopTaskFromFileWorker();
        } catch (e) {
          logger.error('stopTaskFromFileWorker', e.message);
        }
        try {
          await disconnectRedis();
          await disconnectDB();
        } catch (e) {
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

