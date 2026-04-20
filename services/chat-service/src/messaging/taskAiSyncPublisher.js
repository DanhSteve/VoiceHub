const amqp = require('amqplib');

const QUEUE = process.env.RABBITMQ_TASK_AI_SYNC_QUEUE || 'task-ai.sync';

async function publishTaskAiSyncEvent(payload) {
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    throw new Error('RABBITMQ_URL is not set');
  }
  const conn = await amqp.connect(url);
  try {
    const ch = await conn.createChannel();
    await ch.assertQueue(QUEUE, { durable: true });
    ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      contentType: 'application/json',
    });
    await ch.close();
  } finally {
    await conn.close();
  }
}

module.exports = { publishTaskAiSyncEvent };

