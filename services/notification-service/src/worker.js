require('dotenv').config();
const { connectDB, disconnectDB, logger } = require('/shared');
const {
  startNotificationDispatchWorker,
  stopNotificationDispatchWorker,
} = require('./workers/notificationDispatch.worker');

async function start() {
  await connectDB();
  await startNotificationDispatchWorker();
  logger.info('[notification-dispatch-worker] started');
}

async function shutdown() {
  logger.info('[notification-dispatch-worker] shutting down');
  try {
    await stopNotificationDispatchWorker();
  } catch (e) {
    logger.error('[notification-dispatch-worker] stop worker failed:', e.message);
  }
  try {
    await disconnectDB();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((err) => {
  logger.error('[notification-dispatch-worker] fatal:', err.message);
  process.exit(1);
});
