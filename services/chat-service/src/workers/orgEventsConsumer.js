const amqp = require('amqplib');
const {
  ORG_EVENT_EXCHANGE,
  ORG_EVENT_TYPES,
  ORG_EVENT_BINDING_KEYS,
  ORG_EVENTS_CHAT_QUEUE,
  ORG_EVENTS_CHAT_DLQ,
} = require('/shared/messaging/orgEvents');
const { isDuplicateOrgEvent } = require('/shared/messaging/orgEventIdempotency');
const { invalidateLocalOrgAcl } = require('../services/orgAccessReadModel');
const { deleteOrgMessagesByOrganization } = require('../services/messageSearchIndex.service');
const { isMeilisearchConfigured } = require('../services/meilisearchClient');

let consumerHandle = null;

async function publishDlq(ch, msg, err) {
  await ch.assertQueue(ORG_EVENTS_CHAT_DLQ, { durable: true });
  ch.sendToQueue(
    ORG_EVENTS_CHAT_DLQ,
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
    console.warn('[orgEventsConsumer] duplicate eventId, skip', eventId);
    return;
  }

  const organizationId = String(data?.organizationId || '').trim();
  if (!organizationId) return;

  const type = String(data?.type || ORG_EVENT_TYPES.ACL_UPDATED).trim();
  const userId = data?.userId ? String(data.userId) : null;

  switch (type) {
    case ORG_EVENT_TYPES.ORG_DELETED:
      await invalidateLocalOrgAcl(organizationId, null);
      if (isMeilisearchConfigured()) {
        try {
          await deleteOrgMessagesByOrganization(organizationId);
        } catch (e) {
          console.warn('[orgEventsConsumer] meili purge org failed', e.message);
        }
      }
      break;
    case ORG_EVENT_TYPES.CHANNEL_PROVISIONED:
      await invalidateLocalOrgAcl(organizationId, null);
      break;
    case ORG_EVENT_TYPES.MEMBER_JOINED:
    case ORG_EVENT_TYPES.MEMBER_REMOVED:
    case ORG_EVENT_TYPES.ROLE_UPDATED:
    case ORG_EVENT_TYPES.ACL_UPDATED:
    default:
      await invalidateLocalOrgAcl(organizationId, userId);
      break;
  }
}

function isConsumerEnabled() {
  const raw = String(
    process.env.ORG_ACL_CONSUMER_ENABLED ||
      process.env.ORG_ACL_EVENTS_CONSUMER_ENABLED ||
      'false'
  ).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function startOrgEventsConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) {
    console.log('[orgEventsConsumer] skipped (ORG_ACL_CONSUMER_ENABLED or RABBITMQ_URL)');
    return null;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(ORG_EVENT_EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(ORG_EVENTS_CHAT_QUEUE, { durable: true });
  await ch.assertQueue(ORG_EVENTS_CHAT_DLQ, { durable: true });

  for (const key of ORG_EVENT_BINDING_KEYS) {
    await ch.bindQueue(ORG_EVENTS_CHAT_QUEUE, ORG_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(
    ORG_EVENTS_CHAT_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processOrgEvent(raw);
        ch.ack(msg);
      } catch (err) {
        console.error('[orgEventsConsumer] process error', err.message);
        try {
          await publishDlq(ch, msg, err);
        } catch (dlqErr) {
          console.error('[orgEventsConsumer] DLQ publish failed', dlqErr.message);
        }
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) => console.error('[orgEventsConsumer] conn error', err.message));
  console.log(
    `[orgEventsConsumer] listening ${ORG_EVENTS_CHAT_QUEUE} keys=${ORG_EVENT_BINDING_KEYS.join(',')}`
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

module.exports = { startOrgEventsConsumer, stopOrgEventsConsumer, processOrgEvent };
