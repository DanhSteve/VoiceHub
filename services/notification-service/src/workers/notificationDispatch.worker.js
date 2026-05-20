const amqp = require('amqplib');
const notificationService = require('../services/notification.service');
const { logger } = require('/shared');

const QUEUE = process.env.RABBITMQ_NOTIFICATION_DISPATCH_QUEUE || 'voicehub.notification.dispatch';
const DLQ = process.env.RABBITMQ_NOTIFICATION_DISPATCH_DLQ || `${QUEUE}.dlq`;
const MAX_RETRIES = Math.max(
  0,
  parseInt(process.env.NOTIFICATION_DISPATCH_MAX_RETRIES || '6', 10) || 6
);

let workerHandle = null;

function retryCount(msg) {
  const headers = msg?.properties?.headers || {};
  const n = parseInt(String(headers['x-retry-count'] ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}

async function publishDlq(ch, msg, err) {
  await ch.assertQueue(DLQ, { durable: true });
  ch.sendToQueue(
    DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown error'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function processJob(payload) {
  if (payload?.kind === 'bulk') {
    const userIds = Array.isArray(payload.userIds) ? payload.userIds : [];
    if (userIds.length === 0) throw new Error('bulk notification missing userIds');
    await notificationService.createBulkNotifications(userIds, payload.notification || {});
    return;
  }
  if (!payload?.userId) throw new Error('single notification missing userId');
  await notificationService.createNotification({
    userId: payload.userId,
    ...(payload.notification || {}),
  });
}

async function startNotificationDispatchWorker() {
  if (String(process.env.NOTIFICATION_DISPATCH_WORKER || 'false').toLowerCase() !== 'true') {
    return null;
  }
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is required for notification worker');

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.assertQueue(DLQ, { durable: true });

  const { consumerTag } = await ch.consume(
    QUEUE,
    async (msg) => {
      if (!msg) return;
      const attempts = retryCount(msg);
      try {
        const payload = JSON.parse(msg.content.toString('utf8'));
        await processJob(payload);
        ch.ack(msg);
      } catch (err) {
        logger.error('[notificationDispatchWorker]', err.message);
        if (attempts < MAX_RETRIES) {
          ch.sendToQueue(QUEUE, msg.content, {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': attempts + 1 },
          });
          ch.ack(msg);
          return;
        }
        await publishDlq(ch, msg, err);
        ch.ack(msg);
      }
    },
    { noAck: false }
  );

  logger.info(`[notificationDispatchWorker] listening on ${QUEUE}`);
  workerHandle = { conn, ch, consumerTag };
  return workerHandle;
}

async function stopNotificationDispatchWorker() {
  if (!workerHandle) return;
  try {
    await workerHandle.ch.cancel(workerHandle.consumerTag);
  } catch {}
  try {
    await workerHandle.ch.close();
  } catch {}
  try {
    await workerHandle.conn.close();
  } catch {}
  workerHandle = null;
}

module.exports = {
  startNotificationDispatchWorker,
  stopNotificationDispatchWorker,
};
