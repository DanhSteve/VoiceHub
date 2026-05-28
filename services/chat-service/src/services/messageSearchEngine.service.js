const { mongo, unwrapPlaintext } = require('/shared');
const { mongoose } = mongo;
const Message = require('../models/Message');
const { toClientMessage } = require('../utils/messageDto');
const { decodePageToken, encodePageToken } = require('/shared/pagination/pageToken');
const {
  ensureOrgMessagesIndex,
  pingMeilisearch,
  isMeilisearchSearchEnabled,
} = require('./meilisearchClient');

function quoteFilterValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildRoomFilter(roomId, allowedRoomIds) {
  if (roomId) return `roomId = ${quoteFilterValue(roomId)}`;
  const ids = (allowedRoomIds || []).map(String).filter(Boolean);
  if (ids.length === 0) return null;
  if (ids.length === 1) return `roomId = ${quoteFilterValue(ids[0])}`;
  const list = ids.map((id) => quoteFilterValue(id)).join(', ');
  return `roomId IN [${list}]`;
}

function buildMeiliFilter(params) {
  const {
    organizationId,
    allowedRoomIds,
    roomId,
    senderId,
    createdAfter,
    createdBefore,
    hasAttachment,
    messageType,
    pageToken,
  } = params;

  const parts = [
    `organizationId = ${quoteFilterValue(organizationId)}`,
    'isDeleted = false',
    'isRecalled = false',
  ];

  const roomPart = buildRoomFilter(roomId, allowedRoomIds);
  if (!roomPart) return null;
  parts.push(roomPart);

  if (senderId) parts.push(`senderId = ${quoteFilterValue(senderId)}`);
  if (messageType) parts.push(`messageType = ${quoteFilterValue(messageType)}`);

  const wantAttach =
    hasAttachment === true || hasAttachment === 'true' || hasAttachment === '1';
  if (wantAttach) parts.push('hasAttachment = true');

  if (createdAfter) {
    const t = new Date(createdAfter).getTime();
    if (!Number.isNaN(t)) parts.push(`createdAt >= ${t}`);
  }
  if (createdBefore) {
    const t = new Date(createdBefore).getTime();
    if (!Number.isNaN(t)) parts.push(`createdAt <= ${t}`);
  }

  const tok = decodePageToken(pageToken);
  if (tok) {
    const t = tok.createdAt.getTime();
    const id = quoteFilterValue(tok.id);
    parts.push(`(createdAt < ${t} OR (createdAt = ${t} AND messageId < ${id}))`);
  }

  return parts.join(' AND ');
}

function postFilterSearchMessages(messages, { qTrim, mentionTrim, hasLink, hasEmbed }) {
  const needLink = hasLink === true || hasLink === 'true' || hasLink === '1';
  const needEmbed = hasEmbed === true || hasEmbed === 'true' || hasEmbed === '1';
  return messages.filter((m) => {
    const text = String(unwrapPlaintext(m.content) || '');
    const low = text.toLowerCase();
    if (qTrim && !low.includes(String(qTrim).toLowerCase())) return false;
    if (mentionTrim && !text.includes(mentionTrim)) return false;
    if (needLink && !/https?:\/\//i.test(text)) return false;
    if (needEmbed && !/<iframe|discord\.com\/channels|embed/i.test(text)) return false;
    return true;
  });
}

async function hydrateMessagesFromMongo(messageIds, dtoOpts) {
  if (!messageIds.length) return [];
  const oids = messageIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  const docs = await Message.find({ _id: { $in: oids } }).exec();
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  const ordered = [];
  for (const id of messageIds) {
    const doc = byId.get(String(id));
    if (doc) ordered.push(toClientMessage(doc, dtoOpts));
  }
  return ordered;
}

function nextPageTokenFromHits(hits, { hasMore }) {
  if (!hasMore || !hits?.length) return null;
  const last = hits[hits.length - 1];
  const id = last?.messageId;
  const createdAt = last?.createdAt != null ? new Date(last.createdAt) : null;
  if (!id || !createdAt || Number.isNaN(createdAt.getTime())) return null;
  return encodePageToken({ createdAt, id });
}

async function searchOrgMessagesViaMeili(params) {
  const {
    organizationId,
    allowedRoomIds,
    roomId,
    senderId,
    q,
    createdAfter,
    createdBefore,
    hasAttachment,
    hasLink,
    hasEmbed,
    messageType,
    mentionText,
    limit = 20,
    pageToken,
    fields = 'summary',
  } = params;

  const filter = buildMeiliFilter({
    organizationId,
    allowedRoomIds,
    roomId,
    senderId,
    createdAfter,
    createdBefore,
    hasAttachment,
    messageType,
    pageToken,
  });
  if (!filter) {
    return { messages: [], nextPageToken: null, hasMore: false, engine: 'meilisearch' };
  }

  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const qTrim = q && String(q).trim();
  const mentionTrim = mentionText && String(mentionText).trim();
  const searchQuery = [qTrim, mentionTrim].filter(Boolean).join(' ').trim();

  const index = await ensureOrgMessagesIndex();
  const result = await index.search(searchQuery, {
    filter,
    limit: lim + 1,
    sort: ['createdAt:desc', 'messageId:desc'],
  });

  const hits = Array.isArray(result.hits) ? result.hits : [];
  const hasMore = hits.length > lim;
  const slice = hasMore ? hits.slice(0, lim) : hits;
  const ids = slice.map((h) => String(h.messageId || '')).filter(Boolean);

  const dtoOpts = { fields: fields === 'full' ? 'full' : 'summary' };
  let messages = await hydrateMessagesFromMongo(ids, dtoOpts);
  messages = postFilterSearchMessages(messages, { qTrim, mentionTrim, hasLink, hasEmbed });

  return {
    messages,
    total: result.estimatedTotalHits ?? result.totalHits ?? null,
    currentPage: null,
    totalPages: null,
    hasMore: hasMore && messages.length > 0,
    nextPageToken: nextPageTokenFromHits(slice, { hasMore }),
    engine: 'meilisearch',
  };
}

async function isMeiliSearchReady() {
  if (!isMeilisearchSearchEnabled()) return false;
  const ping = await pingMeilisearch();
  return Boolean(ping.ok);
}

module.exports = {
  searchOrgMessagesViaMeili,
  isMeiliSearchReady,
  buildMeiliFilter,
};
