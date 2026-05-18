const amqp = require('amqplib');

const DISPATCH_QUEUE =
  process.env.RABBITMQ_NOTIFICATION_DISPATCH_QUEUE || 'voicehub.notification.dispatch';

async function publishDispatchJob(payload) {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not configured');
  const conn = await amqp.connect(url);
  try {
    const ch = await conn.createChannel();
    await ch.assertQueue(DISPATCH_QUEUE, { durable: true });
    const body = Buffer.from(JSON.stringify(payload));
    ch.sendToQueue(DISPATCH_QUEUE, body, {
      persistent: true,
      contentType: 'application/json',
    });
    await ch.close();
  } finally {
    await conn.close();
  }
}

module.exports = { publishDispatchJob, DISPATCH_QUEUE };
