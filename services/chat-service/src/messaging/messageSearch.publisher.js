const amqp = require('amqplib');
const {
  MESSAGE_SEARCH_EXCHANGE,
  MESSAGE_SEARCH_EVENT_TYPES,
  routingKeyForType,
  isKnownMessageSearchEventType,
} = require('/shared/messaging/messageSearchEvents');

function isPublishEnabled() {
  const raw = String(
    process.env.MESSAGE_SEARCH_PUBLISH_ENABLED ||
      process.env.MESSAGE_SEARCH_INDEXER_ENABLED ||
      'true'
  ).toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

/**
 * @param {'message.created'|'message.updated'|'message.deleted'} type
 * @param {{ messageId: string, organizationId?: string }} payload
 */
async function publishMessageSearchEvent(type, payload) {
  if (!isPublishEnabled()) return;
  const url = process.env.RABBITMQ_URL;
  if (!url) return;

  const eventType = isKnownMessageSearchEventType(type)
    ? type
    : MESSAGE_SEARCH_EVENT_TYPES.UPDATED;
  const messageId = String(payload?.messageId || '').trim();
  if (!messageId) return;

  const body = {
    type: eventType,
    messageId,
    organizationId: payload.organizationId ? String(payload.organizationId) : undefined,
    emittedAt: new Date().toISOString(),
  };

  const conn = await amqp.connect(url);
  try {
    const ch = await conn.createChannel();
    await ch.assertExchange(MESSAGE_SEARCH_EXCHANGE, 'topic', { durable: true });
    ch.publish(
      MESSAGE_SEARCH_EXCHANGE,
      routingKeyForType(eventType),
      Buffer.from(JSON.stringify(body)),
      { persistent: true, contentType: 'application/json' }
    );
    await ch.close();
  } finally {
    await conn.close();
  }
}

module.exports = { publishMessageSearchEvent, isPublishEnabled };
