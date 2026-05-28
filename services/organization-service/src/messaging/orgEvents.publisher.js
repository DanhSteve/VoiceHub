const crypto = require('crypto');
const amqp = require('amqplib');
const { logger } = require('/shared');
const {
  ORG_EVENT_EXCHANGE,
  ORG_EVENT_TYPES,
  routingKeyForType,
  isKnownOrgEventType,
} = require('/shared/messaging/orgEvents');

function isPublishEnabled() {
  const raw = String(
    process.env.ORG_ACL_EVENTS_ENABLED ||
      process.env.ORG_ACL_EVENT_PUBLISH ||
      'false'
  ).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * @param {{
 *   type: string,
 *   organizationId: string,
 *   userId?: string|null,
 *   eventId?: string,
 *   meta?: object,
 * }} payload
 */
async function publishOrgEvent(payload) {
  if (!isPublishEnabled()) return false;
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    logger.warn('[orgEvents] skip publish: RABBITMQ_URL missing');
    return false;
  }

  const organizationId = String(payload?.organizationId || '').trim();
  if (!organizationId) return false;

  const type = isKnownOrgEventType(payload?.type)
    ? String(payload.type).trim()
    : ORG_EVENT_TYPES.ACL_UPDATED;

  const body = {
    eventId: String(payload?.eventId || crypto.randomUUID()),
    type,
    organizationId,
    userId: payload?.userId ? String(payload.userId) : null,
    at: new Date().toISOString(),
    meta: payload?.meta && typeof payload.meta === 'object' ? payload.meta : {},
  };

  const routingKey = routingKeyForType(type);
  const conn = await amqp.connect(url);
  try {
    const ch = await conn.createChannel();
    await ch.assertExchange(ORG_EVENT_EXCHANGE, 'topic', { durable: true });
    ch.publish(ORG_EVENT_EXCHANGE, routingKey, Buffer.from(JSON.stringify(body)), {
      persistent: true,
      contentType: 'application/json',
      messageId: body.eventId,
    });
    await ch.close();
    return true;
  } finally {
    await conn.close();
  }
}

/** @deprecated — dùng publishOrgEvent({ type: ORG_EVENT_TYPES.ACL_UPDATED, ... }) */
async function publishOrgAclUpdated(payload) {
  return publishOrgEvent({
    type: ORG_EVENT_TYPES.ACL_UPDATED,
    organizationId: payload?.organizationId,
    userId: payload?.userId,
    eventId: payload?.eventId,
    meta: { action: payload?.action || 'invalidate' },
  });
}

module.exports = {
  publishOrgEvent,
  publishOrgAclUpdated,
  isPublishEnabled,
  ORG_EVENT_TYPES,
};
