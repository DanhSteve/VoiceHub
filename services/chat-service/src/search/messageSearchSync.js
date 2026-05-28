const { MESSAGE_SEARCH_EVENT_TYPES } = require('/shared/messaging/messageSearchEvents');
const { publishMessageSearchEvent } = require('../messaging/messageSearch.publisher');
const { isOrgIndexableMessage } = require('./messageSearchDocument');
const {
  upsertOrgMessageDocument,
  deleteOrgMessageDocument,
} = require('../services/messageSearchIndex.service');
const { isMeilisearchSearchEnabled } = require('../services/meilisearchClient');

function logSyncWarn(err) {
  // eslint-disable-next-line no-console
  console.warn('[messageSearchSync]', err?.message || err);
}

/**
 * Đồng bộ index sau mutation (publish queue + optional inline upsert khi bật sync).
 * @param {'message.created'|'message.updated'|'message.deleted'} type
 * @param {object} doc - mongoose doc hoặc plain message
 */
async function syncOrgMessageSearchIndex(type, doc) {
  if (!doc) return;
  const messageId = String(doc._id || doc.id || '');
  if (!messageId) return;

  const organizationId = doc.organizationId ? String(doc.organizationId) : undefined;

  publishMessageSearchEvent(type, { messageId, organizationId }).catch(logSyncWarn);

  const inline = String(process.env.MESSAGE_SEARCH_INLINE_SYNC || 'false').toLowerCase();
  if (inline !== 'true' && inline !== '1') return;
  if (!isMeilisearchSearchEnabled()) return;

  try {
    if (type === MESSAGE_SEARCH_EVENT_TYPES.DELETED || doc.isDeleted || doc.isRecalled) {
      await deleteOrgMessageDocument(messageId);
      return;
    }
    if (!isOrgIndexableMessage(doc)) {
      await deleteOrgMessageDocument(messageId);
      return;
    }
    await upsertOrgMessageDocument(doc);
  } catch (err) {
    logSyncWarn(err);
  }
}

function syncAfterCreate(doc) {
  return syncOrgMessageSearchIndex(MESSAGE_SEARCH_EVENT_TYPES.CREATED, doc);
}

function syncAfterUpdate(doc) {
  return syncOrgMessageSearchIndex(MESSAGE_SEARCH_EVENT_TYPES.UPDATED, doc);
}

function syncAfterDelete(doc) {
  return syncOrgMessageSearchIndex(MESSAGE_SEARCH_EVENT_TYPES.DELETED, doc);
}

module.exports = {
  syncOrgMessageSearchIndex,
  syncAfterCreate,
  syncAfterUpdate,
  syncAfterDelete,
};
