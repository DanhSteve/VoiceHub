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
  const ok = ch.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
    persistent: true,
    contentType: 'application/json',
  });
  return ok;
}

module.exports = { getChannel, publishJson };

