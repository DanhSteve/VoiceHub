const { unwrapPlaintext } = require('/shared');

function slimFileMeta(fileMeta) {
  if (!fileMeta || typeof fileMeta !== 'object') return undefined;
  const out = {};
  if (fileMeta.originalName) out.originalName = fileMeta.originalName;
  if (fileMeta.mimeType) out.mimeType = fileMeta.mimeType;
  if (fileMeta.byteSize != null) out.byteSize = fileMeta.byteSize;
  if (fileMeta.storagePath) out.storagePath = fileMeta.storagePath;
  return Object.keys(out).length ? out : undefined;
}

/**
 * @param {object} doc - mongoose doc or plain
 * @param {{ fields?: 'summary'|'full' }} opts
 */
function toClientMessage(doc, opts = {}) {
  if (!doc) return null;
  const fields = opts.fields === 'full' ? 'full' : 'summary';
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.content = unwrapPlaintext(o.content);
  if (o.originalContent) o.originalContent = unwrapPlaintext(o.originalContent);

  const senderId = String(o.senderId?._id || o.senderId || '');
  if (fields === 'full') {
    return { ...o, senderId };
  }

  const summary = {
    _id: o._id,
    id: o._id,
    senderId,
    senderDisplayName: String(o.senderDisplayName || '').trim(),
    content: o.content,
    messageType: o.messageType || 'text',
    roomId: o.roomId,
    organizationId: o.organizationId,
    receiverId: o.receiverId,
    conversationId: o.conversationId,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    isRead: o.isRead,
    readAt: o.readAt,
    replyToMessageId: o.replyToMessageId,
    isDeleted: o.isDeleted,
    isRecalled: o.isRecalled,
    editedAt: o.editedAt,
    reactions: Array.isArray(o.reactions)
      ? o.reactions.map((r) => ({
          emoji: r.emoji,
          userId: String(r.userId?._id || r.userId || ''),
          createdAt: r.createdAt,
        }))
      : [],
  };
  const fm = slimFileMeta(o.fileMeta);
  if (fm) summary.fileMeta = fm;
  if (o.signedReadUrl) summary.signedReadUrl = o.signedReadUrl;
  return summary;
}

module.exports = { toClientMessage, slimFileMeta };
