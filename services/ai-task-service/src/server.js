const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = require('./app');
const { connectDB, disconnectDB } = require('/shared');

const PORT = process.env.PORT || 3020;

// Có thể tách DB riêng cho AI
const mongoUri = (process.env.AI_TASK_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

connectDB(mongoUri)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`AI Task Service đang chạy trên cổng ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start ai-task-service:', error);
    process.exit(1);
  });

process.on('SIGTERM', async () => {
  try {
    await disconnectDB();
  } finally {
    process.exit(0);
  }
});

