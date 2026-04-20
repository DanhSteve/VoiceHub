import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { ConfirmDialog, GlassCard, GradientButton, NotificationBellBadge } from '../../components/Shared';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import api from '../../services/api';
import { NOTIFICATIONS_REFRESH_EVENT } from '../../services/notificationSync';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchBar, SearchFilterChips } from '../../features/search';

function NotificationsPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [filter, setFilter] = useState('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [deleteNotifConfirmId, setDeleteNotifConfirmId] = useState(null);
  const { on, off } = useSocket();

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

  const getActionLabel = (rawType, mappedType) => {
    const r = String(rawType || '');
    if (r === 'task' || r === 'task_assigned' || r === 'task_completed') return t('notifications.actionTask');
    if (r === 'mention' || r === 'message') return t('notifications.actionChat');
    if (r === 'deadline') return t('notifications.actionUpdate');
    if (r === 'meeting') return t('notifications.actionJoin');
    if (r === 'file' || r === 'document') return t('notifications.actionFile');
    if (r === 'friend' || r === 'friend_request' || r === 'friend_accepted') return t('notifications.actionFriend');
    if (r === 'org_join_application') return t('notifications.actionJoinApp');
    if (r === 'system') return t('notifications.actionDetail');
    const m = String(mappedType || '');
    if (m === 'task') return t('notifications.actionTask');
    if (m === 'mention') return t('notifications.actionChat');
    if (m === 'friend') return t('notifications.actionFriend');
    return t('notifications.actionDetail');
  };

  const toViewNotification = (item) => {
    const id = item?._id || item?.id;
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
      id,
      type,
      rawType,
      icon: iconByType[rawType] || iconByType[type] || '🔔',
      title: item?.title || t('notifications.defaultTitle'),
      message: item?.content || item?.message || '',
      time: getRelativeTime(item?.createdAt),
      read: Boolean(item?.isRead),
      priority: item?.data?.priority || 'low',
      action: getActionLabel(rawType, type),
      /** Chuông + badge đỏ giống sidebar (chủ yếu lời mời kết bạn) */
      useBellCard: rawType === 'friend_request' || type === 'friend',
    };
  };

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const response = await api.get('/notifications', { params: { limit: 100 } });
      const payload = response?.data || response;
      const data = payload?.data || payload;
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(list.map(toViewNotification));
    } catch (error) {
      const msg = error?.response?.data?.message || t('notifications.loadFail');
      toast.error(msg);
    } finally {
      setNotificationsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  /** Đồng bộ sau accept/reject kết bạn (cùng tab hoặc sau markFriendNotificationsResolved) */
  useEffect(() => {
    const onRefresh = () => loadNotifications();
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [loadNotifications]);

  useEffect(() => {
    if (!on || !off) return;

    const upsertNotification = (raw) => {
      const item = toViewNotification(raw);
      setNotifications((prev) => {
        if (!item?.id) return prev;
        const exists = prev.some((n) => n.id === item.id);
        if (exists) {
          return prev.map((n) => (n.id === item.id ? { ...n, ...item } : n));
        }
        return [item, ...prev];
      });
    };

    const handleNotificationNew = (payload) => {
      if (payload?.notification) {
        upsertNotification(payload.notification);
      }
    };

    const handleNotificationBulk = (payload) => {
      const list = Array.isArray(payload?.notifications) ? payload.notifications : [];
      list.forEach((item) => upsertNotification(item));
    };

    const handleRead = (payload) => {
      const targetId = payload?.notificationId;
      if (!targetId) return;
      setNotifications((prev) => prev.map((n) => (String(n.id) === String(targetId) ? { ...n, read: true } : n)));
    };

    const handleReadAll = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const handleReadMany = (payload) => {
      const ids = new Set((payload?.notificationIds || []).map(String));
      if (ids.size === 0) return;
      setNotifications((prev) =>
        prev.map((n) => (ids.has(String(n.id)) ? { ...n, read: true } : n))
      );
    };

    const handleDeleted = (payload) => {
      const targetId = payload?.notificationId;
      if (!targetId) return;
      setNotifications((prev) => prev.filter((n) => String(n.id) !== String(targetId)));
    };

    const handleDeletedReadAll = () => {
      setNotifications((prev) => prev.filter((n) => !n.read));
    };

    on('notification:new', handleNotificationNew);
    on('notification:bulk_new', handleNotificationBulk);
    on('notification:read', handleRead);
    on('notification:read_all', handleReadAll);
    on('notification:deleted', handleDeleted);
    on('notification:deleted_read_all', handleDeletedReadAll);

    return () => {
      off('notification:new', handleNotificationNew);
      off('notification:bulk_new', handleNotificationBulk);
      off('notification:read', handleRead);
      off('notification:read_many', handleReadMany);
      off('notification:read_all', handleReadAll);
      off('notification:deleted', handleDeleted);
      off('notification:deleted_read_all', handleDeletedReadAll);
    };
  }, [on, off]);

  const handleMarkAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      toast.success(t('notifications.markRead'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('notifications.markReadErr'));
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success(t('notifications.markAllRead'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('notifications.markAllErr'));
    }
  };

  const confirmDeleteNotification = async () => {
    const id = deleteNotifConfirmId;
    if (!id) return;
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success(t('notifications.deleted'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('notifications.deleteErr'));
    }
  };

  const handleOpenNotification = (notif) => {
    if (!notif) return;

    // Mark as read immediately when user opens a notification target
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }

    switch (notif.type) {
      case 'mention':
        navigate('/chat/organization');
        toast(t('notifications.toastOpenOrgChat'), { icon: '💬' });
        break;
      case 'friend':
        navigate('/chat/friends?tab=requests');
        toast(t('notifications.toastOpenFriendReq'), { icon: '👥' });
        break;
      case 'meeting':
        navigate('/calendar');
        toast(t('notifications.toastOpenCalendar'), { icon: '📅' });
        break;
      case 'system':
        navigate('/settings');
        toast(t('notifications.toastOpenSettings'), { icon: '⚙️' });
        break;
      case 'task':
      case 'deadline':
        navigate('/tasks');
        toast(t('notifications.toastOpenTasks'), { icon: '✅' });
        break;
      case 'file':
        navigate('/documents');
        toast(t('notifications.toastOpenDocs'), { icon: '📁' });
        break;
      default:
        navigate('/dashboard');
        toast(t('notifications.toastOpenDetail'), { icon: 'ℹ️' });
    }
  };

  const filteredNotifications = useMemo(() => {
    let list =
      filter === 'all'
        ? notifications
        : filter === 'unread'
          ? notifications.filter((n) => !n.read)
          : filter === 'friend'
            ? notifications.filter((n) => n.type === 'friend')
            : notifications.filter((n) => n.type === filter);
    const q = notifSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) => {
      const hay = `${n.title || ''} ${n.message || ''} ${n.action || ''} ${n.type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notifications, filter, notifSearch]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const notifFilterOptions = useMemo(
    () => [
      { id: 'all', label: t('notifications.filterAll'), icon: '📋' },
      { id: 'unread', label: t('notifications.filterUnread'), icon: '⭐' },
      { id: 'task', label: t('notifications.filterTasks'), icon: '✅' },
      { id: 'mention', label: t('common.mentions'), icon: '💬' },
      { id: 'deadline', label: t('notifications.filterDeadline'), icon: '⏰' },
      { id: 'meeting', label: t('notifications.filterMeetings'), icon: '📅' },
      { id: 'friend', label: t('notifications.filterFriend'), icon: '🔔' },
    ],
    [t]
  );

  const shell = `${appShellBg(isDarkMode)} ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`;
  const gc = isDarkMode ? 'border border-slate-800 bg-slate-900/60' : 'border border-slate-200 bg-white shadow-sm';
  const btnGhost = isDarkMode
    ? 'border border-slate-800 bg-[#040f2a] font-semibold text-sm hover:bg-slate-800/70'
    : 'border border-slate-200 bg-white font-semibold text-sm text-slate-800 hover:bg-slate-50';

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className={`p-5 lg:p-6 min-h-full ${shell}`}>
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className={`mb-1 text-3xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {t('notifications.title')}
            </h1>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('notifications.subtitle')}</p>
            <PageSearchBar
              className="mt-4 max-w-md"
              value={notifSearch}
              onChange={setNotifSearch}
              placeholder={t('notifications.searchPlaceholder')}
              isDarkMode={isDarkMode}
              id="notifications-search"
            />
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <button 
              onClick={() => navigate('/settings')}
              className={`rounded-xl px-4 py-2 transition-all ${btnGhost}`}
            >
              {t('notifications.btnNotifSettings')}
            </button>
            <button 
              onClick={handleMarkAllAsRead}
              className={`rounded-xl px-4 py-2 transition-all ${btnGhost}`}
            >
              {t('notifications.btnMarkAll')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <GlassCard hover className={gc}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 text-2xl">
                🔔
              </div>
              <div>
                <div className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{notifications.length}</div>
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('notifications.statTotal')}</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover className={gc}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-2xl">
                ⭐
              </div>
              <div>
                <div className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{unreadCount}</div>
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('notifications.statUnread')}</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover className={gc}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-2xl">
                ✅
              </div>
              <div>
                <div className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{notifications.filter(n => n.type === 'task').length}</div>
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('notifications.statTasks')}</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover className={gc}>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 text-2xl">
                💬
              </div>
              <div>
                <div className={`text-2xl font-black ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{notifications.filter(n => n.type === 'mention').length}</div>
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('common.mentions')}</div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Bộ lọc loại + từ khóa (ô tìm phía trên) */}
        <div className="mb-6">
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
            {t('notifications.filtersHeading')}
          </p>
          <SearchFilterChips
            aria-label={t('notifications.filtersAria')}
            options={notifFilterOptions}
            value={filter}
            onChange={setFilter}
            isDarkMode={isDarkMode}
          />
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {notificationsLoading && (
            <p className={`text-center text-sm ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>{t('notifications.loading')}</p>
          )}
          {!notificationsLoading &&
            filteredNotifications.map((notif, idx) => (
            <GlassCard key={notif.id} hover className={`animate-slideUp ${gc} ${!notif.read ? (isDarkMode ? 'border-l-4 border-cyan-500' : 'border-l-4 border-cyan-600') : ''}`} style={{animationDelay: `${idx * 0.05}s`}}>
              <div className="flex items-start gap-4">
                {notif.useBellCard && notif.type === 'friend' ? (
                  <div className="flex-shrink-0 pt-0.5">
                    <NotificationBellBadge
                      count={notif.read ? 0 : 1}
                      sizeClass="h-12 w-12"
                      isDark={isDarkMode}
                    />
                  </div>
                ) : (
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                  notif.priority === 'high' ? 'from-red-500 to-orange-500' :
                  notif.priority === 'medium' ? 'from-blue-500 to-cyan-500' :
                  'from-green-500 to-emerald-500'
                } flex items-center justify-center text-2xl flex-shrink-0`}>
                  {notif.icon}
                </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white">{notif.title}</h3>
                    {!notif.read && (
                      <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-bold text-white">{t('common.newBadge')}</span>
                    )}
                    {notif.priority === 'high' && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-xs font-bold">{t('common.importantBadge')}</span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{notif.message}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>🕐 {notif.time}</span>
                    <span>•</span>
                    <span className="capitalize">{notif.type}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {notif.useBellCard && notif.type === 'friend' ? (
                    <GradientButton
                      variant="friend"
                      className="!px-5 !py-2.5 !rounded-xl text-sm font-bold whitespace-nowrap shadow-lg"
                      onClick={() => handleOpenNotification(notif)}
                    >
                      {t('notifications.addFriend')}
                    </GradientButton>
                  ) : (
                  <button 
                    onClick={() => handleOpenNotification(notif)}
                    className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all text-sm font-semibold whitespace-nowrap"
                  >
                    {notif.action}
                  </button>
                  )}
                  {!notif.read && (
                    <button 
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all text-xs text-gray-400 hover:text-white"
                    >
                      {t('notifications.markOneRead')}
                    </button>
                  )}
                  <button 
                    onClick={() => setDeleteNotifConfirmId(notif.id)}
                    className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all text-xs text-red-400 hover:text-red-300"
                  >
                    {t('notifications.deleteBtn')}
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {!notificationsLoading && filteredNotifications.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎉</div>
            <p className="text-xl text-gray-400">{t('notifications.empty')}</p>
          </div>
        )}
          </div>
        }
      />

    <ConfirmDialog
      isOpen={deleteNotifConfirmId != null}
      onClose={() => setDeleteNotifConfirmId(null)}
      onConfirm={confirmDeleteNotification}
      title={t('notifications.confirmDeleteTitle')}
      message={t('notifications.confirmDeleteMsg')}
      confirmText={t('common.delete')}
      cancelText={t('nav.cancel')}
    />
    </>
  );
}

export default NotificationsPage;
