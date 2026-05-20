const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = require('./app');
const { connectDB, disconnectDB } = require('/shared');
const { closeRabbit } = require('./messaging/rabbit');

const PORT = process.env.PORT || 3020;

// Có thể tách DB riêng cho AI
const mongoUri = (process.env.AI_TASK_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

connectDB(mongoUri)
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`AI Task Service đang chạy trên cổng ${PORT}`);
    });

    process.on('SIGTERM', async () => {
      server.close(async () => {
        try {
          await closeRabbit();
        } catch (e) {
          /* ignore */
        }
        try {
          await disconnectDB();
        } catch (e) {
          /* ignore */
        }
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    console.error('Failed to start ai-task-service:', error);
    process.exit(1);
  });

