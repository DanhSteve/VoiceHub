/** Local calendar events liên quan DM (voicehub:calendar:localCustom) */

export const LOCAL_CUSTOM_KEY = 'voicehub:calendar:localCustom';
const LOCAL_STORAGE_LEGACY = 'calendar:events';

function migrateLegacyLocal() {
  try {
    const legacy = localStorage.getItem(LOCAL_STORAGE_LEGACY);
    if (!legacy) return;
    if (localStorage.getItem(LOCAL_CUSTOM_KEY)) return;
    localStorage.setItem(LOCAL_CUSTOM_KEY, legacy);
  } catch {
    /* ignore */
  }
}

export function loadAllLocalCalendarEvents() {
  migrateLegacyLocal();
  try {
    const raw =
      localStorage.getItem(LOCAL_CUSTOM_KEY) || localStorage.getItem(LOCAL_STORAGE_LEGACY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => ({
      ...e,
      kind: e.kind || 'local',
      source: 'local',
    }));
  } catch {
    return [];
  }
}

function eventMatchesFriend(event, friendId, friendName) {
  const fid = String(friendId || '');
  if (!fid) return false;
  if (event.friendId != null && String(event.friendId) === fid) return true;
  if (Array.isArray(event.friendIds) && event.friendIds.some((id) => String(id) === fid)) {
    return true;
  }
  const name = String(friendName || '').trim().toLowerCase();
  if (name && Array.isArray(event.attendeeNames)) {
    return event.attendeeNames.some((n) => String(n || '').trim().toLowerCase() === name);
  }
  return false;
}

function parseStartAt(event) {
  if (event.startAt) {
    const d = new Date(event.startAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const date = String(event.date || '').trim();
  const time = String(event.timeInput || event.time || '09:00').trim();
  if (!date) return null;
  try {
    const d = new Date(`${date}T${time}`);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Sự kiện local (reminder/meeting/deadline) gắn với bạn DM.
 * @param {string} friendId
 * @param {{ friendName?: string, types?: string[] }} options
 */
export function getDmCalendarEventsForFriend(friendId, options = {}) {
  const { friendName = '', types = null } = options;
  const list = loadAllLocalCalendarEvents().filter((e) => eventMatchesFriend(e, friendId, friendName));
  const filtered = types?.length ? list.filter((e) => types.includes(e.type)) : list;
  return filtered
    .map((e) => ({ ...e, _startAt: parseStartAt(e) }))
    .sort((a, b) => {
      const ta = a._startAt?.getTime() ?? 0;
      const tb = b._startAt?.getTime() ?? 0;
      return ta - tb;
    });
}

export function getDmRemindersForFriend(friendId, friendName) {
  return getDmCalendarEventsForFriend(friendId, { friendName, types: ['reminder'] });
}

export function formatDmEventWhen(event, localeTag = 'vi-VN') {
  const at = parseStartAt(event);
  if (!at) {
    const date = event.date || '';
    const time = event.time || '';
    return [date, time].filter(Boolean).join(' ');
  }
  return at.toLocaleString(localeTag === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
