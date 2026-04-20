/**
 * Tải kết quả cho modal tìm kiếm tổng hợp Dashboard (lớp 3).
 */

import api from '../../services/api';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI } from '../../services/api/taskAPI';
import { meetingAPI } from '../../services/api/meetingAPI';
import friendService from '../../services/friendService';
import { fetchOrgMessageSearch } from '../search/orgChatSearchConfig';
import { DM_SCOPE, messageMatchesDmScope } from '../search/dmConversationSearch';
import {
  endOfMonth,
  mapMeetingToCalendarEvent,
  mapTaskToCalendarEvent,
  mergeAndSortCalendarEvents,
  startOfMonth,
  toDateKey,
} from '../../utils/calendarUtils';

const MAX_ITEMS = 40;

function unwrap(payload) {
  return payload?.data ?? payload;
}

function plainDm(msg) {
  if (!msg) return '';
  const mt = msg.messageType || 'text';
  if (mt === 'text') return String(msg.content || '');
  if (mt === 'file' || mt === 'image')
    return msg.fileMeta?.originalName || String(msg.content || '').slice(0, 200) || '[file]';
  return String(msg.content || '');
}

function filterByDetailQuery(items, q) {
  if (!q) return items;
  return items.filter((it) => {
    const hay = `${it.title || ''} ${it.subtitle || ''} ${it.meta || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function mapNotificationRaw(item, t) {
  const rawType = String(item?.type || 'system');
  const type =
    rawType === 'friend_request' || rawType === 'friend_accepted'
      ? 'friend'
      : rawType === 'task_assigned' || rawType === 'task_completed'
        ? 'task'
        : rawType === 'document'
          ? 'file'
          : rawType === 'message'
            ? 'mention'
            : rawType === 'org_join_application'
              ? 'system'
              : rawType;
  return {
    id: item?._id || item?.id,
    type,
    rawType,
    title: item?.title || t('notifications.defaultTitle'),
    message: item?.content || item?.message || '',
    read: Boolean(item?.isRead),
  };
}

function notificationMatchesFilter(mapped, subfilterId) {
  if (subfilterId === 'all') return true;
  if (subfilterId === 'unread') return !mapped.read;
  if (subfilterId === 'friend') return mapped.type === 'friend';
  return mapped.type === subfilterId;
}

function loadLocalCalendarRows() {
  try {
    const raw =
      localStorage.getItem('voicehub:calendar:localCustom') || localStorage.getItem('calendar:events');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e, i) => {
      const dateStr = e.date ? String(e.date) : toDateKey(new Date());
      const startAt = e.startAt
        ? new Date(e.startAt)
        : new Date(`${dateStr.includes('T') ? dateStr.split('T')[0] : dateStr}T12:00:00`);
      return {
        id: `local:${i}:${e.title || i}`,
        kind: 'local',
        source: 'local',
        title: e.title || 'Event',
        date: dateStr,
        time: e.time || '',
        type: 'local',
        startAt: Number.isNaN(startAt.getTime()) ? new Date() : startAt,
      };
    });
  } catch {
    return [];
  }
}

/**
 * @param {object} args
 * @param {string} args.pageId
 * @param {string} args.subfilterId
 * @param {string} [args.detailQuery]
 * @param {{ friendId?: string, orgId?: string }} [args.context]
 * @param {(k: string, vars?: object) => string} args.t
 * @returns {Promise<{ items: Array<{ id: string, title: string, subtitle?: string, meta?: string }>, truncated: boolean, error?: string }>}
 */
export async function fetchDashboardSearchResults({
  pageId,
  subfilterId,
  detailQuery = '',
  context = {},
  t,
}) {
  const friendId = context.friendId != null ? String(context.friendId) : '';
  const orgIdFromContext = context.orgId != null ? String(context.orgId) : '';
  const q = detailQuery.trim().toLowerCase();
  let items = [];
  let truncated = false;

  try {
    if (pageId === 'org' && subfilterId === 'list') {
      const orgPayload = await organizationAPI.getOrganizations();
      let orgList = [];
      const body = unwrap(orgPayload);
      if (Array.isArray(body)) orgList = body;
      else if (Array.isArray(body?.data)) orgList = body.data;
        items = orgList.slice(0, MAX_ITEMS).map((org) => {
        const id = String(org._id || org.id || '');
        return {
          id: `org:${id}`,
          title: org.name || org.displayName || t('orgPanel.orgFallback'),
          subtitle: org.description ? String(org.description).slice(0, 120) : '',
        };
      });
      if (orgList.length > MAX_ITEMS) truncated = true;
    } else if (pageId === 'friends') {
      if (subfilterId === 'contacts') {
        const fr = await friendService.getFriends();
        const inner = fr?.data ?? fr;
        const list = inner?.friends ?? inner?.data?.friends;
        const rows = Array.isArray(list) ? list : [];
        items = rows.slice(0, MAX_ITEMS).map((row, idx) => {
          const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : row;
          const name = u?.displayName || u?.username || t('common.user');
          const id = u?._id || u?.userId || row.id || `f${idx}`;
          return {
            id: `friend:${id}`,
            title: name,
            subtitle: u?.username ? `@${u.username}` : '',
          };
        });
        if (rows.length > MAX_ITEMS) truncated = true;
      } else {
        if (!friendId) {
          return {
            items: [],
            truncated: false,
            error: t('dashboard.globalSearch.needFriendContext'),
          };
        }
        const scopeMap = {
          dm_all: DM_SCOPE.ALL,
          dm_text: DM_SCOPE.TEXT,
          dm_file: DM_SCOPE.FILE,
          dm_image: DM_SCOPE.IMAGE,
          dm_link: DM_SCOPE.LINK,
          dm_calendar: DM_SCOPE.CALENDAR,
        };
        const scope = scopeMap[subfilterId] || DM_SCOPE.ALL;
        const resp = await api.get('/messages', {
          params: { receiverId: friendId, limit: 200, page: 1 },
        });
        const payload = resp?.data ?? resp;
        const result = payload?.data ?? payload;
        const rawList = result?.messages || result || [];
        const list = Array.isArray(rawList) ? rawList : [];
        const dmOnly = list.filter((m) => !m.roomId);
        const scoped = dmOnly.filter((m) => messageMatchesDmScope(m, scope));
        const sliced = scoped.slice(0, MAX_ITEMS);
        items = sliced.map((m, idx) => {
          const id = String(m._id || m.id || `m${idx}`);
          const preview = plainDm(m).slice(0, 160);
          const created = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
          return {
            id: `dm:${id}`,
            title: preview || t('friendChat.attachment'),
            subtitle: created,
          };
        });
        if (scoped.length > MAX_ITEMS) truncated = true;
      }
    } else if (pageId === 'chat') {
      const orgId = orgIdFromContext || null;
      if (!orgId) {
        return {
          items: [
            {
              id: 'no-org',
              title: t('dashboard.globalSearch.noOrgTitle'),
              subtitle: t('dashboard.globalSearch.noOrgSubtitle'),
            },
          ],
          truncated: false,
        };
      }
      if (subfilterId === 'recent') {
        const data = await fetchOrgMessageSearch([], detailQuery, {
          organizationId: orgId,
          page: 1,
          limit: MAX_ITEMS,
        });
        const msgs = data?.messages ?? data?.data?.messages ?? [];
        const list = Array.isArray(msgs) ? msgs : [];
        items = list.map((m, idx) => {
          const id = String(m._id || m.id || idx);
          const preview = plainDm(m).slice(0, 160);
          return {
            id: `orgmsg:${id}`,
            title: preview || '—',
            subtitle: m.channelId || m.roomId ? String(m.roomId || '') : '',
          };
        });
        if (list.length >= MAX_ITEMS) truncated = true;
      } else if (subfilterId === 'with_links') {
        const data = await fetchOrgMessageSearch([{ key: 'has', value: 'link', label: '' }], detailQuery, {
          organizationId: orgId,
          page: 1,
          limit: MAX_ITEMS,
        });
        const msgs = data?.messages ?? data?.data?.messages ?? [];
        const list = Array.isArray(msgs) ? msgs : [];
        items = list.map((m, idx) => {
          const id = String(m._id || m.id || idx);
          return {
            id: `orgmsg:${id}`,
            title: plainDm(m).slice(0, 160) || '—',
            subtitle: t('dashboard.globalSearch.hasLink'),
          };
        });
        if (list.length >= MAX_ITEMS) truncated = true;
      }
    } else if (pageId === 'tasks') {
      const filters = {};
      if (subfilterId !== 'all') {
        filters.priority = subfilterId;
      }
      if (detailQuery.trim()) filters.q = detailQuery.trim();
      const res = await taskAPI.getTasks(filters);
      const payload = unwrap(res);
      const inner = payload?.data !== undefined ? payload.data : payload;
      const taskList = inner?.tasks ?? (Array.isArray(inner) ? inner : []);
      const arr = Array.isArray(taskList) ? taskList : [];
      const sliced = arr.slice(0, MAX_ITEMS);
      items = sliced.map((task) => ({
        id: `task:${task._id}`,
        title: task.title || 'Task',
        subtitle: task.status ? String(task.status) : '',
        meta: task.priority ? String(task.priority) : '',
      }));
      if (arr.length > MAX_ITEMS) truncated = true;
      if (!detailQuery.trim()) {
        items = filterByDetailQuery(items, q);
      }
    } else if (pageId === 'calendar') {
      const now = new Date();
      const from = startOfMonth(now);
      const to = endOfMonth(now);
      const dueFrom = from.toISOString();
      const dueTo = to.toISOString();
      const [tRes, mRes] = await Promise.all([
        taskAPI.getTasks({ dueFrom, dueTo }).catch(() => null),
        meetingAPI.getMeetings({ startFrom: dueFrom, startTo: dueTo }).catch(() => null),
      ]);
      const mapped = [];
      const tp = tRes ? unwrap(tRes) : null;
      const tasks = tp?.tasks ?? tp?.data?.tasks ?? (Array.isArray(tp) ? tp : []);
      if (Array.isArray(tasks)) {
        for (const task of tasks) {
          const ev = mapTaskToCalendarEvent(task);
          if (ev) mapped.push(ev);
        }
      }
      const mp = mRes ? unwrap(mRes) : null;
      const meetings = mp?.meetings ?? mp?.data?.meetings ?? [];
      if (Array.isArray(meetings)) {
        for (const m of meetings) {
          const ev = mapMeetingToCalendarEvent(m);
          if (ev) mapped.push(ev);
        }
      }
      mapped.push(...loadLocalCalendarRows());
      let merged = mergeAndSortCalendarEvents(mapped);
      if (subfilterId === 'meeting') merged = merged.filter((e) => e.kind === 'meeting' || e.type === 'meeting');
      else if (subfilterId === 'deadline')
        merged = merged.filter((e) => e.kind === 'task' || e.type === 'deadline');
      else if (subfilterId === 'local')
        merged = merged.filter((e) => e.kind === 'local' || e.source === 'local');
      const sliced = merged.slice(0, MAX_ITEMS);
      items = sliced.map((e) => ({
        id: String(e.id),
        title: e.title || '—',
        subtitle: [e.date, e.time].filter(Boolean).join(' · '),
      }));
      if (merged.length > MAX_ITEMS) truncated = true;
      items = filterByDetailQuery(items, q);
    } else if (pageId === 'notifications') {
      const response = await api.get('/notifications', { params: { limit: 100 } });
      const payload = response?.data ?? response;
      const data = payload?.data ?? payload;
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      const mapped = list.map((raw) => mapNotificationRaw(raw, t)).filter((n) => notificationMatchesFilter(n, subfilterId));
      const sliced = mapped.slice(0, MAX_ITEMS);
      items = sliced.map((n) => ({
        id: `notif:${n.id}`,
        title: n.title,
        subtitle: n.message ? String(n.message).slice(0, 140) : '',
        meta: n.type,
      }));
      if (mapped.length > MAX_ITEMS) truncated = true;
      items = filterByDetailQuery(items, q);
    } else if (pageId === 'settings' && subfilterId === 'shortcuts') {
      items = [
        {
          id: 'settings-main',
          title: t('dashboard.globalSearch.settingsOpen'),
          subtitle: t('dashboard.globalSearch.settingsOpenSub'),
        },
      ];
      items = filterByDetailQuery(items, q);
    } else if (pageId === 'documents' && subfilterId === 'browse') {
      try {
        const docRes = await api.get('/documents', { params: { limit: MAX_ITEMS, q: detailQuery.trim() || undefined } });
        const d = unwrap(docRes);
        const files = d?.files ?? d?.data?.files ?? d?.documents ?? [];
        if (Array.isArray(files) && files.length > 0) {
          items = files.slice(0, MAX_ITEMS).map((f, i) => ({
            id: `doc:${f._id || f.id || i}`,
            title: f.name || f.title || '—',
            subtitle: f.size ? String(f.size) : '',
          }));
          if (files.length > MAX_ITEMS) truncated = true;
        } else {
          items = [
            {
              id: 'documents-cta',
              title: t('dashboard.globalSearch.documentsCtaTitle'),
              subtitle: t('dashboard.globalSearch.documentsCtaSub'),
            },
          ];
        }
      } catch {
        items = [
          {
            id: 'documents-cta',
            title: t('dashboard.globalSearch.documentsCtaTitle'),
            subtitle: t('dashboard.globalSearch.documentsCtaSub'),
          },
        ];
      }
      items = filterByDetailQuery(items, q);
    } else if (pageId === 'analytics' && subfilterId === 'overview') {
      items = [
        {
          id: 'analytics-open',
          title: t('dashboard.globalSearch.analyticsOpen'),
          subtitle: t('dashboard.globalSearch.analyticsOpenSub'),
        },
      ];
      items = filterByDetailQuery(items, q);
    }

    if (pageId !== 'tasks' && pageId !== 'notifications' && pageId !== 'calendar') {
      items = filterByDetailQuery(items, q);
    }

    return { items, truncated };
  } catch (e) {
    const msg = e?.response?.data?.message || e?.message || t('dashboard.globalSearch.loadError');
    return { items: [], truncated: false, error: msg };
  }
}

/**
 * Danh sách bạn cho bước chọn cuộc trò chuyện trong modal Dashboard.
 * @param {(k: string, vars?: object) => string} t
 */
export async function fetchDashboardFriendsForPicker(t) {
  const fr = await friendService.getFriends();
  const inner = fr?.data ?? fr;
  const list = inner?.friends ?? inner?.data?.friends;
  const rows = Array.isArray(list) ? list : [];
  return rows.map((row, idx) => {
    const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : row;
    const name = u?.displayName || u?.username || t('common.user');
    const id = String(u?._id || u?.userId || row.id || `f${idx}`);
    return {
      id,
      title: name,
      subtitle: u?.username ? `@${u.username}` : '',
    };
  });
}

/**
 * @param {(k: string, vars?: object) => string} t
 */
export async function fetchDashboardOrgsForPicker(t) {
  const orgPayload = await organizationAPI.getOrganizations().catch(() => null);
  let orgList = [];
  const body = unwrap(orgPayload);
  if (Array.isArray(body)) orgList = body;
  else if (Array.isArray(body?.data)) orgList = body.data;
  return orgList.map((org) => {
    const id = String(org._id || org.id || '');
    return {
      id,
      title: org.name || org.displayName || t('orgPanel.orgFallback'),
      subtitle: org.description ? String(org.description).slice(0, 120) : '',
    };
  });
}
