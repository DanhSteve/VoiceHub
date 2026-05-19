/** Gộp danh sách tin, dedupe theo id. */
export function mergeMessagesById(existing, incoming) {
  const map = new Map();
  for (const m of existing || []) {
    const id = m?._id || m?.id;
    if (id) map.set(String(id), m);
  }
  for (const m of incoming || []) {
    const id = m?._id || m?.id;
    if (id) map.set(String(id), m);
  }
  return [...map.values()];
}

/** Thay optimistic temp bằng tin server (khớp content + reply). */
export function replaceOptimisticWithServer(prev, serverMsg, tempId) {
  const sid = serverMsg?._id || serverMsg?.id;
  if (!sid) return prev;

  const withoutDup = prev.filter((x) => {
    const xid = x._id || x.id;
    if (String(xid) === String(sid)) return false;
    if (tempId && String(xid) === String(tempId)) return false;
    if (x._optimistic && x._sendStatus !== 'failed') {
      const sameText = String(x.content || '') === String(serverMsg.content || '');
      const sameReply =
        String(x.replyToMessageId || '') === String(serverMsg.replyToMessageId || '');
      if (sameText && sameReply) return false;
    }
    return true;
  });

  return [...withoutDup, { ...serverMsg, _sendStatus: 'sent' }];
}

export function messageIdOf(m) {
  return m?._id || m?.id || null;
}

export function isOutgoing(m, myId) {
  if (!m || !myId) return false;
  const sid = String(m.senderId?._id || m.senderId || '');
  return sid === String(myId);
}
