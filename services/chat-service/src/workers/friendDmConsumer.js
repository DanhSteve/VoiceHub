const amqp = require('amqplib');
const { getRedisClient } = require('/shared');
const messageService = require('../services/message.service');
const { emitRealtimeEvent } = require('/shared');

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';
const QUEUE = process.env.RABBITMQ_FRIEND_DM_QUEUE || 'voicehub.friend.dm';
const ROUTING_KEY = process.env.RABBITMQ_FRIEND_DM_ROUTING_KEY || 'friend.dm';

let consumerTag = null;

async function isDuplicate(correlationId) {
  if (!correlationId) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  const k = `dm:corr:${correlationId}`;
  const res = await redis.set(k, '1', 'EX', 86400, 'NX');
  return res !== 'OK';
}

async function processPayload(data) {
  const {
    correlationId,
    senderId,
    receiverId,
    content,
    messageType = 'text',
  } = data;

  if (!senderId || !receiverId || !content) {
    console.error('[friendDmConsumer] invalid payload', data);
    return;
  }

  if (await isDuplicate(correlationId)) {
    console.warn('[friendDmConsumer] duplicate correlationId, skip', correlationId);
    return;
  }

  const message = await messageService.createMessage({
    senderId,
    receiverId,
    content,
    messageType: messageType || 'text',
  });

  await emitRealtimeEvent({
    event: 'friend:new_message',
    userId: String(receiverId),
    payload: message,
  });
  await emitRealtimeEvent({
    event: 'friend:sent',
    userId: String(senderId),
    payload: message,
  });
}

async function startFriendDmConsumer() {
  const url = process.env.RABBITMQ_URL;
  const enabled = process.env.FRIEND_DM_USE_QUEUE !== 'false';
  if (!url || !enabled) {
    console.log('[friendDmConsumer] skipped (no RABBITMQ_URL or FRIEND_DM_USE_QUEUE=false)');
    return;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();

  await ch.assertExchange(EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);

  const { consumerTag: tag } = await ch.consume(
    QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processPayload(raw);
        ch.ack(msg);
      } catch (err) {
        console.error('[friendDmConsumer] process error', err.message);
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
  consumerTag = tag;

  conn.on('error', (err) => console.error('[friendDmConsumer] conn error', err.message));
  console.log(`[friendDmConsumer] listening on ${QUEUE}`);

  return { conn, ch };
}

module.exports = { startFriendDmConsumer };
