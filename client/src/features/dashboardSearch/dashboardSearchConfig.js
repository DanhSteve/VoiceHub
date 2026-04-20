/**
 * Cấu hình tìm kiếm tổng hợp Dashboard — lớp 1 (trang) + id lớp 2 (subfilter).
 * Label hiển thị lấy qua i18n: dashboard.globalSearch.*
 */

/** @typedef {'org'|'friends'|'chat'|'tasks'|'calendar'|'notifications'} DashboardPageId */

export const DASHBOARD_PAGE_IDS = [
  'org',
  'friends',
  'chat',
  'tasks',
  'calendar',
  'notifications',
];

/** Khớp thanh điều hướng nhanh hiện tại */
export const DASHBOARD_PAGE_PATHS = {
  org: '/organizations',
  friends: '/friends',
  chat: '/chat/organization',
  tasks: '/tasks',
  calendar: '/calendar',
  notifications: '/notifications',
};

/** DM trong hội thoại 1 bạn (sau bước chọn bạn) */
export const DASHBOARD_FRIEND_DM_SUBFILTERS = [
  'dm_all',
  'dm_text',
  'dm_file',
  'dm_image',
  'dm_link',
  'dm_calendar',
];

/** Danh sách id subfilter theo từng trang (khóa i18n: dashboard.globalSearch.subfilter.{pageId}.{id}) */
export const DASHBOARD_SUBFILTERS = {
  org: ['list'],
  /** `contacts` = chỉ danh sách bạn; các dm_* dùng sau khi đã chọn 1 bạn (xem DASHBOARD_FRIEND_DM_SUBFILTERS) */
  friends: ['contacts', 'dm_all', 'dm_text', 'dm_file', 'dm_image', 'dm_link', 'dm_calendar'],
  chat: ['recent', 'with_links'],
  tasks: ['all', 'urgent', 'high', 'medium', 'low'],
  calendar: ['all', 'meeting', 'deadline', 'local'],
  notifications: ['all', 'unread', 'task', 'mention', 'deadline', 'meeting', 'friend'],
};

/**
 * @param {(key: string) => string} t
 * @param {string} [filterLayer1Query] — lọc theo chữ trên lớp 1
 */
export function buildDashboardPageOptions(t, filterLayer1Query = '') {
  const q = filterLayer1Query.trim().toLowerCase();
  return DASHBOARD_PAGE_IDS.map((id) => {
    const label = t(`dashboard.globalSearch.pageLabel.${id}`);
    const path = DASHBOARD_PAGE_PATHS[id];
    return { id, label, path };
  }).filter((row) => {
    if (!q) return true;
    return (
      row.label.toLowerCase().includes(q) ||
      row.id.includes(q) ||
      String(row.path).toLowerCase().includes(q)
    );
  });
}

/**
 * @param {string} pageId
 * @param {(key: string) => string} t
 * @param {{ friendsConversationOnly?: boolean }} [opts] — sau khi đã chọn bạn: chỉ dm_*
 */
export function buildSubfilterOptions(pageId, t, opts = {}) {
  let ids = DASHBOARD_SUBFILTERS[pageId];
  if (!Array.isArray(ids)) return [];
  if (pageId === 'friends' && opts.friendsConversationOnly) {
    ids = DASHBOARD_FRIEND_DM_SUBFILTERS;
  }
  return ids.map((subId) => ({
    id: subId,
    label:
      pageId === 'friends'
        ? t(`dashboard.globalSearch.subfilter.friends.${subId}`)
        : t(`dashboard.globalSearch.subfilter.${pageId}.${subId}`),
  }));
}
