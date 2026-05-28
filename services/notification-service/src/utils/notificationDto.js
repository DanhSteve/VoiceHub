const { unwrapPlaintext } = require('/shared');

function toClientNotification(doc, opts = {}) {
  if (!doc) return null;
  const fields = opts.fields === 'full' ? 'full' : 'summary';
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.title = unwrapPlaintext(o.title);
  o.content = unwrapPlaintext(o.content);
  if (o.actionUrl) o.actionUrl = unwrapPlaintext(o.actionUrl);

  if (fields === 'full') return o;

  return {
    _id: o._id,
    id: o._id,
    userId: o.userId,
    type: o.type,
    title: o.title,
    content: o.content,
    isRead: o.isRead,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    data: o.data,
    actionUrl: o.actionUrl,
  };
}

module.exports = { toClientNotification };
