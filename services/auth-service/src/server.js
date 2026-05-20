require('dotenv').config();

if (process.env.NODE_ENV === 'production') {
  const jwt = String(process.env.JWT_SECRET || '').trim();
  if (!jwt || jwt === 'your-secret-key' || jwt === 'your-secret-key-change-in-production') {
    console.error('[auth-service] FATAL: set JWT_SECRET to a strong non-default value in production.');
    process.exit(1);
  }
}

const app = require('./app');
// Sử dụng hàm connectDB / disconnectDB / connectRedis chung từ /shared
const { connectDB, disconnectDB, connectRedis } = require('/shared');

const PORT = process.env.PORT || 3001;

// Kết nối MongoDB (dùng shared connectDB)
connectDB()
  .then(async () => {
    // Kết nối Redis (dùng shared connectRedis)
    connectRedis();

    // Khởi động server
    app.listen(PORT, () => {
      console.log(`Auth Service đang chạy trên cổng ${PORT}`);
      console.log('[AuthService] ✅ Server ready to accept requests');
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await disconnectDB();
  process.exit(0);
});


