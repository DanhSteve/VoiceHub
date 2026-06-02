const MEILI_HOST = String(process.env.MEILI_HOST || '').trim().replace(/\/+$/, '');
if (!MEILI_HOST) throw new Error('Thiếu biến môi trường: MEILI_HOST');
const { MeiliSearch } = require('meilisearch');

let client = null;
let indexReady = false;

function getMeiliHost() {
  return process.env.MEILI_HOST;
}

function getMeiliApiKey() {
  return String(process.env.MEILI_MASTER_KEY || process.env.MEILI_API_KEY || '').trim();
}

function getOrgMessagesIndexUid() {
  return String(process.env.MEILI_ORG_MESSAGES_INDEX || 'org_messages').trim() || 'org_messages';
}

function getMeiliClient() {
  if (client) return client;
  const host = getMeiliHost();
  const apiKey = getMeiliApiKey();
  client = new MeiliSearch({ host, apiKey: apiKey || undefined });
  return client;
}

function isMeilisearchConfigured() {
  return Boolean(getMeiliHost());
}

function isMeilisearchSearchEnabled() {
  const raw = String(process.env.MESSAGE_SEARCH_ENGINE || 'auto').toLowerCase();
  if (raw === 'off' || raw === 'mongo' || raw === 'false' || raw === '0') return false;
  if (raw === 'meilisearch' || raw === 'meili' || raw === 'true' || raw === '1') {
    return isMeilisearchConfigured();
  }
  return isMeilisearchConfigured();
}

async function ensureOrgMessagesIndex() {
  if (indexReady) return getMeiliClient().index(getOrgMessagesIndexUid());
  const meili = getMeiliClient();
  const uid = getOrgMessagesIndexUid();
  try {
    await meili.getIndex(uid);
  } catch {
    await meili.createIndex(uid, { primaryKey: 'messageId' });
  }
  const index = meili.index(uid);
  await index.updateSettings({
    searchableAttributes: ['content', 'senderDisplayName', 'attachmentNames'],
    filterableAttributes: [
      'organizationId',
      'roomId',
      'senderId',
      'messageType',
      'hasAttachment',
      'isDeleted',
      'isRecalled',
      'createdAt',
    ],
    sortableAttributes: ['createdAt', 'messageId'],
  });
  indexReady = true;
  return index;
}

async function pingMeilisearch() {
  if (!isMeilisearchConfigured()) return { ok: false, error: 'MEILI_HOST is empty' };
  try {
    const meili = getMeiliClient();
    await meili.health();
    return { ok: true, host: getMeiliHost() };
  } catch (err) {
    return { ok: false, host: getMeiliHost(), error: err?.message || String(err) };
  }
}

module.exports = {
  getMeiliClient,
  getMeiliHost,
  getOrgMessagesIndexUid,
  ensureOrgMessagesIndex,
  isMeilisearchConfigured,
  isMeilisearchSearchEnabled,
  pingMeilisearch,
};
