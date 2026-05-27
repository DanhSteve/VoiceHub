import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchToolbar, SearchFilterChips } from '../search';
import { useNotificationsInfinite } from '../../hooks/queries';
import { getToken } from '../../utils/tokenStorage';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

function parseNotificationDataField(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Thông báo tổ chức trong khung giữa workspace — danh sách trái, chi tiết phải.
 */
export default function OrganizationNotificationsWorkspacePanel({
  organizationId,
  organizationSlug = '',
  isDarkMode,
  fetchEnabled = true,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const hasToken = Boolean(getToken());
  const [filter, setFilter] = useState('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const notifInfiniteQuery = useNotificationsInfinite({
    scope: 'organization',
    organizationId,
    enabled:
      fetchEnabled &&
      !authLoading &&
      isAuthenticated &&
      hasToken &&
      Boolean(organizationId),
  });

  const getRelativeTime = (input) => {
    if (!input) return t('time.justNow');
    const target = new Date(input).getTime();
    if (!Number.isFinite(target)) return t('time.justNow');
    const diffMinutes = Math.max(1, Math.floor((Date.now() - target) / 60000));
    if (diffMinutes < 60) return t('time.minutesAgo', { n: diffMinutes });
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t('time.daysAgo', { n: diffDays });
  };

  const iconByType = {
    task: '✅',
    task_assigned: '✅',
    task_completed: '✅',
    mention: '💬',
    message: '💬',
    deadline: '⏰',
    meeting: '📅',
    file: '📁',
    document: '📁',
    friend: '👥',
    system: '🔔',
    org_join_application: '🏢',
  };

  const toViewNotification = useCallback(
    (item) => {
      const data = parseNotificationDataField(item?.data);
      const id = item?._id || item?.id;
      const rawType = String(item?.type || 'system');
      const type =
        rawType === 'task_assigned' || rawType === 'task_completed'
          ? 'task'
          : rawType === 'document'
            ? 'file'
            : rawType === 'message'
              ? 'mention'
              : rawType;
      return {
        id,
        type,
        rawType,
        icon: iconByType[rawType] || iconByType[type] || '🔔',
        title: item?.title || t('notifications.defaultTitle'),
        message: item?.content || item?.message || '',
        time: getRelativeTime(item?.createdAt),
        read: Boolean(item?.isRead),
        createdAt: item?.createdAt,
        organizationSlug:
          data?.workspaceSlug || data?.organizationSlug || organizationSlug || '',
        organizationId:
          data?.workspaceId || data?.organizationId || organizationId || '',
        data,
      };
    },
    [t, organizationId, organizationSlug]
  );

  useEffect(() => {
    const pages = notifInfiniteQuery.data?.pages || [];
    const list = pages.flatMap((p) => (Array.isArray(p?.notifications) ? p.notifications : []));
    setNotifications(list.map(toViewNotification));
  }, [notifInfiniteQuery.data, toViewNotification]);

  const notifFilterOptions = useMemo(
    () => [
      { id: 'all', label: t('notifications.filterAll'), icon: '📋' },
      { id: 'unread', label: t('notifications.filterUnread'), icon: '⭐' },
      { id: 'task', label: t('notifications.filterTasks'), icon: '✅' },
      { id: 'mention', label: t('common.mentions'), icon: '💬' },
    ],
    [t]
  );

  const filteredNotifications = useMemo(() => {
    let list =
      filter === 'all'
        ? notifications
        : filter === 'unread'
          ? notifications.filter((n) => !n.read)
          : notifications.filter((n) => n.type === filter);
    const q = notifSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) =>
      `${n.title || ''} ${n.message || ''} ${n.type || ''}`.toLowerCase().includes(q)
    );
  }, [notifications, filter, notifSearch]);

  const selected = useMemo(
    () => filteredNotifications.find((n) => n.id === selectedId) || null,
    [filteredNotifications, selectedId]
  );

  const muted = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const title = isDarkMode ? 'text-white' : 'text-slate-900';
  const listBorder = isDarkMode ? 'border-white/[0.06]' : 'border-slate-200/80';
  const listItemActive = isDarkMode
    ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
    : 'bg-cyan-50 border-cyan-300 text-slate-900';
  const listItemIdle = isDarkMode
    ? 'border-transparent hover:bg-white/[0.05] text-slate-200'
    : 'border-transparent hover:bg-slate-50 text-slate-800';

  const handleMarkAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('notifications.markReadErr'));
    }
  };

  const handleOpenTarget = (notif) => {
    if (!notif) return;
    if (!notif.read) handleMarkAsRead(notif.id);

    const slug = notif.organizationSlug || organizationSlug;
    const orgId = notif.organizationId || organizationId;
    const workspacePath = slug ? `/w/${encodeURIComponent(slug)}` : orgId ? `/w/${encodeURIComponent(orgId)}` : '/workspaces';

    switch (notif.type) {
      case 'mention':
        navigate(workspacePath);
        break;
      case 'task':
        navigate(`${workspacePath}?tab=tasks`);
        break;
      case 'file':
        navigate(`${workspacePath}?tab=documents`);
        break;
      default:
        navigate(workspacePath);
        break;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      <div className="mb-3">
        <h3 className={`text-sm font-semibold ${title}`}>{t('notifications.titleOrganization')}</h3>
        <p className={`text-[11px] ${muted}`}>{t('notifications.scopeOrganizationHint')}</p>
      </div>

      <PageSearchToolbar
        className="mb-3"
        value={notifSearch}
        onChange={setNotifSearch}
        placeholder={t('notifications.searchPlaceholder')}
        isDarkMode={isDarkMode}
        id="workspace-org-notifications-search"
        aria-label={t('searchUi.searchAria')}
      >
        <SearchFilterChips
          aria-label={t('notifications.filtersAria')}
          options={notifFilterOptions}
          value={filter}
          onChange={setFilter}
          isDarkMode={isDarkMode}
          size="sm"
        />
      </PageSearchToolbar>

      <div className={`flex min-h-0 flex-1 overflow-hidden rounded-xl border ${listBorder}`}>
        <div
          className={`flex w-[min(100%,300px)] shrink-0 flex-col border-r ${listBorder} ${
            isDarkMode ? 'bg-[#0f1219]' : 'bg-slate-50/80'
          }`}
        >
          <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto p-2">
            {!fetchEnabled ? (
              <p className={`py-8 text-center text-xs ${muted}`}>{t('notifications.loading')}</p>
            ) : notifInfiniteQuery.isLoading && notifications.length === 0 ? (
              <p className={`py-8 text-center text-xs ${muted}`}>{t('notifications.loading')}</p>
            ) : filteredNotifications.length === 0 ? (
              <p className={`py-8 text-center text-xs ${muted}`}>{t('notifications.emptyOrg')}</p>
            ) : (
              <ul className="space-y-1">
                {filteredNotifications.map((notif) => {
                  const active = selectedId === notif.id;
                  return (
                    <li key={notif.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(notif.id)}
                        className={`flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition ${
                          active ? listItemActive : listItemIdle
                        }`}
                      >
                        <span className="text-lg leading-none" aria-hidden>
                          {notif.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`flex items-center gap-1.5 truncate text-xs font-semibold ${title}`}>
                            {notif.title}
                            {!notif.read ? (
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden />
                            ) : null}
                          </span>
                          <span className={`line-clamp-2 text-[10px] ${muted}`}>{notif.message}</span>
                          <span className={`mt-0.5 block text-[10px] ${muted}`}>{notif.time}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className={`min-w-0 flex-1 overflow-y-auto p-4 ${isDarkMode ? 'bg-[#11141C]' : 'bg-white'}`}>
          {!selected ? (
            <div className={`flex h-full flex-col items-center justify-center text-center ${muted}`}>
              <span className="mb-3 text-4xl opacity-50" aria-hidden>
                🔔
              </span>
              <p className="text-sm font-medium">{t('notifications.orgPickHint')}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-lg">
              <div className="mb-3 flex items-start gap-3">
                <span className="text-3xl" aria-hidden>
                  {selected.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className={`text-base font-bold ${title}`}>{selected.title}</h4>
                  <p className={`mt-1 text-xs ${muted}`}>{selected.time}</p>
                </div>
                {!selected.read ? (
                  <span className="rounded-full bg-cyan-600/20 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                    {t('common.newBadge')}
                  </span>
                ) : null}
              </div>
              <p className={`mb-4 text-sm leading-relaxed ${isDarkMode ? 'text-[#c4c9d4]' : 'text-slate-700'}`}>
                {selected.message || '—'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenTarget(selected)}
                  className="rounded-lg bg-[#5865F2] px-4 py-2 text-xs font-semibold text-white hover:brightness-110"
                >
                  {t('notifications.actionOpen')}
                </button>
                {!selected.read ? (
                  <button
                    type="button"
                    onClick={() => handleMarkAsRead(selected.id)}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold ${
                      isDarkMode
                        ? 'border-slate-600 text-slate-200 hover:bg-white/5'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t('notifications.markRead')}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
