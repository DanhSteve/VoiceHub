const amqp = require('amqplib');
const {
  MESSAGE_SEARCH_EXCHANGE,
  MESSAGE_SEARCH_EVENT_TYPES,
  MESSAGE_SEARCH_BINDING_KEYS,
  MESSAGE_SEARCH_INDEXER_QUEUE,
  MESSAGE_SEARCH_INDEXER_DLQ,
} = require('/shared/messaging/messageSearchEvents');
const Message = require('../models/Message');
const {
  buildMessageSearchDocument,
  isOrgIndexableMessage,
} = require('../search/messageSearchDocument');
const {
  upsertOrgMessageDocument,
  deleteOrgMessageDocument,
} = require('../services/messageSearchIndex.service');
const { isMeilisearchConfigured } = require('../services/meilisearchClient');

let consumerHandle = null;

async function publishDlq(ch, msg, err) {
  await ch.assertQueue(MESSAGE_SEARCH_INDEXER_DLQ, { durable: true });
  ch.sendToQueue(
    MESSAGE_SEARCH_INDEXER_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function indexMessageById(messageId) {
  const doc = await Message.findById(messageId);
  if (!doc || !isOrgIndexableMessage(doc)) {
    await deleteOrgMessageDocument(messageId);
    return;
  }
  if (doc.isDeleted || doc.isRecalled) {
    await deleteOrgMessageDocument(messageId);
    return;
  }
  await upsertOrgMessageDocument(doc);
}

async function processMessageSearchEvent(data) {
  const type = String(data?.type || MESSAGE_SEARCH_EVENT_TYPES.UPDATED).trim();
  const messageId = String(data?.messageId || '').trim();
  if (!messageId) return;

  if (type === MESSAGE_SEARCH_EVENT_TYPES.DELETED) {
    await deleteOrgMessageDocument(messageId);
    return;
  }

  await indexMessageById(messageId);
}

function isIndexerEnabled() {
  const raw = String(process.env.MESSAGE_SEARCH_INDEXER_ENABLED || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function startMessageSearchIndexer() {
  if (!isIndexerEnabled() || !isMeilisearchConfigured()) {
    console.log('[messageSearchIndexer] skipped (MESSAGE_SEARCH_INDEXER_ENABLED or MEILI_HOST)');
    return null;
  }
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    console.log('[messageSearchIndexer] skipped (RABBITMQ_URL)');
    return null;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(MESSAGE_SEARCH_EXCHANGE, 'topic', { durable: true });
  await ch.assertQueue(MESSAGE_SEARCH_INDEXER_QUEUE, { durable: true });
  await ch.assertQueue(MESSAGE_SEARCH_INDEXER_DLQ, { durable: true });

  for (const key of MESSAGE_SEARCH_BINDING_KEYS) {
    await ch.bindQueue(MESSAGE_SEARCH_INDEXER_QUEUE, MESSAGE_SEARCH_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(
    MESSAGE_SEARCH_INDEXER_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processMessageSearchEvent(raw);
        ch.ack(msg);
      } catch (err) {
        console.error('[messageSearchIndexer] process error', err.message);
        try {
          await publishDlq(ch, msg, err);
        } catch (dlqErr) {
          console.error('[messageSearchIndexer] DLQ publish failed', dlqErr.message);
        }
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) => console.error('[messageSearchIndexer] conn error', err.message));
  console.log(
    `[messageSearchIndexer] listening ${MESSAGE_SEARCH_INDEXER_QUEUE} keys=${MESSAGE_SEARCH_BINDING_KEYS.join(',')}`
  );

  consumerHandle = { conn, ch, tag };
  return consumerHandle;
}

async function stopMessageSearchIndexer() {
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

module.exports = {
  startMessageSearchIndexer,
  stopMessageSearchIndexer,
  processMessageSearchEvent,
  indexMessageById,
};
