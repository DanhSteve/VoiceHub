const amqp = require('amqplib');
const { randomUUID } = require('crypto');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';
const ROUTING_KEY = process.env.RABBITMQ_FRIEND_DM_ROUTING_KEY || 'friend.dm';

let connection = null;
let channel = null;
let connectPromise = null;

async function getChannel() {
  const url = process.env.RABBITMQ_URL;
  if (!url) return null;
  if (channel) return channel;

  if (!connectPromise) {
    connectPromise = (async () => {
      const conn = await amqp.connect(url);
      connection = conn;
      conn.on('error', (err) => {
        console.error('[rabbitPublisher] connection error', err.message);
        channel = null;
        connection = null;
        connectPromise = null;
      });
      conn.on('close', () => {
        channel = null;
        connection = null;
        connectPromise = null;
      });
      const ch = await conn.createChannel();
      await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
      channel = ch;
      return ch;
    })();
  }

  return connectPromise;
}

/**
 * Publish friend DM to queue. Returns { ok, correlationId } — không chờ chat-service.
 */
async function publishFriendDm({ senderId, receiverId, content, messageType = 'text' }) {
  try {
    const ch = await getChannel();
    if (!ch) {
      return { ok: false, reason: 'no_rabbitmq' };
    }

    const correlationId = randomUUID();
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        correlationId,
        senderId: String(senderId),
        receiverId: String(receiverId),
        content: String(content),
        messageType: messageType || 'text',
        enqueuedAt: new Date().toISOString(),
      })
    );

    const published = ch.publish(EXCHANGE, ROUTING_KEY, payload, {
      persistent: true,
      contentType: 'application/json',
      correlationId,
    });

    if (!published) {
      await new Promise((r) => ch.once('drain', r));
    }

    return { ok: true, correlationId };
  } catch (err) {
    console.error('[rabbitPublisher] publish failed', err.message);
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  publishFriendDm,
  getChannel,
};
