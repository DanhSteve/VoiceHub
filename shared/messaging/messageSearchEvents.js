/**
 * Wave 3B — Org message search index events (RabbitMQ topic `voicehub.topic`).
 */

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';

/** @readonly */
const MESSAGE_SEARCH_EVENT_TYPES = {
  CREATED: 'message.created',
  UPDATED: 'message.updated',
  DELETED: 'message.deleted',
};

const BINDING_KEYS = [
  MESSAGE_SEARCH_EVENT_TYPES.CREATED,
  MESSAGE_SEARCH_EVENT_TYPES.UPDATED,
  MESSAGE_SEARCH_EVENT_TYPES.DELETED,
];

const INDEXER_QUEUE =
  process.env.RABBITMQ_MESSAGE_SEARCH_QUEUE || 'voicehub.message.search.index';
const INDEXER_DLQ =
  process.env.RABBITMQ_MESSAGE_SEARCH_DLQ || `${INDEXER_QUEUE}.dlq`;

function routingKeyForType(type) {
  const t = String(type || '').trim();
  if (BINDING_KEYS.includes(t)) return t;
  return MESSAGE_SEARCH_EVENT_TYPES.UPDATED;
}

function isKnownMessageSearchEventType(type) {
  return Object.values(MESSAGE_SEARCH_EVENT_TYPES).includes(String(type || '').trim());
}

module.exports = {
  MESSAGE_SEARCH_EXCHANGE: EXCHANGE,
  MESSAGE_SEARCH_EVENT_TYPES,
  MESSAGE_SEARCH_BINDING_KEYS: BINDING_KEYS,
  MESSAGE_SEARCH_INDEXER_QUEUE: INDEXER_QUEUE,
  MESSAGE_SEARCH_INDEXER_DLQ: INDEXER_DLQ,
  routingKeyForType,
  isKnownMessageSearchEventType,
};
