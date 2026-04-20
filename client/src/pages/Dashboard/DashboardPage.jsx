import { Bell, MoreHorizontal, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AddFriendModal from '../../components/Friends/AddFriendModal';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import ShellWaveBackdrop from '../../components/Layout/ShellWaveBackdrop';
import { Dropdown, GlassCard, GradientButton, Modal, StatusIndicator } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { meetingAPI } from '../../services/api/meetingAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI } from '../../services/api/taskAPI';
import friendService from '../../services/friendService';
import { appShellBg } from '../../theme/shellTheme';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import DashboardGlobalSearchModal from '../../components/Dashboard/DashboardGlobalSearchModal';

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Mini sparkline — thanh nhỏ cho thẻ metric */
function MiniSparkline({ up = true, className = '' }) {
  const heights = up ? [38, 52, 45, 58, 50, 65, 72] : [72, 58, 62, 48, 55, 42, 38];
  return (
    <div className={`flex h-7 items-end gap-[3px] ${className}`}>
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] min-h-[4px] rounded-full bg-current opacity-90 transition-all"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function DashboardPage({ landingDemo = false, demoVariant = 'default' } = {}) {
  const [activeFilter, setActiveFilter] = useState(() =>
    landingDemo && demoVariant === 'tasks' ? 'tasks' : 'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStat, setSelectedStat] = useState(null);
  const [showActivityDetail, setShowActivityDetail] = useState(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  /** Tăng khi đổi danh sách bạn / lời mời để refetch metrics */
  const [metricsTick, setMetricsTick] = useState(0);
  const [metrics, setMetrics] = useState({
    loading: !landingDemo,
    orgCount: landingDemo ? 2 : null,
    friendsTotal: landingDemo ? 8 : null,
    pendingCount: landingDemo ? 2 : 0,
    unread: landingDemo ? 4 : 0,
    taskDone: landingDemo ? 14 : null,
  });
  /** Bạn bè cho khung Trạng thái nhóm (từ GET /api/friends) */
  const [presenceFriends, setPresenceFriends] = useState([]);
  /** Cuộc họp sắp tới (từ GET /api/meetings + startFrom/startTo) */
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const { user } = useAuth();
  const { onlineUsers, connected: socketConnected } = useSocket();
  const navigate = useLandingSafeNavigate(landingDemo);
  const { t } = useAppStrings();
  const { locale } = useLocale();

  const displayName =
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    t('dashboard.greetingNameFallback');

  const getGreeting = () => {
    const now = new Date();
    const hour = now.getHours();
    const name = displayName;
    if (hour >= 5 && hour < 11) return t('dashboard.greetingMorning', { name });
    if (hour >= 11 && hour < 13) return t('dashboard.greetingNoon', { name });
    if (hour >= 13 && hour < 17) return t('dashboard.greetingAfternoon', { name });
    if (hour >= 17 && hour < 22) return t('dashboard.greetingEvening', { name });
    return t('dashboard.greetingLate', { name });
  };

  useEffect(() => {
    if (landingDemo) return;
    // Chỉ hiển thị modal chào khi vừa đăng nhập / lần đầu vào web trong phiên này
    const seen = localStorage.getItem('vh_seen_welcome');
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem('vh_seen_welcome', '1');
    }
  }, [landingDemo]);

  useEffect(() => {
    if (landingDemo && demoVariant === 'tasks') {
      setActiveFilter('tasks');
    }
  }, [landingDemo, demoVariant]);

  useEffect(() => {
    if (landingDemo) {
      setMetrics({
        loading: false,
        orgCount: 2,
        friendsTotal: 8,
        pendingCount: 2,
        unread: 4,
        taskDone: 14,
      });
      setPresenceFriends([
        { id: 'u1', name: 'Lan Anh', avatar: null, status: 'online' },
        { id: 'u2', name: 'Minh Tuấn', avatar: null, status: 'away' },
      ]);
      setUpcomingMeetings([
        {
          id: 'm-demo',
          title: 'Họp nhóm VoiceHub',
          time: '10:00',
          attendees: 5,
          startTime: new Date().toISOString(),
        },
      ]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const orgPayload = await organizationAPI.getOrganizations().catch(() => null);
        let orgList = [];
        if (orgPayload && Array.isArray(orgPayload.data)) {
          orgList = orgPayload.data;
        } else if (Array.isArray(orgPayload)) {
          orgList = orgPayload;
        }
        const orgCount = orgList.length;
        const rawOrgId = orgList[0]?._id ?? orgList[0]?.id;
        const firstOrgId = rawOrgId != null ? String(rawOrgId) : null;

        let taskDone = null;
        if (firstOrgId) {
          const ts = await taskAPI.getStatistics(firstOrgId).catch(() => null);
          const stat = ts?.data ?? ts;
          const formatted = stat?.data ?? stat;
          if (formatted && typeof formatted === 'object') {
            taskDone = formatted.done ?? null;
          }
        }

        const fr = await friendService.getFriends().catch(() => null);
        let friendsTotal = null;
        let friendsRaw = [];
        if (fr) {
          const inner = fr.data ?? fr;
          const list = inner?.friends ?? inner?.data?.friends;
          if (Array.isArray(list)) {
            friendsRaw = list;
            friendsTotal = list.length;
          }
        }

        const presence = friendsRaw.slice(0, 12).map((row) => {
          const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : null;
          const name =
            u?.displayName || u?.username || (u?.email ? String(u.email).split('@')[0] : null) ||
            t('dashboard.quickNavFriends');
          const st = String(u?.status || 'offline').toLowerCase();
          return {
            id: u?._id || u?.userId || row.friendId,
            name,
            avatarUrl: u?.avatar || null,
            status: ['online', 'away', 'busy', 'offline'].includes(st) ? st : 'offline',
          };
        });
        setPresenceFriends(presence);

        const startFrom = new Date();
        const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
        const meetingRes = await meetingAPI
          .getMeetings({
            startFrom: startFrom.toISOString(),
            startTo: startTo.toISOString(),
            limit: 8,
          })
          .catch(() => null);
        let meetingsUi = [];
        if (meetingRes) {
          const body = meetingRes?.data ?? meetingRes;
          const inner = body?.data ?? body;
          const meetings = inner?.meetings ?? inner?.data?.meetings;
          if (Array.isArray(meetings)) {
            meetingsUi = meetings.slice(0, 5).map((m) => {
              const startDt = m.startTime ? new Date(m.startTime) : null;
              const timeStr =
                startDt && !Number.isNaN(startDt.getTime())
                  ? startDt.toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '—';
              const parts = Array.isArray(m.participants) ? m.participants.length : 0;
              return {
                id: m._id,
                title: m.title || t('dashboard.meetingFallback'),
                time: timeStr,
                attendees: parts || 1,
                startTime: m.startTime,
              };
            });
          }
        }
        setUpcomingMeetings(meetingsUi);

        const pend = await friendService.getPendingRequests().catch(() => null);
        let pendingCount = 0;
        if (pend) {
          const raw = pend.data ?? pend;
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          pendingCount = arr.length;
        }

        const notif = await api.get('/notifications', { params: { limit: 1 } }).catch(() => null);
        let unread = 0;
        if (notif) {
          const nd = notif.data?.data ?? notif.data ?? notif;
          unread = Number(nd?.unreadCount) || 0;
        }

        if (!cancelled) {
          setMetrics({
            loading: false,
            orgCount,
            friendsTotal,
            pendingCount,
            unread,
            taskDone,
          });
        }
      } catch {
        if (!cancelled) {
          setMetrics((m) => ({ ...m, loading: false }));
          setPresenceFriends([]);
          setUpcomingMeetings([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metricsTick, landingDemo, demoVariant, locale, t]);

  /**
   * Presence realtime: khi socket đã kết nối, danh sách `onlineUsers` từ socket-service là nguồn đúng
   * (ai không còn trong danh sách = offline). Không fallback `p.status` từ API khi đã connected — API/DB
   * có thể vẫn là "online" vài giây sau khi peer đã disconnect.
   */
  const displayPresenceFriends = useMemo(() => {
    const set = new Set((onlineUsers || []).map(String));
    return presenceFriends.map((p) => {
      const idStr = String(p.id);
      const inLiveList = set.has(idStr);
      if (socketConnected) {
        return { ...p, status: inLiveList ? 'online' : 'offline' };
      }
      return {
        ...p,
        status: inLiveList ? 'online' : p.status,
      };
    });
  }, [presenceFriends, onlineUsers, socketConnected]);

  const onlineFriendCount = useMemo(
    () => displayPresenceFriends.filter((p) => p.status === 'online').length,
    [displayPresenceFriends]
  );

  const { isDarkMode } = useTheme();
  const shellBg = appShellBg(isDarkMode);
  const dashHeader = isDarkMode
    ? 'border-b border-white/[0.06] bg-[#0D0D0F]/95 backdrop-blur-md'
    : 'border-b border-sky-200/90 bg-sky-50/95 backdrop-blur-md';
  const dashMain = isDarkMode ? '' : 'bg-gradient-to-b from-sky-50/90 via-transparent to-slate-200/80';
  const dashAside = isDarkMode
    ? 'border-l border-white/[0.06] bg-[#121214]'
    : 'border-l border-sky-200/90 bg-sky-100/85';
  const cardSurface = isDarkMode
    ? 'border border-white/[0.06] bg-[#1A1A1C]'
    : 'border border-slate-200/90 bg-white shadow-sm';
  const inputSurface = isDarkMode
    ? 'border border-white/[0.06] bg-[#1A1A1C] text-white placeholder:text-[#6b7280] focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/25'
    : 'border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20';
  const textMuted = isDarkMode ? 'text-[#9ca3af]' : 'text-slate-600';
  const textHeading = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSub = isDarkMode ? 'text-[#6b7280]' : 'text-slate-600';
  const accentText = isDarkMode ? 'text-cyan-300' : 'text-cyan-700';
  const modalGlass = isDarkMode
    ? 'border border-slate-800 bg-slate-900/60'
    : 'border border-slate-200 bg-white shadow-sm';
  const modalRow = isDarkMode
    ? 'flex items-center gap-3 rounded-xl border border-slate-800 bg-[#040f2a] p-3'
    : 'flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3';
  const modalRowBetween = isDarkMode
    ? 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-3 transition-all hover:bg-slate-800/60'
    : 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:bg-slate-100';
  const modalHeroRow = isDarkMode
    ? 'flex items-center gap-3 rounded-xl border border-slate-800 bg-[#040f2a] p-3.5'
    : 'flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm';
  const modalSecondaryBtn = isDarkMode
    ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800/70'
    : 'rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50';
  const modalSecondaryBtnSm = isDarkMode
    ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-2 text-sm text-white transition-all hover:bg-slate-800/70'
    : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm transition-all hover:bg-slate-50';
  const modalLabel = isDarkMode ? 'mb-2 block text-sm font-semibold text-gray-300' : 'mb-2 block text-sm font-semibold text-slate-700';
  const modalDetailRowBorder = isDarkMode ? 'border-b border-white/5' : 'border-b border-slate-100';
  const modalChip = isDarkMode
    ? 'rounded-lg border border-slate-800 bg-[#040f2a] px-3 py-2 text-sm text-white transition-all hover:bg-slate-800/70'
    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all hover:bg-slate-50';

  const stats = useMemo(() => {
    const fmt = (n) => {
      if (metrics.loading) return '…';
      if (n == null || n === '') return '—';
      return String(n);
    };
    const loadingDetail = t('dashboard.loading');
    return [
      {
        key: 'org',
        icon: '📊',
        label: t('dashboard.statOrg'),
        value: fmt(metrics.orgCount),
        change: '+1',
        color: 'from-cyan-600 to-teal-600',
        iconBg: 'from-[#0891b2] to-[#0d9488]',
        sparkClass: 'text-emerald-400',
        trend: 'up',
        detail: metrics.loading ? loadingDetail : t('dashboard.detailOrg'),
        drilldown: {
          nguon: 'GET /api/organizations/my',
          soToChuc: metrics.orgCount ?? '—',
        },
      },
      {
        key: 'tasks',
        icon: '✅',
        label: t('dashboard.statTaskDone'),
        value: fmt(metrics.taskDone),
        change: '-4',
        color: 'from-blue-500 to-cyan-500',
        iconBg: 'from-[#3B82F6] to-[#06b6d4]',
        sparkClass: 'text-rose-400',
        trend: 'down',
        detail: metrics.loading ? loadingDetail : t('dashboard.detailTask'),
        drilldown: {
          nguon: 'GET /api/tasks/statistics?organizationId=…',
          done: metrics.taskDone ?? '—',
        },
      },
      {
        key: 'friends',
        icon: '👥',
        label: t('dashboard.statFriends'),
        value: fmt(metrics.friendsTotal),
        change: '+1',
        color: 'from-emerald-500 to-teal-500',
        iconBg: 'from-[#10B981] to-[#14b8a6]',
        sparkClass: 'text-emerald-400',
        trend: 'up',
        detail: metrics.loading
          ? loadingDetail
          : t('dashboard.detailFriends', { count: metrics.pendingCount }),
        drilldown: {
          nguon: 'GET /api/friends, /api/friends/pending',
          soBan: metrics.friendsTotal ?? '—',
          loiMoiCho: metrics.pendingCount,
        },
      },
      {
        key: 'notify',
        icon: '🔔',
        label: t('dashboard.statNotify'),
        value: fmt(metrics.unread),
        change: '+2',
        color: 'from-amber-500 to-orange-600',
        iconBg: 'from-[#F59E0B] to-[#ea580c]',
        sparkClass: 'text-emerald-400',
        trend: 'up',
        detail: metrics.loading ? loadingDetail : t('dashboard.detailUnread'),
        drilldown: {
          nguon: 'GET /api/notifications',
          chuaDoc: metrics.unread,
        },
      },
    ];
  }, [metrics, t]);

  const activities = useMemo(() => {
    const rm = (n) => t('dashboard.relMinutes', { n });
    const rh = (n) => t('dashboard.relHours', { n });
    return [
      {
        user: 'Sarah Chen',
        action: t('dashboard.demo1Action'),
        item: t('dashboard.demo1Item'),
        time: rm(2),
        avatar: '👩‍💼',
        type: 'task',
        color: 'from-emerald-500 to-teal-600',
        detailEntries: [
          { label: t('dashboard.lblProject'), value: t('dashboard.demo1vProject') },
          { label: t('dashboard.lblDuration'), value: t('dashboard.demo1vDuration') },
          { label: t('dashboard.lblTags'), value: t('dashboard.demo1vTags') },
        ],
      },
      {
        user: 'Mike Ross',
        action: t('dashboard.demo2Action'),
        item: t('dashboard.demo2Item'),
        time: rm(15),
        avatar: '👨‍💻',
        type: 'file',
        color: 'from-blue-500 to-sky-600',
        detailEntries: [
          { label: t('dashboard.lblSize'), value: t('dashboard.demo2vSize') },
          { label: t('dashboard.lblFolder'), value: t('dashboard.demo2vFolder') },
          { label: t('dashboard.lblDownloads'), value: t('dashboard.demo2vDownloads') },
        ],
      },
      {
        user: 'Emma Wilson',
        action: t('dashboard.demo3Action'),
        item: t('dashboard.demo3Item'),
        time: rh(1),
        avatar: '👩‍🎨',
        type: 'message',
        color: 'from-cyan-600 to-teal-600',
        detailEntries: [
          { label: t('dashboard.lblMembers'), value: t('dashboard.demo3vMembers') },
          { label: t('dashboard.lblCategory'), value: t('dashboard.demo3vCategory') },
          { label: t('dashboard.lblDescription'), value: t('dashboard.demo3vDesc') },
        ],
      },
      {
        user: 'David Kim',
        action: t('dashboard.demo4Action'),
        item: t('dashboard.demo4Item'),
        time: rh(2),
        avatar: '👨‍🔬',
        type: 'task',
        color: 'from-amber-500 to-orange-600',
        detailEntries: [
          { label: t('dashboard.lblDuration'), value: t('dashboard.demo4vDuration') },
          { label: t('dashboard.lblParticipants'), value: t('dashboard.demo4vParticipants') },
          { label: t('dashboard.lblRecording'), value: t('dashboard.lblYes') },
        ],
      },
      {
        user: 'Lisa Park',
        action: t('dashboard.demo5Action'),
        item: t('dashboard.demo5Item'),
        time: rh(3),
        avatar: '👩‍💼',
        type: 'message',
        color: 'from-sky-500 to-cyan-600',
        detailEntries: [
          { label: t('dashboard.lblComments'), value: t('dashboard.demo5vComments') },
          { label: t('dashboard.lblMentions'), value: t('dashboard.demo5vMentions') },
          { label: t('dashboard.lblProject'), value: t('dashboard.demo5vProject') },
        ],
      },
      {
        user: 'Alex Nguyen',
        action: t('dashboard.demo6Action'),
        item: t('dashboard.demo6Item'),
        time: rh(5),
        avatar: '🧑‍💼',
        type: 'file',
        color: 'from-cyan-500 to-blue-600',
        detailEntries: [{ label: t('dashboard.lblProject'), value: t('dashboard.demo1vProject') }],
      },
    ];
  }, [t]);

  const filteredActivities =
    activeFilter === 'all'
      ? activities
      : activities.filter((a) =>
          activeFilter === 'tasks'
            ? a.type === 'task'
            : activeFilter === 'messages'
              ? a.type === 'message'
              : activeFilter === 'files'
                ? a.type === 'file'
                : true
        );

  const activityTypeLabel = (type) =>
    type === 'task'
      ? t('dashboard.activityTypeTask')
      : type === 'file'
        ? t('dashboard.activityTypeFile')
        : type === 'message'
          ? t('dashboard.activityTypeMessage')
          : t('dashboard.activityTypeDefault');

  /** Điều hướng từ modal chỉ số — khớp `stats[].key` */
  const getStatDetailRoute = (key) => {
    switch (key) {
      case 'org':
        return { path: '/organizations', cta: t('dashboard.statOpenOrg') };
      case 'tasks':
        return { path: '/tasks', cta: t('dashboard.statOpenTasks') };
      case 'friends':
        return { path: '/friends', cta: t('dashboard.statOpenFriends') };
      case 'notify':
        return { path: '/notifications', cta: t('dashboard.statOpenNotify') };
      default:
        return null;
    }
  };

  const navigateFromActivityType = (type) => {
    if (type === 'task') navigate('/tasks');
    else if (type === 'file') navigate('/documents');
    else if (type === 'message') navigate('/chat/friends');
    else navigate('/notifications');
  };

  const exportDashboardSnapshot = () => {
    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        metrics,
        displayName,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'voicehub-dashboard-snapshot.json';
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('dashboard.exportOk'));
    } catch {
      toast.error(t('dashboard.exportErr'));
    }
  };

  const shareDashboardLink = async () => {
    const url = `${window.location.origin}/dashboard`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('dashboard.shareOk'));
    } catch {
      toast(url, { icon: '🔗' });
    }
  };

  const shellH = landingDemo ? 'min-h-[760px] h-[760px]' : 'h-screen';

  return (
    <>
    <div className={`relative flex ${shellH} overflow-hidden ${shellBg}`}>
      <ShellWaveBackdrop />
      <div className="relative z-[1] h-full shrink-0">
        <NavigationSidebar landingDemo={landingDemo} />
      </div>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className={`flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-6 ${dashHeader}`}>
          <p className={`max-w-[40%] truncate text-sm font-medium md:max-w-none md:text-[15px] ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>
            {getGreeting()}
          </p>
          <div className="relative min-w-0 flex-1 md:mx-auto md:max-w-xl">
            <button
              type="button"
              className={`absolute left-2 top-1/2 z-[1] -translate-y-1/2 rounded-lg p-1.5 transition ${isDarkMode ? 'text-[#9ca3af] hover:bg-white/[0.06] hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              aria-label={t('dashboard.ariaSearch')}
              onClick={() => setQuickNavOpen(true)}
            >
              <Search className="h-4 w-4" strokeWidth={2} />
            </button>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setQuickNavOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setQuickNavOpen(true);
                }
              }}
              placeholder={t('dashboard.searchPlaceholder')}
              className={`w-full rounded-2xl py-2.5 pl-11 pr-4 text-sm outline-none transition ${inputSurface}`}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className={`relative rounded-xl p-2.5 transition ${isDarkMode ? 'text-[#9ca3af] hover:bg-white/[0.06] hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
              aria-label={t('dashboard.ariaNotifications')}
            >
              <Bell className="h-5 w-5" strokeWidth={2} />
              {(metrics.unread > 0 || metrics.pendingCount > 0) && (
                <span
                  className={`absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ${isDarkMode ? 'ring-[#0D0D0F]' : 'ring-white'}`}
                />
              )}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className={`min-h-0 flex-1 overflow-y-auto overflow-x-visible px-4 py-5 scrollbar-overlay md:px-6 lg:px-8 ${dashMain}`}>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className={`mb-1 text-[11px] font-bold uppercase tracking-[0.18em] ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>{t('dashboard.kicker')}</p>
                <h1 className={`text-3xl font-bold tracking-tight md:text-4xl ${textHeading}`}>{t('dashboard.heading')}</h1>
                <p className={`mt-1 text-base leading-relaxed ${textMuted}`}>{t('dashboard.sub')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.12)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  {t('dashboard.live')}
                </span>
                <Dropdown
                  trigger={
                    <button
                      type="button"
                      className={`rounded-xl border p-2 transition ${isDarkMode ? 'border-white/[0.08] bg-[#1A1A1C] text-[#9ca3af] hover:bg-white/[0.06] hover:text-white' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                    >
                      <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                    </button>
                  }
                  align="right"
                >
                  {(close) => (
                    <div className="p-2">
                      <button
                        type="button"
                        className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}`}
                        onClick={() => {
                          document.getElementById('vh-dashboard-activity')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          toast(t('dashboard.customizeToast'), { icon: 'ℹ️' });
                          close();
                        }}
                      >
                        {t('dashboard.customize')}
                      </button>
                      <button
                        type="button"
                        className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}`}
                        onClick={() => {
                          exportDashboardSnapshot();
                          close();
                        }}
                      >
                        {t('dashboard.exportReport')}
                      </button>
                      <button
                        type="button"
                        className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}`}
                        onClick={() => {
                          shareDashboardLink();
                          close();
                        }}
                      >
                        {t('dashboard.share')}
                      </button>
                      <button
                        type="button"
                        className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}`}
                        onClick={() => {
                          setShowNewProjectModal(true);
                          close();
                        }}
                      >
                        {t('dashboard.newProject')}
                      </button>
                      <div className={`my-2 h-px ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
                      <button
                        type="button"
                        className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'}`}
                        onClick={() => {
                          navigate('/settings');
                          close();
                        }}
                      >
                        {t('dashboard.settings')}
                      </button>
                    </div>
                  )}
                </Dropdown>
              </div>
            </div>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat, idx) => (
              <GlassCard
                key={idx}
                hover
                onClick={() => setSelectedStat(stat)}
                className={`group relative cursor-pointer overflow-hidden rounded-2xl p-4 transition duration-300 ${cardSurface} ${isDarkMode ? 'shadow-[0_8px_32px_rgba(0,0,0,0.35)] hover:border-white/[0.1] hover:shadow-[0_12px_48px_rgba(0,0,0,0.5)]' : 'shadow-md hover:border-cyan-200/80 hover:shadow-lg'}`}
                style={{ animationDelay: `${idx * 0.06}s` }}
              >
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.07]`}
                />
                <div className="relative z-10">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${stat.iconBg || stat.color} text-lg shadow-[0_4px_20px_rgba(8,145,178,0.25)]`}
                    >
                      {stat.icon}
                    </div>
                    <div className="text-right">
                      <div
                        className={`flex items-center justify-end gap-0.5 text-xs font-bold ${stat.trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}
                      >
                        <span>{stat.trend === 'up' ? '↗' : '↘'}</span>
                        <span>{stat.change}</span>
                      </div>
                      <div className={`mt-1 flex justify-end ${stat.sparkClass || 'text-emerald-400/90'}`}>
                        <MiniSparkline up={stat.trend === 'up'} />
                      </div>
                    </div>
                  </div>
                  <div className={`mb-0.5 text-3xl font-bold tabular-nums tracking-tight ${textHeading}`}>{stat.value}</div>
                  <div className={`mb-1 text-sm font-medium ${textMuted}`}>{stat.label}</div>
                  <div className={`text-xs leading-relaxed ${textSub}`}>{stat.detail}</div>
                  <div className={`mt-3 text-[11px] font-medium opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${accentText}`}>
                    {t('dashboard.viewDetails')}
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          <div id="vh-dashboard-activity">
          <GlassCard className={`mb-2 ${cardSurface} ${isDarkMode ? 'shadow-[0_8px_32px_rgba(0,0,0,0.25)]' : 'shadow-md'}`}>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600/90 to-teal-700/85 text-lg text-white shadow-lg">
                  ⚡
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${textHeading}`}>{t('dashboard.activityRecent')}</h2>
                  <p className={`mt-0.5 text-sm ${textSub}`}>
                    <span className={`font-semibold ${accentText}`}>
                      {t('dashboard.eventsCount', { n: filteredActivities.length })}
                    </span>
                    <span className="mx-1.5">·</span>
                    {t('dashboard.activityFeedNote')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: t('dashboard.filterAll') },
                  { id: 'tasks', label: t('dashboard.filterTasks') },
                  { id: 'files', label: t('dashboard.filterFiles') },
                  { id: 'messages', label: t('dashboard.filterMessages') },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFilter(f.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      activeFilter === f.id
                        ? isDarkMode
                          ? 'bg-cyan-600 text-white shadow-[0_0_20px_rgba(8,145,178,0.35)]'
                          : 'bg-cyan-600 text-white shadow-md'
                        : isDarkMode
                          ? 'border border-white/[0.06] bg-[#141416] text-[#9ca3af] hover:border-white/10 hover:bg-white/[0.04] hover:text-white'
                          : 'border border-slate-200 bg-slate-100 text-slate-600 hover:border-cyan-200 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative space-y-0">
              <div
                className={`absolute bottom-0 left-[19px] top-2 w-px bg-gradient-to-b to-transparent ${isDarkMode ? 'from-cyan-500/50 via-white/10' : 'from-cyan-500/40 via-slate-200'}`}
                aria-hidden
              />
              {filteredActivities.map((activity, idx) => (
                <div
                  key={idx}
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowActivityDetail(activity)}
                  onKeyDown={(e) => e.key === 'Enter' && setShowActivityDetail(activity)}
                  className={`group relative flex gap-4 border-b py-4 pl-1 pr-2 transition-colors last:border-0 ${isDarkMode ? 'border-white/[0.04] hover:bg-white/[0.02]' : 'border-slate-100 hover:bg-slate-50'}`}
                >
                  <div className="relative z-10 flex shrink-0 flex-col items-center pt-0.5">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br ${activity.color} ring-4 ${isDarkMode ? 'ring-[#1A1A1C]' : 'ring-white'}`}
                    />
                    <div
                      className={`mt-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${activity.color} text-xs font-bold text-white shadow-md`}
                    >
                      {initialsFromName(activity.user)}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-[#e5e7eb]' : 'text-slate-700'}`}>
                      <span className={`font-semibold ${textHeading}`}>{activity.user}</span>{' '}
                      <span className={textMuted}>{activity.action}</span>{' '}
                      <span className={`font-semibold ${accentText}`}>{activity.item}</span>
                    </p>
                    {activity.detailEntries?.[0] && (
                      <p className={`mt-1 text-xs ${textSub}`}>{activity.detailEntries[0].value}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                        isDarkMode
                          ? 'border-white/10 bg-white/[0.04] text-[#d1d5db]'
                          : 'border-slate-300 bg-slate-200/90 text-slate-800'
                      }`}
                    >
                      {activityTypeLabel(activity.type)}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${isDarkMode ? 'text-[#9ca3af]' : 'text-slate-600'}`}
                    >
                      {activity.time}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className={`mt-2 w-full rounded-xl border py-2.5 text-sm transition ${isDarkMode ? 'border-white/[0.06] bg-[#141416] text-[#9ca3af] hover:border-white/10 hover:bg-white/[0.04] hover:text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-cyan-200 hover:bg-white hover:text-slate-900'}`}
            >
              {t('dashboard.viewAll')}
            </button>
          </GlassCard>
          </div>
          </main>

      <aside className={`flex w-80 shrink-0 flex-col overflow-hidden ${dashAside}`}>
        <div className="flex-1 min-h-0 space-y-6 overflow-y-auto overflow-x-visible p-4 scrollbar-overlay">
          <div className="space-y-2">
            <p className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>{t('dashboard.quickAccess')}</p>
            {[
              {
                ch: t('dashboard.channelChat'),
                badge: t('dashboard.badgeNew'),
                badgeTone: 'cyan',
                path: '/chat/organization',
              },
              { ch: t('dashboard.channelDesign'), badge: null, badgeTone: null, path: '/chat' },
              {
                ch: t('dashboard.channelGeneral'),
                badge: t('dashboard.badgeTwo'),
                badgeTone: 'sky',
                path: '/organizations',
              },
            ].map((row, i) => {
              const badgeCls =
                row.badgeTone === 'cyan'
                  ? isDarkMode
                    ? 'bg-cyan-500/15 text-cyan-100'
                    : 'bg-cyan-100 text-cyan-950'
                  : row.badgeTone === 'sky'
                    ? isDarkMode
                      ? 'bg-sky-500/20 text-sky-100'
                      : 'bg-sky-100 text-sky-950'
                    : isDarkMode
                      ? 'bg-white/10 text-gray-200'
                      : 'bg-slate-200 text-slate-900';
              return (
              <button
                key={i}
                type="button"
                onClick={() => navigate(row.path)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition ${isDarkMode ? 'border-white/[0.05] bg-[#1A1A1C] text-[#e5e7eb] hover:border-cyan-500/35 hover:bg-white/[0.03]' : 'border-slate-200 bg-white text-slate-800 hover:border-cyan-300 hover:bg-slate-50'}`}
              >
                <span className="font-medium">{row.ch}</span>
                {row.badge && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badgeCls}`}>
                    {row.badge}
                  </span>
                )}
              </button>
              );
            })}
          </div>

          <div className="space-y-2">

            {!metrics.loading && metrics.pendingCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('/friends')}
                className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${
                  isDarkMode
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'border-emerald-600/30 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                {t('dashboard.pendingInvites', { n: metrics.pendingCount })}
              </button>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>{t('dashboard.meetingsTitle')}</h3>
              <button
                type="button"
                onClick={() => navigate('/calendar')}
                className={`text-[11px] font-semibold ${isDarkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-600'}`}
              >
                {t('dashboard.viewAllShort')}
              </button>
            </div>
            <div className="space-y-3">
              {!metrics.loading && upcomingMeetings.length === 0 && (
                <p className={`text-xs ${textSub}`}>{t('dashboard.noMeetingsWeek')}</p>
              )}
              {upcomingMeetings.map((event, idx) => {
                const borderColors = ['border-l-blue-500', 'border-l-emerald-500', 'border-l-amber-500'];
                const bc = borderColors[idx % borderColors.length];
                return (
                  <div
                    key={event.id != null ? String(event.id) : idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate('/calendar')}
                    onKeyDown={(e) => e.key === 'Enter' && navigate('/calendar')}
                    className={`cursor-pointer rounded-xl border p-3 pl-3 ${bc} border-l-4 shadow-sm transition ${isDarkMode ? 'border-white/[0.06] bg-[#1A1A1C] hover:bg-white/[0.02]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  >
                    <div className={`text-sm font-semibold ${textHeading}`}>{event.title}</div>
                    <div className={`mt-1 text-xs ${textMuted}`}>
                      {event.time} · {t('dashboard.peopleUnit', { n: event.attendees })}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/calendar');
                      }}
                      className={`mt-3 w-full rounded-lg py-2 text-xs font-semibold transition ${isDarkMode ? 'bg-cyan-600/20 text-cyan-200 hover:bg-cyan-600/30' : 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200'}`}
                    >
                      {t('dashboard.joinMeetingBtn')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>{t('dashboard.groupStatus')}</h3>
              <span
                className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-400/90' : 'text-emerald-800'}`}
              >
                {onlineFriendCount} online
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {displayPresenceFriends.slice(0, 9).map((pf, idx) => (
                <div key={pf.id != null ? String(pf.id) : idx} className="flex flex-col items-center text-center">
                  <button
                    type="button"
                    onClick={() => navigate('/chat/friends')}
                    className="relative rounded-full outline-none ring-offset-2 ring-offset-transparent transition hover:ring-2 hover:ring-cyan-500/40 focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                    aria-label={t('friendChat.openChatAria', { name: pf.name })}
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${
                        ['from-cyan-600 to-teal-600', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-600'][idx % 3]
                      } text-xs font-bold text-white`}
                    >
                      {pf.avatarUrl ? (
                        <img src={pf.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        initialsFromName(pf.name)
                      )}
                    </div>
                    <StatusIndicator status={pf.status} />
                  </button>
                  <span
                    className={`mt-1 w-full truncate text-xs font-medium ${isDarkMode ? 'text-[#d1d5db]' : 'text-slate-800'}`}
                  >
                    {pf.name.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate('/chat/friends')}
              className={`mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold transition ${isDarkMode ? 'border-white/[0.08] text-[#9ca3af] hover:bg-white/[0.04] hover:text-white' : 'border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-900'}`}
            >
              {t('dashboard.openFriendChat')}
            </button>
          </div>

          <div className={`rounded-2xl border p-3 ${cardSurface}`}>
            <h3 className={`mb-3 text-xs font-bold uppercase tracking-wider ${textSub}`}>{t('dashboard.weekActivity')}</h3>
            <div className="flex h-24 items-end justify-between gap-1">
              {[45, 62, 38, 70, 55, 88, 72].map((h, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate('/analytics')}
                  className="flex flex-1 flex-col items-center gap-1 rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                  aria-label={`Xem phân tích — ${['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][idx]}`}
                >
                  <div
                    className={`w-full max-w-[28px] rounded-t-md transition-all ${
                      idx >= 5 ? 'bg-gradient-to-t from-cyan-600 to-teal-500' : 'bg-gradient-to-t from-slate-600 to-slate-500'
                    }`}
                    style={{ height: `${h}%` }}
                  />
                  <span
                    className={`text-[10px] font-medium sm:text-xs ${isDarkMode ? 'text-[#6b7280]' : 'text-slate-600'}`}
                  >
                    {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][idx]}
                  </span>
                </button>
              ))}
            </div>
            <p
              className={`mt-2 text-center text-xs ${isDarkMode ? 'text-emerald-400/90' : 'text-emerald-800'}`}
            >
              {t('dashboard.vsLastWeek')}
            </p>
          </div>

          <div className={`rounded-2xl border p-3.5 ${isDarkMode ? 'border-white/[0.06] bg-[#141416]' : 'border-slate-200 bg-slate-50'}`}>
            <h3 className={`mb-3 text-xs font-bold uppercase tracking-wider ${textSub}`}>{t('dashboard.quickStats')}</h3>
            <div className="space-y-2.5">
              {[
                {
                  label: t('dashboard.statUnread'),
                  value: metrics.loading ? '…' : String(metrics.unread),
                  icon: '🔔',
                  path: '/notifications',
                },
                {
                  label: t('dashboard.statInvites'),
                  value: metrics.loading ? '…' : String(metrics.pendingCount),
                  icon: '👋',
                  path: '/friends',
                },
                {
                  label: t('dashboard.statFriends'),
                  value: metrics.loading ? '…' : metrics.friendsTotal == null ? '—' : String(metrics.friendsTotal),
                  icon: '👥',
                  path: '/friends',
                },
              ].map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => navigate(s.path)}
                  className={`flex w-full items-center justify-between rounded-lg text-left text-sm transition ${isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100'}`}
                >
                  <span className={`flex items-center gap-2 ${textMuted}`}>
                    <span>{s.icon}</span>
                    {s.label}
                  </span>
                  <span className={`font-bold ${accentText}`}>{s.value}</span>
                </button>
              ))}
            </div>
            <GradientButton
              type="button"
              variant="primary"
              className="mt-4 w-full py-3 text-sm font-semibold shadow-[0_8px_24px_rgba(8,145,178,0.22)]"
              onClick={() => setShowAddFriendModal(true)}
            >
              {t('dashboard.addFriend')}
            </GradientButton>
          </div>
        </div>
      </aside>
        </div>
      </div>
    </div>

    <AddFriendModal
      isOpen={showAddFriendModal}
      onClose={() => setShowAddFriendModal(false)}
      onFriendlistChanged={() => setMetricsTick((t) => t + 1)}
    />

    {/* Welcome Greeting Modal (hiển thị 1 lần sau khi đăng nhập / vào web) */}
    <Modal
      isOpen={showWelcome}
      onClose={() => setShowWelcome(false)}
      title={t('dashboard.welcomeTitle')}
      size="sm"
    >
      <div className="space-y-4">
        <p className={`text-base font-semibold ${textHeading}`}>{getGreeting()}</p>
        <p className={`text-sm ${textMuted}`}>{t('dashboard.welcomeBody', { name: displayName })}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={modalSecondaryBtnSm} onClick={() => setShowWelcome(false)}>
            {t('dashboard.close')}
          </button>
          <GradientButton
            variant="primary"
            onClick={() => setShowWelcome(false)}
            className="px-4 py-2 text-sm"
          >
            {t('dashboard.startWork')}
          </GradientButton>
        </div>
      </div>
    </Modal>

    {/* Stat Detail Modal */}
    <Modal
      isOpen={selectedStat !== null}
      onClose={() => setSelectedStat(null)}
      title={selectedStat?.label || t('dashboard.statModalTitle')}
      size="lg"
    >
        {selectedStat && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className={modalGlass}>
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedStat.color} flex items-center justify-center text-3xl mb-4 mx-auto`}>
                  {selectedStat.icon}
                </div>
                <div className={`text-4xl font-black text-center mb-2 ${textHeading}`}>{selectedStat.value}</div>
                <div className={`${textMuted} text-center`}>{selectedStat.label}</div>
              </GlassCard>

              <GlassCard className={modalGlass}>
                <h4 className={`font-bold mb-4 ${textHeading}`}>{t('dashboard.modalStatsTitle')}</h4>
                <div className="space-y-3">
                  {Object.entries(selectedStat.drilldown).filter(([key]) => !['projects', 'nguoiDongGopNhieuNhat', 'roles', 'channels'].includes(key)).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className={`${textMuted} capitalize`}>{key}:</span>
                      <span className={`font-bold ${textHeading}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {selectedStat.key && getStatDetailRoute(selectedStat.key) && (
              <div className="flex flex-wrap justify-center gap-2">
                <GradientButton
                  variant="primary"
                  className="px-6 py-2.5 text-sm"
                  onClick={() => {
                    const link = getStatDetailRoute(selectedStat.key);
                    if (link) {
                      navigate(link.path);
                      setSelectedStat(null);
                    }
                  }}
                >
                  {getStatDetailRoute(selectedStat.key).cta}
                </GradientButton>
              </div>
            )}

            {selectedStat.drilldown.projects && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.modalProjectsTitle')}</h4>
                <div className="space-y-3">
                  {selectedStat.drilldown.projects.map((project, idx) => (
                    <GlassCard key={idx} hover className={modalGlass}>
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className={`font-bold ${textHeading}`}>{project.name}</h5>
                        <span className={`text-sm ${textMuted}`}>
                          {t('dashboard.deadlineLeft', { deadline: project.deadline })}
                        </span>
                      </div>
                      <div className="mb-2 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="h-2 w-full overflow-hidden rounded-full glass-strong">
                            <div className="h-full bg-gradient-to-r from-cyan-600 to-teal-600" style={{ width: `${project.progress}%` }} />
                          </div>
                        </div>
                        <span className={`text-sm font-bold ${textHeading}`}>{project.progress}%</span>
                      </div>
                      <div className={`text-xs ${textMuted}`}>
                        {t('dashboard.membersCount', { n: project.members })}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.nguoiDongGopNhieuNhat && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.topContributors')}</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.nguoiDongGopNhieuNhat.map((user, idx) => (
                    <div key={idx} className={modalRow}>
                      <div className="text-2xl">{user.avatar}</div>
                      <div className="flex-1">
                        <div className={`font-semibold ${textHeading}`}>{user.name}</div>
                        <div className={`text-xs ${textMuted}`}>
                          {t('dashboard.tasksCount', { n: user.tasks })}
                        </div>
                      </div>
                      <div className="font-bold text-emerald-600 dark:text-green-400">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.roles && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.roleDistribution')}</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.roles.map((role, idx) => (
                    <div key={idx} className={modalRow}>
                      <div className="flex-1">
                        <div className={`font-semibold ${textHeading}`}>{role.name}</div>
                        <div className={`text-xs ${textMuted}`}>
                          {role.online}/{role.count} online
                        </div>
                      </div>
                      <div className="h-2 w-24 overflow-hidden rounded-full glass-strong">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                          style={{ width: `${(role.online / role.count) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.channels && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.activeChannels')}</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.channels.map((channel, idx) => (
                    <div key={idx} className={modalRowBetween}>
                      <div>
                        <div className={`font-semibold ${textHeading}`}>{channel.name}</div>
                        <div className={`text-xs ${textMuted}`}>
                          {t('dashboard.messagesCount', { n: channel.messages })}
                        </div>
                      </div>
                      {channel.unread > 0 && (
                        <div className="rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">{channel.unread}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </Modal>

    {/* Activity Detail Modal */}
    <Modal
        isOpen={showActivityDetail !== null}
        onClose={() => setShowActivityDetail(null)}
        title={t('dashboard.activityDetailTitle')}
        size="md"
      >
        {showActivityDetail && (
          <div className="space-y-4">
            <div className={modalHeroRow}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-2xl ${showActivityDetail.color}`}>
                {showActivityDetail.avatar}
              </div>
              <div>
                <h3 className={`text-lg font-bold ${textHeading}`}>{showActivityDetail.user}</h3>
                <p className={`text-sm ${textMuted}`}>
                  {showActivityDetail.action} {showActivityDetail.item}
                </p>
                <p className={`text-sm ${textSub}`}>{showActivityDetail.time}</p>
              </div>
            </div>

            <GlassCard className={modalGlass}>
              <h4 className={`mb-3 font-bold ${textHeading}`}>{t('dashboard.info')}</h4>
              <div className="space-y-2">
                {(showActivityDetail.detailEntries || []).map((row, i) => (
                  <div key={i} className={`flex items-center justify-between py-2 ${modalDetailRowBorder}`}>
                    <span className={textMuted}>{row.label}</span>
                    <span className={`font-semibold ${textHeading}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="flex gap-3">
              <GradientButton
                variant="primary"
                className="flex-1 text-sm"
                onClick={() => {
                  const act = showActivityDetail;
                  setShowActivityDetail(null);
                  navigateFromActivityType(act.type);
                }}
              >
                {t('dashboard.viewDetail')}
              </GradientButton>
              <button
                type="button"
                onClick={async () => {
                  const line = `${showActivityDetail.user} ${showActivityDetail.action} ${showActivityDetail.item}`;
                  try {
                    await navigator.clipboard.writeText(line);
                    toast.success(t('dashboard.copyOk'));
                  } catch {
                    toast(line, { icon: '📋' });
                  }
                }}
                className={`flex-1 ${modalSecondaryBtn}`}
              >
                {t('dashboard.share')}
              </button>
            </div>
          </div>
        )}
    </Modal>

    {/* New Project Modal */}
    <Modal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        title={t('dashboard.newProjectTitle')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={modalLabel}>{t('dashboard.projectName')}</label>
            <input
              type="text"
              placeholder={t('dashboard.projectNamePh')}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`}
            />
          </div>

          <div>
            <label className={modalLabel}>{t('dashboard.projectDescLabel')}</label>
            <textarea
              placeholder={t('dashboard.projectDescPh')}
              rows={4}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={modalLabel}>{t('dashboard.projectStartDate')}</label>
              <input type="date" className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`} />
            </div>
            <div>
              <label className={modalLabel}>{t('dashboard.projectDeadline')}</label>
              <input type="date" className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`} />
            </div>
          </div>

          <div>
            <label className={modalLabel}>{t('dashboard.membersSection')}</label>
            <div className="mb-3 flex flex-wrap gap-2">
              {['👩‍💼 Sarah', '👨‍💻 Mike', '👩‍🎨 Emma', '👨‍🔬 David'].map((member, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={modalChip}
                  onClick={() => toast(t('dashboard.toastPickMember', { member }), { icon: '✓' })}
                >
                  {member}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`text-sm transition-colors ${accentText} hover:underline`}
              onClick={() => toast(t('dashboard.toastInviteLater'), { icon: 'ℹ️' })}
            >
              {t('dashboard.addMemberBtn')}
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <GradientButton
              variant="primary"
              className="flex-1 text-sm"
              onClick={() => {
                toast.success(t('dashboard.projectCreated'));
                setShowNewProjectModal(false);
              }}
            >
              {t('dashboard.createProjectBtn')}
            </GradientButton>
            <button type="button" onClick={() => setShowNewProjectModal(false)} className={`flex-1 ${modalSecondaryBtn}`}>
              {t('nav.cancel')}
            </button>
          </div>
        </div>
    </Modal>

    <DashboardGlobalSearchModal
      isOpen={quickNavOpen}
      onClose={() => setQuickNavOpen(false)}
      layer1Query={searchQuery}
    />

  </>
  );
}

export default DashboardPage;
