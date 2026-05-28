const { unwrapPlaintext } = require('/shared');

function hasMessageAttachment(doc) {
  const mt = String(doc?.messageType || '');
  if (mt === 'file' || mt === 'image') return true;
  const sp = doc?.fileMeta?.storagePath;
  return Boolean(sp && String(sp).trim());
}

function attachmentNamesFromDoc(doc) {
  const names = [];
  const n = doc?.fileMeta?.originalName;
  if (n && String(n).trim()) names.push(String(n).trim());
  return names;
}

function isOrgIndexableMessage(doc) {
  if (!doc) return false;
  const orgId = doc.organizationId;
  const roomId = doc.roomId;
  return Boolean(orgId && roomId);
}

/**
 * Meilisearch document (primary key `messageId`).
 * @param {import('mongoose').Document|object} doc
 */
function buildMessageSearchDocument(doc) {
  const o = doc.toObject ? doc.toObject() : { ...doc };
  const messageId = String(o._id || o.id || '');
  const content = String(unwrapPlaintext(o.content) || '').trim();
  const createdAt = o.createdAt ? new Date(o.createdAt).getTime() : Date.now();

  return {
    messageId,
    organizationId: String(o.organizationId || ''),
    roomId: String(o.roomId || ''),
    senderId: String(o.senderId?._id || o.senderId || ''),
    senderDisplayName: String(o.senderDisplayName || '').trim(),
    content,
    messageType: String(o.messageType || 'text'),
    hasAttachment: hasMessageAttachment(o),
    attachmentNames: attachmentNamesFromDoc(o),
    createdAt,
    isDeleted: Boolean(o.isDeleted),
    isRecalled: Boolean(o.isRecalled),
  };
}

module.exports = {
  buildMessageSearchDocument,
  isOrgIndexableMessage,
  hasMessageAttachment,
};
