import { formatMessagePreview } from '../features/search/formatMessagePreview';

/**
 * ID đối tác DM từ một tin (không room).
 */
export function partnerIdFromDmMessage(message, myId) {
  if (!message?.receiverId || message.roomId) return null;
  const my = String(myId || '');
  const s = String(message.senderId?._id || message.senderId || '');
  const r = String(message.receiverId?._id || message.receiverId || '');
  if (s === my) return r || null;
  if (r === my) return s || null;
  return null;
}

export function messageTimestamp(message) {
  if (!message?.createdAt) return Date.now();
  const t = new Date(message.createdAt).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

export function snippetFromMessage(message, myId, t) {
  const partner = partnerIdFromDmMessage(message, myId);
  if (!partner) return null;
  const at = messageTimestamp(message);
  const s = String(message.senderId?._id || message.senderId || '');
  const isMine = s === String(myId || '');
  const preview = formatMessagePreview(message, t);
  return { friendId: String(partner), at, preview, isMine };
}

/**
 * Gộp snippet mới nếu tin mới hơn.
 */
export function mergeDmSnippetMap(prev, message, myId, t) {
  const next = snippetFromMessage(message, myId, t);
  if (!next) return prev;
  const key = next.friendId;
  const existing = prev[key];
  if (existing && existing.at > next.at) return prev;
  return { ...prev, [key]: { at: next.at, preview: next.preview, isMine: next.isMine } };
}

/**
 * Build map từ danh sách tin (API history).
 */
export function buildDmSnippetMapFromMessages(messages, myId, t) {
  const map = {};
  for (const m of messages || []) {
    const next = snippetFromMessage(m, myId, t);
    if (!next) continue;
    const key = next.friendId;
    if (!map[key] || next.at > map[key].at) {
      map[key] = { at: next.at, preview: next.preview, isMine: next.isMine };
    }
  }
  return map;
}

function activityAt(lastDmByFriendId, friendId) {
  return lastDmByFriendId[String(friendId)]?.at || 0;
}

/**
 * Ghim trước, mỗi nhóm sort theo thời gian tin gần nhất.
 */
export function sortFriendsForDmRail(rows, lastDmByFriendId, pinnedFriendIds = []) {
  const pinSet = new Set((pinnedFriendIds || []).map(String));
  const pinned = [];
  const rest = [];
  for (const row of rows) {
    if (pinSet.has(String(row.id))) pinned.push(row);
    else rest.push(row);
  }
  const byTime = (a, b) => activityAt(lastDmByFriendId, b.id) - activityAt(lastDmByFriendId, a.id);
  pinned.sort(byTime);
  rest.sort(byTime);
  return [...pinned, ...rest];
}

/**
 * Hiển thị giờ rail kiểu Zalo.
 */
export function formatRailTime(isoOrMs, locale, t) {
  if (!isoOrMs) return '';
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  if (Number.isNaN(d.getTime())) return '';

  const loc = locale === 'en' ? 'en-US' : 'vi-VN';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const t0 = startOf(d);
  const now = new Date();
  const today0 = startOf(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday0 = startOf(y);

  if (t0 === today0) {
    return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }
  if (t0 === yesterday0) {
    return t?.('friendChat.railTimeYesterday') || 'Hôm qua';
  }
  return d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
}
