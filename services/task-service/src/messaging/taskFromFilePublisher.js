const amqp = require('amqplib');

const QUEUE = process.env.RABBITMQ_TASK_FROM_FILE_QUEUE || 'voicehub.task.from_file';

async function publishTaskFromFileJob(payload) {
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    throw new Error('RABBITMQ_URL is not configured');
  }
  const conn = await amqp.connect(url);
  try {
    const ch = await conn.createChannel();
    await ch.assertQueue(QUEUE, { durable: true });
    const buf = Buffer.from(JSON.stringify(payload));
    const opts = { persistent: true };
    if (!ch.sendToQueue(QUEUE, buf, opts)) {
      await new Promise((resolve) => ch.once('drain', resolve));
      ch.sendToQueue(QUEUE, buf, opts);
    }
    await ch.close();
  } finally {
    await conn.close();
  }
}

module.exports = { publishTaskFromFileJob, QUEUE };
