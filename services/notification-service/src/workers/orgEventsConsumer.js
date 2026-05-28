const amqp = require('amqplib');
const {
  ORG_EVENT_EXCHANGE,
  ORG_EVENT_TYPES,
  ORG_EVENTS_NOTIFICATION_QUEUE,
  ORG_EVENTS_NOTIFICATION_DLQ,
} = require('/shared/messaging/orgEvents');
const { isDuplicateOrgEvent } = require('/shared/messaging/orgEventIdempotency');
const {
  invalidateUnreadBadgeCache,
  invalidateUnreadForOrg,
} = require('../cache/notificationReadCache');

const NOTIFICATION_BINDING_KEYS = [
  ORG_EVENT_TYPES.MEMBER_JOINED,
  ORG_EVENT_TYPES.MEMBER_REMOVED,
  ORG_EVENT_TYPES.ROLE_UPDATED,
  ORG_EVENT_TYPES.ORG_DELETED,
];

let consumerHandle = null;

async function publishDlq(ch, msg, err) {
  await ch.assertQueue(ORG_EVENTS_NOTIFICATION_DLQ, { durable: true });
  ch.sendToQueue(
    ORG_EVENTS_NOTIFICATION_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function processOrgEvent(data) {
  const eventId = String(data?.eventId || '').trim();
  if (eventId && (await isDuplicateOrgEvent(eventId))) {
    return;
  }

  const organizationId = String(data?.organizationId || '').trim();
  if (!organizationId) return;

  const type = String(data?.type || '').trim();
  const userId = data?.userId ? String(data.userId) : null;

  if (type === ORG_EVENT_TYPES.ORG_DELETED) {
    await invalidateUnreadForOrg(organizationId);
    return;
  }

  if (userId) {
    await invalidateUnreadBadgeCache(userId, 'organization', organizationId);
    await invalidateUnreadBadgeCache(userId, 'personal', '');
  }
}

function isConsumerEnabled() {
  const raw = String(process.env.ORG_EVENTS_CONSUMER_ENABLED || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function startOrgEventsConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) {
    return null;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(ORG_EVENT_EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(ORG_EVENTS_NOTIFICATION_QUEUE, { durable: true });
  await ch.assertQueue(ORG_EVENTS_NOTIFICATION_DLQ, { durable: true });

  for (const key of NOTIFICATION_BINDING_KEYS) {
    await ch.bindQueue(ORG_EVENTS_NOTIFICATION_QUEUE, ORG_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(
    ORG_EVENTS_NOTIFICATION_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processOrgEvent(raw);
        ch.ack(msg);
      } catch (err) {
        try {
          await publishDlq(ch, msg, err);
        } catch {
          /* ignore */
        }
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  consumerHandle = { conn, ch, tag };
  return consumerHandle;
}

async function stopOrgEventsConsumer() {
  if (!consumerHandle) return;
  try {
    await consumerHandle.ch.cancel(consumerHandle.tag);
  } catch {
    /* ignore */
  }
  try {
    await consumerHandle.ch.close();
  } catch {
    /* ignore */
  }
  try {
    await consumerHandle.conn.close();
  } catch {
    /* ignore */
  }
  consumerHandle = null;
}

module.exports = { startOrgEventsConsumer, stopOrgEventsConsumer };
