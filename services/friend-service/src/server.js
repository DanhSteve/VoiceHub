const path = require('path');
// Luôn đọc .env trong thư mục service (kể cả khi chạy từ thư mục khác)
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('/shared');
const { purgeExpiredGraces } = require('./services/unfriendGrace.service');

const PORT = process.env.PORT || 3014;
const PURGE_POLL_MS = Math.max(
  60_000,
  Number(process.env.FRIEND_UNFRIEND_PURGE_POLL_MS || 5 * 60 * 1000)
);

let purgeTimer = null;

function startUnfriendGracePurgeLoop() {
  if (purgeTimer) return;
  const tick = async () => {
    try {
      const { purged, scanned } = await purgeExpiredGraces();
      if (purged > 0) {
        logger.info(`[unfriend-grace] purged ${purged}/${scanned} expired pair(s)`);
      }
    } catch (err) {
      logger.warn('[unfriend-grace] purge tick failed:', err.message);
    }
  };
  void tick();
  purgeTimer = setInterval(tick, PURGE_POLL_MS);
  logger.info(`[unfriend-grace] purge loop every ${PURGE_POLL_MS}ms`);
}

// Kết nối MongoDB
connectDB()
  .then(() => {
    // Kết nối Redis
    connectRedis();
    startUnfriendGracePurgeLoop();

    // Khởi động server
    app.listen(PORT, () => {
      logger.info(`Friend Service đang chạy trên cổng ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  if (purgeTimer) clearInterval(purgeTimer);
  await disconnectDB();
  process.exit(0);
});

