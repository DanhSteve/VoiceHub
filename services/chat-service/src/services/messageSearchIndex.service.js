const { ensureOrgMessagesIndex } = require('./meilisearchClient');
const { buildMessageSearchDocument } = require('../search/messageSearchDocument');

async function upsertOrgMessageDocument(doc) {
  const index = await ensureOrgMessagesIndex();
  const payload = buildMessageSearchDocument(doc);
  await index.addDocuments([payload], { primaryKey: 'messageId' });
  return payload;
}

async function deleteOrgMessageDocument(messageId) {
  const index = await ensureOrgMessagesIndex();
  const id = String(messageId || '').trim();
  if (!id) return;
  try {
    await index.deleteDocument(id);
  } catch (err) {
    if (err?.code !== 'document_not_found') throw err;
  }
}

async function deleteOrgMessagesByOrganization(organizationId) {
  const index = await ensureOrgMessagesIndex();
  const org = String(organizationId || '').trim();
  if (!org) return;
  await index.deleteDocuments({ filter: `organizationId = "${org.replace(/"/g, '\\"')}"` });
}

module.exports = {
  upsertOrgMessageDocument,
  deleteOrgMessageDocument,
  deleteOrgMessagesByOrganization,
};
