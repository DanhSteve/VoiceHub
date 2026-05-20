const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const http = require('http');
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, disconnectRedis } = require('/shared');
const initializeSocket = require('./socket/index');
const { startFriendDmConsumer, stopFriendDmConsumer } = require('./workers/friendDmConsumer');
const { startStorageGcScheduler } = require('./jobs/storageGc');

const PORT = process.env.PORT || 3006;

// Tùy chọn DB riêng cho chat (scale-out / tách DB)
const mongoUri = (process.env.CHAT_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

// Tạo HTTP server
const server = http.createServer(app);

// Khởi tạo Socket.IO
const io = initializeSocket(server);

// Kết nối database
connectDB(mongoUri)
  .then(() => {
    // Kết nối Redis
    connectRedis();

    startFriendDmConsumer().catch((err) => {
      console.error('[chat-service] friendDmConsumer failed to start:', err.message);
    });

    startStorageGcScheduler();

    // Khởi động server
    server.listen(PORT, () => {
      console.log(`Chat Service đang chạy trên cổng ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  try {
    await stopFriendDmConsumer();
  } catch (e) {
    console.error('[chat-service] stopFriendDmConsumer', e.message);
  }
  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await disconnectRedis();
      await disconnectDB();
    } catch (e) {
      /* ignore */
    }
    process.exit(0);
  });
});

