const amqp = require('amqplib');

let conn = null;
let channel = null;

async function getChannel() {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');

  conn = await amqp.connect(url);
  channel = await conn.createChannel();
  conn.on('error', () => {
    channel = null;
    conn = null;
  });
  conn.on('close', () => {
    channel = null;
    conn = null;
  });
  return channel;
}

async function publishJson(queue, payload) {
  const ch = await getChannel();
  await ch.assertQueue(queue, { durable: true });
  const buf = Buffer.from(JSON.stringify(payload));
  const opts = {
    persistent: true,
    contentType: 'application/json',
  };
  const trySend = () => ch.sendToQueue(queue, buf, opts);
  if (!trySend()) {
    await new Promise((resolve) => ch.once('drain', resolve));
    if (!trySend()) {
      await new Promise((resolve) => ch.once('drain', resolve));
    }
  }
  return true;
}

async function closeRabbit() {
  try {
    if (channel) await channel.close();
  } catch (e) {
    /* ignore */
  }
  channel = null;
  try {
    if (conn) await conn.close();
  } catch (e) {
    /* ignore */
  }
  conn = null;
}

module.exports = { getChannel, publishJson, closeRabbit };

