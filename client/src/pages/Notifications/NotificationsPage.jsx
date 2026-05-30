import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { ConfirmDialog, GlassCard, GradientButton, NotificationBellBadge } from '../../components/Shared';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import api from '../../services/api';
import friendService from '../../services/friendService';
import {
  NOTIFICATIONS_REFRESH_EVENT,
  markFriendNotificationsResolved,
  markVoiceRoomJoinRequestNotificationsResolved,
} from '../../services/notificationSync';
import { useFriendPending, useNotificationsInfinite, useOrganizationsMy } from '../../hooks/queries';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import { queryKeys } from '../../lib/queryKeys';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchToolbar, SearchFilterChips } from '../../features/search';
import { orgRecordId } from '../../utils/orgListUtils';
import { buildWorkspacePath } from '../../utils/workspaceTabUtils';

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

function rawNotificationHasOrgScope(item) {
  const data = parseNotificationDataField(item?.data);
  const orgId = data?.organizationId || data?.workspaceId || '';
  return Boolean(String(orgId).trim());
}

const ORG_NOTIFICATIONS_PATH = '/notifications/organization';

function unwrapApiBody(res) {
  const body = res?.data;
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return body.data;
  }
  return body ?? null;
}

function getNotifActionKind(notif) {
  if (!notif || notif.read || notif.data?.resolved) return 'none';
  if (notif.data?.kind === 'voice_room_join_request') return 'voice_join';
  if (notif.rawType === 'friend_request') return 'friend_request';
  return 'navigate';
}

function NotificationsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { activeWorkspace } = useWorkspace();
  const isOrgNotificationsPage = location.pathname.startsWith(ORG_NOTIFICATIONS_PATH);
  const notificationScope = isOrgNotificationsPage ? 'organization' : 'personal';
  const organizationIdFilter = useMemo(() => {
    const fromQuery = String(searchParams.get('organizationId') || searchParams.get('orgId') || '').trim();
    if (fromQuery) return fromQuery;
    if (!isOrgNotificationsPage) return '';
    return (
      activeWorkspace?._id ||
      activeWorkspace?.id ||
      activeWorkspace?.organizationId ||
      ''
    );
  }, [
    searchParams,
    isOrgNotificationsPage,
    activeWorkspace?._id,
    activeWorkspace?.id,
    activeWorkspace?.organizationId,
  ]);

  const orgsQuery = useOrganizationsMy();

  /** URL cũ ?scope=organization → trang org riêng */
  useEffect(() => {
    const legacyScope = String(searchParams.get('scope') || '').trim().toLowerCase();
    if (location.pathname !== '/notifications' || legacyScope !== 'organization') return;
    const params = new URLSearchParams(searchParams);
    params.delete('scope');
    const qs = params.toString();
    navigate(`${ORG_NOTIFICATIONS_PATH}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [location.pathname, navigate, searchParams]);

  /** Thông báo tổ chức → workspace tab giữa (giống công việc) */
  useEffect(() => {
    if (!isOrgNotificationsPage || !organizationIdFilter) return;
    const fromList = (Array.isArray(orgsQuery.data) ? orgsQuery.data : []).find(
      (o) => orgRecordId(o) === organizationIdFilter
    );
    const slug =
      String(fromList?.slug || '').trim() ||
      String(activeWorkspace?.slug || '').trim() ||
      '';
    if (slug) {
      navigate(buildWorkspacePath(slug, 'notifications'), { replace: true });
      return;
    }
    navigate(
      `/workspaces?orgId=${encodeURIComponent(organizationIdFilter)}&tab=notifications`,
      { replace: true }
    );
  }, [
    isOrgNotificationsPage,
    organizationIdFilter,
    orgsQuery.data,
    activeWorkspace?.slug,
    navigate,
  ]);
  const [filter, setFilter] = useState('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [deleteNotifConfirmId, setDeleteNotifConfirmId] = useState(null);
  const [actingNotifId, setActingNotifId] = useState('');
  const { on, off } = useSocket();
  const queryClient = useQueryClient();

  const notifInfiniteQuery = useNotificationsInfinite({
    scope: notificationScope,
    organizationId: organizationIdFilter,
  });

  const { pendingCount: friendPendingCount } = useFriendPending({
    enabled: !isOrgNotificationsPage,
  });

  const { data: orgShellForBadge } = useOrgShell(organizationIdFilter, {
    enabled: isOrgNotificationsPage && Boolean(organizationIdFilter),
  });

  useEffect(() => {
    if (!isOrgNotificationsPage || !organizationIdFilter || !orgShellForBadge) return;
    const unread = Number(orgShellForBadge?.badges?.notificationsUnreadOrg);
    if (!Number.isFinite(unread)) return;
    queryClient.setQueryData(
      queryKeys.notifications.badge('organization', organizationIdFilter),
      { unreadCount: Math.max(0, unread) },
      { updatedAt: Date.now() }
    );
  }, [isOrgNotificationsPage, organizationIdFilter, orgShellForBadge, queryClient]);

  const notificationsLoading = notifInfiniteQuery.isLoading;

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

  const parseNotificationData = (item) => parseNotificationDataField(item?.data);

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
    const data = parseNotificationData(item);
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
    const orgLabel =
      data?.workspaceName ||
      data?.organizationName ||
      data?.companyName ||
      item?.workspaceName ||
      item?.organizationName ||
      item?.companyName ||
      '';
    const orgSlug =
      data?.workspaceSlug ||
      data?.organizationSlug ||
      item?.workspaceSlug ||
      item?.organizationSlug ||
      '';
    const orgId =
      data?.workspaceId ||
      data?.organizationId ||
      item?.workspaceId ||
      item?.organizationId ||
      '';
    const actionUrl = String(item?.actionUrl || '').trim();
    return {
      id,
      type,
      rawType,
      icon: iconByType[rawType] || iconByType[type] || '🔔',
      title: item?.title || t('notifications.defaultTitle'),
      message: item?.content || item?.message || '',
      time: getRelativeTime(item?.createdAt),
      read: Boolean(item?.isRead),
      priority: data?.priority || 'low',
      action: getActionLabel(rawType, type),
      actionUrl,
      data,
      organizationLabel: orgLabel,
      organizationName: orgLabel,
      organizationSlug: orgSlug,
      organizationId: orgId,
      /** Chuông + badge đỏ giống sidebar (chủ yếu lời mời kết bạn) */
      useBellCard: rawType === 'friend_request' || type === 'friend',
    };
  };

  useEffect(() => {
    const pages = notifInfiniteQuery.data?.pages || [];
    const list = pages.flatMap((p) => (Array.isArray(p?.notifications) ? p.notifications : []));
    setNotifications(list.map(toViewNotification));
  }, [notifInfiniteQuery.data]);

  useEffect(() => {
    if (notifInfiniteQuery.isError) {
      const err = notifInfiniteQuery.error;
      const msg = err?.response?.data?.message || t('notifications.loadFail');
      toast.error(msg);
    }
  }, [notifInfiniteQuery.isError, notifInfiniteQuery.error, t]);

  const reloadNotifications = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.notifications.infinite(notificationScope, organizationIdFilter),
    });
  }, [queryClient, notificationScope, organizationIdFilter]);

  /** Đồng bộ sau accept/reject kết bạn (cùng tab hoặc sau markFriendNotificationsResolved) */
  useEffect(() => {
    const onRefresh = () => reloadNotifications();
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [reloadNotifications]);

  useEffect(() => {
    if (!on || !off) return;

    const upsertNotification = (raw) => {
      const inOrg = rawNotificationHasOrgScope(raw);
      if (notificationScope === 'organization' && !inOrg) return;
      if (notificationScope === 'personal' && inOrg) return;
      if (notificationScope === 'organization' && organizationIdFilter) {
        const data = parseNotificationDataField(raw?.data);
        const oid = String(data?.organizationId || data?.workspaceId || '').trim();
        if (oid && oid !== organizationIdFilter) return;
      }
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
        prev.map((n) =>
          ids.has(String(n.id))
            ? { ...n, read: true, data: { ...(n.data || {}), resolved: true } }
            : n
        )
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
    on('notification:read_many', handleReadMany);
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
  }, [on, off, notificationScope, organizationIdFilter]);

  const markNotifResolvedLocal = useCallback((notifId, patchData = {}) => {
    if (!notifId) return;
    setNotifications((prev) =>
      prev.map((n) =>
        String(n.id) === String(notifId)
          ? {
              ...n,
              read: true,
              data: { ...(n.data || {}), resolved: true, ...patchData },
            }
          : n
      )
    );
  }, []);

  const resolveVoiceJoinRequestId = async (notif) => {
    const roomId = String(notif?.data?.roomId || '').trim();
    let requestId = String(notif?.data?.requestId || '').trim();
    if (requestId || !roomId) return { roomId, requestId };
    const requestUserId = String(notif?.data?.requestUserId || '').trim();
    try {
      const res = await api.get(`/voice/rooms/${encodeURIComponent(roomId)}/join-requests`, {
        skipGlobalErrorHandling: true,
      });
      const rows = unwrapApiBody(res);
      const list = Array.isArray(rows) ? rows : [];
      const match = requestUserId
        ? list.find((r) => String(r.userId) === requestUserId)
        : list[0];
      requestId = match?.id ? String(match.id) : '';
    } catch {
      requestId = '';
    }
    return { roomId, requestId };
  };

  const handleApproveVoiceJoin = async (notif) => {
    if (!notif?.id || actingNotifId) return;
    setActingNotifId(notif.id);
    try {
      const { roomId, requestId } = await resolveVoiceJoinRequestId(notif);
      if (!roomId || !requestId) {
        toast.error(t('notifications.toastVoiceApproveFail'));
        return;
      }
      await api.post(
        `/voice/rooms/${encodeURIComponent(roomId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
        {},
        { skipGlobalErrorHandling: true }
      );
      await markVoiceRoomJoinRequestNotificationsResolved({
        roomId,
        requestId,
        requestUserId: notif.data?.requestUserId,
      });
      markNotifResolvedLocal(notif.id);
      toast.success(t('notifications.toastVoiceApproved'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('notifications.toastVoiceApproveFail'));
    } finally {
      setActingNotifId('');
    }
  };

  const handleAcceptFriendRequest = async (notif) => {
    if (!notif?.id || actingNotifId) return;
    const counterpartyId = String(notif?.data?.userId || notif?.data?.friendId || '').trim();
    if (!counterpartyId) return;
    setActingNotifId(notif.id);
    try {
      await friendService.acceptFriend(counterpartyId);
      await markFriendNotificationsResolved(counterpartyId);
      markNotifResolvedLocal(notif.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      toast.success(t('notifications.toastFriendAccepted'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('notifications.toastFriendActionFail'));
    } finally {
      setActingNotifId('');
    }
  };

  const handleRejectFriendRequest = async (notif) => {
    if (!notif?.id || actingNotifId) return;
    const counterpartyId = String(notif?.data?.userId || notif?.data?.friendId || '').trim();
    if (!counterpartyId) return;
    setActingNotifId(notif.id);
    try {
      await friendService.rejectFriend(counterpartyId);
      await markFriendNotificationsResolved(counterpartyId);
      markNotifResolvedLocal(notif.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      toast.success(t('notifications.toastFriendRejected'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('notifications.toastFriendActionFail'));
    } finally {
      setActingNotifId('');
    }
  };

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

    const targetWorkspacePath = notif.organizationSlug
      ? buildWorkspacePath(notif.organizationSlug, 'chat')
      : notif.organizationId
        ? `/workspaces?orgId=${encodeURIComponent(notif.organizationId)}`
        : null;

    if (notif.rawType === 'message') {
      const senderId = String(
        notif.data?.senderId || notif.data?.friendId || ''
      ).trim();
      const fromAction = (() => {
        const url = String(notif.actionUrl || '');
        const m = url.match(/[?&]openDmUserId=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : '';
      })();
      const peerId = senderId || fromAction;
      if (peerId) {
        navigate(`/chat/friends?openDmUserId=${encodeURIComponent(peerId)}`);
      } else {
        navigate('/chat/friends');
      }
      toast(t('notifications.toastOpenFriendChat'), { icon: '💬' });
      return;
    }

    switch (notif.type) {
      case 'mention':
        navigate(targetWorkspacePath || '/chat/organization');
        toast(t('notifications.toastOpenOrgChat'), { icon: '💬' });
        break;
      case 'friend':
        navigate('/chat/friends?tab=requests');
        toast(t('notifications.toastOpenFriendReq'), { icon: '👥' });
        break;
      case 'meeting':
        if (
          notif.data?.kind === 'voice_room_invite' ||
          notif.data?.kind === 'voice_room_join_request'
        ) {
          const voiceUrl = String(notif.actionUrl || '').trim();
          if (voiceUrl.startsWith('/voice')) {
            navigate(voiceUrl);
          } else if (notif.data?.roomId) {
            navigate(`/voice/${encodeURIComponent(notif.data.roomId)}?join=1`);
          } else {
            navigate('/voice');
          }
          toast(t('notifications.toastOpenVoiceRoom'), { icon: '🎙️' });
        } else {
          navigate('/calendar');
          toast(t('notifications.toastOpenCalendar'), { icon: '📅' });
        }
        break;
      case 'system':
        navigate(targetWorkspacePath || '/settings');
        toast(t('notifications.toastOpenSettings'), { icon: '⚙️' });
        break;
      case 'task':
      case 'deadline':
        navigate(
          notif.organizationSlug ? buildWorkspacePath(notif.organizationSlug, 'tasks') : '/tasks'
        );
        toast(t('notifications.toastOpenTasks'), { icon: '✅' });
        break;
      case 'file':
        navigate(
          notif.organizationSlug
            ? buildWorkspacePath(notif.organizationSlug, 'documents')
            : notif.organizationId
              ? `/workspaces?orgId=${encodeURIComponent(notif.organizationId)}&tab=documents`
              : '/documents'
        );
        toast(t('notifications.toastOpenDocs'), { icon: '📁' });
        break;
      default:
        navigate(targetWorkspacePath || '/dashboard');
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
    if (notificationScope === 'organization' && organizationIdFilter) {
      list = list.filter((n) => String(n.organizationId || '').trim() === organizationIdFilter);
    }
    const q = notifSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) => {
      const hay = `${n.title || ''} ${n.message || ''} ${n.action || ''} ${n.type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notifications, filter, notifSearch, organizationIdFilter, notificationScope]);

  const newNotifications = useMemo(
    () => filteredNotifications.filter((n) => !n.read),
    [filteredNotifications]
  );

  const historyNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.read),
    [filteredNotifications]
  );

  const unreadCount = notifications.filter(n => !n.read).length;

  const notifFilterOptions = useMemo(() => {
    const base = [
      { id: 'all', label: t('notifications.filterAll'), icon: '📋' },
      { id: 'unread', label: t('notifications.filterUnread'), icon: '⭐' },
      { id: 'task', label: t('notifications.filterTasks'), icon: '✅' },
      { id: 'mention', label: t('common.mentions'), icon: '💬' },
      { id: 'deadline', label: t('notifications.filterDeadline'), icon: '⏰' },
      { id: 'meeting', label: t('notifications.filterMeetings'), icon: '📅' },
    ];
    if (!isOrgNotificationsPage) {
      base.push({ id: 'friend', label: t('notifications.filterFriend'), icon: '🔔' });
    }
    return base;
  }, [t, isOrgNotificationsPage]);

  if (isOrgNotificationsPage && organizationIdFilter) {
    return null;
  }

  const shell = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const gc = isDarkMode ? 'border border-slate-800 bg-slate-900/60' : 'border border-slate-200 bg-white shadow-sm';
  const columnShell = isDarkMode
    ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/30 backdrop-blur-sm'
    : 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/70 shadow-sm backdrop-blur-sm';
  const columnHeader = isDarkMode
    ? 'shrink-0 border-b border-white/[0.06] bg-white/[0.03] px-4 py-3'
    : 'shrink-0 border-b border-slate-200/90 bg-slate-50/90 px-4 py-3';

  const renderNotificationCard = (notif, idx) => (
    <GlassCard
      key={notif.id}
      hover
      className={`animate-slideUp ${gc} ${!notif.read ? (isDarkMode ? 'border-l-4 border-cyan-500' : 'border-l-4 border-cyan-600') : ''}`}
      style={{ animationDelay: `${idx * 0.05}s` }}
    >
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
          <div
            className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl ${
              notif.priority === 'high'
                ? 'from-red-500 to-orange-500'
                : notif.priority === 'medium'
                  ? 'from-blue-500 to-cyan-500'
                  : 'from-green-500 to-emerald-500'
            }`}
          >
            {notif.icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{notif.title}</h3>
            {!notif.read && (
              <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-xs font-bold text-white">
                {t('common.newBadge')}
              </span>
            )}
            {notif.priority === 'high' && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                {t('common.importantBadge')}
              </span>
            )}
          </div>
          <p className={`mb-2 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-600'}`}>{notif.message}</p>
          <div className={`flex items-center gap-3 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
            <span>🕐 {notif.time}</span>
            <span>•</span>
            <span className="capitalize">{notif.type}</span>
            {notif.organizationName ? (
              <>
                <span>•</span>
                <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-cyan-300">
                  {notif.organizationName}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {getNotifActionKind(notif) === 'voice_join' ? (
            <GradientButton
              variant="primary"
              className="!rounded-xl !px-5 !py-2.5 text-sm font-bold whitespace-nowrap shadow-lg"
              disabled={Boolean(actingNotifId)}
              onClick={() => handleApproveVoiceJoin(notif)}
            >
              {actingNotifId === notif.id ? t('notifications.loading') : t('notifications.actionApprove')}
            </GradientButton>
          ) : getNotifActionKind(notif) === 'friend_request' ? (
            <>
              <GradientButton
                variant="friend"
                className="!rounded-xl !px-5 !py-2.5 text-sm font-bold whitespace-nowrap shadow-lg"
                disabled={Boolean(actingNotifId)}
                onClick={() => handleAcceptFriendRequest(notif)}
              >
                {actingNotifId === notif.id ? t('notifications.loading') : t('notifications.actionAccept')}
              </GradientButton>
              <button
                type="button"
                disabled={Boolean(actingNotifId)}
                onClick={() => handleRejectFriendRequest(notif)}
                className="rounded-lg border border-slate-700 bg-[#040f2a] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-slate-800/70 disabled:opacity-50"
              >
                {t('notifications.actionReject')}
              </button>
            </>
          ) : getNotifActionKind(notif) === 'navigate' ? (
            <button
              type="button"
              onClick={() => handleOpenNotification(notif)}
              className="rounded-lg border border-slate-800 bg-[#040f2a] px-4 py-2 text-sm font-semibold whitespace-nowrap transition hover:bg-slate-800/70"
            >
              {notif.action}
            </button>
          ) : null}
          {!notif.read && (
            <button
              type="button"
              onClick={() => handleMarkAsRead(notif.id)}
              className="rounded-lg border border-slate-800 bg-[#040f2a] px-4 py-2 text-xs text-gray-400 transition-all hover:bg-slate-800/70 hover:text-white"
            >
              {t('notifications.markOneRead')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleteNotifConfirmId(notif.id)}
            className="rounded-lg border border-slate-800 bg-[#040f2a] px-4 py-2 text-xs text-red-400 transition-all hover:bg-slate-800/70 hover:text-red-300"
          >
            {t('notifications.deleteBtn')}
          </button>
        </div>
      </div>
    </GlassCard>
  );

  const renderNotificationColumn = (title, count, items, emptyMessage, emptyIcon, showLoadingWhenEmpty = false) => (
    <section className={columnShell}>
      <header className={columnHeader}>
        <div className="flex items-center justify-between gap-2">
          <h2 className={`text-sm font-bold tracking-wide sm:text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            {title}
          </h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
              isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-800'
            }`}
          >
            {count}
          </span>
        </div>
      </header>
      <div className="scrollbar-notifications min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <div className="space-y-3">
          {notificationsLoading && showLoadingWhenEmpty && items.length === 0 && (
            <p className={`py-8 text-center text-sm ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
              {t('notifications.loading')}
            </p>
          )}
          {!(notificationsLoading && showLoadingWhenEmpty && items.length === 0) && items.length === 0 && (
            <div className="py-12 text-center">
              <div className="mb-2 text-4xl opacity-80">{emptyIcon}</div>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-500'}`}>{emptyMessage}</p>
            </div>
          )}
          {!notificationsLoading && items.map((notif, idx) => renderNotificationCard(notif, idx))}
        </div>
      </div>
    </section>
  );

  return (
    <>
      <ThreeFrameLayout
        centerScrollable={false}
        center={
          <div className={`flex h-full min-h-0 flex-col p-5 lg:p-6 ${shell}`}>
        <PageSearchToolbar
          className="-mx-5 mb-4 shrink-0 !bg-transparent lg:-mx-6 lg:mb-5"
          layout="filters-inline"
          value={notifSearch}
          onChange={setNotifSearch}
          placeholder={t('notifications.searchPlaceholder')}
          isDarkMode={isDarkMode}
          id="notifications-search"
          aria-label={t('searchUi.searchAria')}
        >
          <SearchFilterChips
            aria-label={t('notifications.filtersAria')}
            options={notifFilterOptions}
            value={filter}
            onChange={setFilter}
            isDarkMode={isDarkMode}
          />
        </PageSearchToolbar>

        {!isOrgNotificationsPage && friendPendingCount > 0 && (
          <button
            type="button"
            onClick={() => navigate('/chat/friends?tab=requests')}
            className={`mb-4 w-full shrink-0 rounded-xl px-4 py-3 text-left text-sm font-semibold transition lg:mb-5 ${
              isDarkMode
                ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20'
                : 'border border-cyan-200 bg-cyan-50 text-cyan-900 hover:bg-cyan-100'
            }`}
          >
            {t('dashboard.pendingInvites', { n: friendPendingCount })}
          </button>
        )}

        {/* Stats */}
        <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:mb-5">
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

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-4 lg:grid-cols-2 lg:grid-rows-1">
          {renderNotificationColumn(
            t('notifications.columnNew'),
            newNotifications.length,
            newNotifications,
            t('notifications.emptyNew'),
            '✨',
            true
          )}
          {renderNotificationColumn(
            t('notifications.columnHistory'),
            historyNotifications.length,
            historyNotifications,
            t('notifications.emptyHistory'),
            '📭',
            false
          )}
        </div>

        {!notificationsLoading && notifInfiniteQuery.hasNextPage && (
          <div className="flex shrink-0 justify-center pt-3">
            <GradientButton
              type="button"
              variant="secondary"
              disabled={notifInfiniteQuery.isFetchingNextPage}
              onClick={() => notifInfiniteQuery.fetchNextPage()}
            >
              {notifInfiniteQuery.isFetchingNextPage
                ? t('notifications.loading')
                : t('notifications.loadMore')}
            </GradientButton>
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
