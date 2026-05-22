import { Bell } from 'lucide-react';
import { AppSearchField } from '../../features/search';
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import AddFriendModal from '../../components/Friends/AddFriendModal';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import ShellWaveBackdrop from '../../components/Layout/ShellWaveBackdrop';
import { GlassCard, GradientButton, Modal, StatusIndicator } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { meetingAPI } from '../../services/api/meetingAPI';
import { taskAPI } from '../../services/api/taskAPI';
import {
  useDashboardSummary,
  useFriendPending,
  useFriendsList,
  useNotificationsPreview,
  useOrganizationsMy,
} from '../../hooks/queries';
import { appShellBg } from '../../theme/shellTheme';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import DashboardGlobalSearchModal from '../../components/Dashboard/DashboardGlobalSearchModal';
import UserAvatar from '../../components/Shared/UserAvatar';
import { getUserDisplayName } from '../../utils/helpers';

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

function truncateText(value, maxLength = 56) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isValidObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

/** Chuẩn hóa yyyy-mm-dd theo giờ local */
function dayKeyFromDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tổng task done trong org — đã dùng ở thẻ chỉ số (từng org gọi GET /statistics). */
async function sumTaskDoneAcrossOrgs(orgIds) {
  if (!Array.isArray(orgIds) || orgIds.length === 0) {
    return { total: 0, allFailed: false };
  }
  let total = 0;
  let failures = 0;
  await Promise.all(
    orgIds.map(async (oid) => {
      const raw = await taskAPI.getStatistics(oid).catch(() => null);
      if (!raw) {
        failures += 1;
        return;
      }
      const stats = raw?.data?.data ?? raw?.data ?? raw;
      const done = Number(stats?.done);
      if (!Number.isFinite(done)) failures += 1;
      else total += done;
    })
  );
  return { total, allFailed: failures === orgIds.length };
}

async function fetchMessagesForDashboardPaged(api, { maxPages = 3, limit = 50 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const msgRes = await api.get('/messages', { params: { limit, page }, skipGlobalErrorHandling: true }).catch(() => null);
    if (!msgRes) break;
    const msgBody = msgRes?.data?.data ?? msgRes?.data ?? msgRes;
    const batch = Array.isArray(msgBody?.messages) ? msgBody.messages : [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

async function fetchTasksForDashboardPaged({ maxPages = 3, limit = 50 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await taskAPI.getTasks({ limit, page }).catch(() => null);
    if (!res) break;
    const body = res?.data?.data ?? res?.data ?? res;
    const batch = Array.isArray(body?.tasks) ? body.tasks : [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

/**
 * Lưới đóng góp kiểu GitHub: mỗi cột một tuần (Chủ nhật trên → Thứ bảy dưới).
 * Ngày ngoài năm chọn được render trong lưới nhưng inYear=false (ô trong suốt).
 */
function buildGithubYearGrid(year, dailyMap, locale) {
  const yearStart = new Date(year, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(year, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);

  const jan1 = new Date(year, 0, 1);
  jan1.setHours(0, 0, 0, 0);
  const startDow = jan1.getDay();
  const gridStart = new Date(jan1);
  gridStart.setDate(jan1.getDate() - startDow);

  const dec31 = new Date(year, 11, 31);
  dec31.setHours(0, 0, 0, 0);
  const endDow = dec31.getDay();
  const gridEnd = new Date(dec31);
  gridEnd.setDate(dec31.getDate() + (6 - endDow));

  const msPerDay = 86400000;
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / msPerDay) + 1;
  const numWeeks = totalDays / 7;

  const weeks = [];
  for (let w = 0; w < numWeeks; w += 1) {
    const col = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(gridStart.getTime() + (w * 7 + d) * msPerDay);
      date.setHours(12, 0, 0, 0);
      const key = dayKeyFromDate(date);
      const t = date.getTime();
      const inYear = t >= yearStart.getTime() && t <= yearEnd.getTime();
      let tasks = 0;
      let messages = 0;
      if (inYear && dailyMap && typeof dailyMap === 'object') {
        const bucket = dailyMap[key];
        tasks = bucket?.tasks || 0;
        messages = bucket?.messages || 0;
      }
      col.push({
        key,
        date,
        inYear,
        tasks,
        messages,
        total: tasks + messages,
      });
    }
    weeks.push(col);
  }

  const monthLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < numWeeks; w += 1) {
    let label = '';
    for (let d = 0; d < 7; d += 1) {
      const cell = weeks[w][d];
      if (cell.inYear) {
        const m = cell.date.getMonth();
        if (m !== lastMonth) {
          label = cell.date.toLocaleDateString(monthLocale, { month: 'short' });
          lastMonth = m;
        }
        break;
      }
    }
    monthLabels.push(label);
  }

  return { weeks, monthLabels, numWeeks };
}

function githubContributionCellClass(total, isDarkMode) {
  const n = Math.max(0, Number(total) || 0);
  if (isDarkMode) {
    if (n === 0) return 'bg-[#161b22] border border-[#30363d]/60';
    if (n === 1) return 'bg-[#0e4429] border border-[#30363d]/40';
    if (n <= 3) return 'bg-[#006d32] border border-[#30363d]/35';
    if (n <= 6) return 'bg-[#26a641] border border-[#30363d]/25';
    return 'bg-[#39d353] border border-[#30363d]/20';
  }
  if (n === 0) return 'bg-slate-100 border border-slate-200/90';
  if (n === 1) return 'bg-emerald-200 border border-emerald-300/70';
  if (n <= 3) return 'bg-emerald-300 border border-emerald-400/70';
  if (n <= 6) return 'bg-emerald-400 border border-emerald-500/70';
  return 'bg-emerald-500 border border-emerald-600/80';
}



function DashboardPage({ landingDemo = false, demoVariant = 'default' } = {}) {
  const [activeFilter, setActiveFilter] = useState(() =>
    landingDemo && demoVariant === 'tasks' ? 'tasks' : 'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatKey, setSelectedStatKey] = useState(null);
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
  const [workspaceEntries, setWorkspaceEntries] = useState([]);
  /** Map yyyy-mm-dd -> { tasks, messages } để heatmap đóng góp theo năm */
  const [activityDailyMap, setActivityDailyMap] = useState({});
  const [activityYear, setActivityYear] = useState(() => new Date().getFullYear());
  const [weeklyActivityDays, setWeeklyActivityDays] = useState([]);
  const [weeklyActivityNotes, setWeeklyActivityNotes] = useState([]);
  const [recentDmContacts, setRecentDmContacts] = useState([]);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const { user } = useAuth();
  const { onlineUsers, connected: socketConnected } = useSocket();
  const navigate = useLandingSafeNavigate(landingDemo);
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const currentUserKey = String(user?.userId || user?._id || user?.id || '').trim();

  const orgsQuery = useOrganizationsMy({ enabled: !landingDemo });
  const summaryQuery = useDashboardSummary({ enabled: !landingDemo });
  const friendsQuery = useFriendsList({ enabled: !landingDemo });
  const pendingQuery = useFriendPending({ enabled: !landingDemo });
  const notificationsQuery = useNotificationsPreview({ limit: 8, enabled: !landingDemo });

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
      setWorkspaceEntries([
        { id: 'demo-org-1', name: 'Alpha Corp', slug: 'alpha-corp', myRole: 'admin' },
        { id: 'demo-org-2', name: 'BetaLabs', slug: 'betalabs', myRole: 'member' },
      ]);
      const demoY = new Date().getFullYear();
      const demoDaily = {};
      for (let mi = 0; mi < 12; mi += 1) {
        const dim = new Date(demoY, mi + 1, 0).getDate();
        for (let dom = 1; dom <= dim; dom += 1) {
          if (Math.random() > 0.72) continue;
          const k = `${demoY}-${String(mi + 1).padStart(2, '0')}-${String(dom).padStart(2, '0')}`;
          demoDaily[k] = {
            tasks: Math.random() > 0.76 ? 1 : 0,
            messages: Math.floor(Math.random() * 6),
          };
        }
      }
      setActivityDailyMap(demoDaily);
      setActivityYear(demoY);
      const demoWeekLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      setWeeklyActivityDays(
        demoWeekLabels.map((label, index) => ({
          key: `demo-week-${index}`,
          dayLabel: label,
          tasks: index % 3 === 0 ? 1 : 0,
          messages: index % 2 === 0 ? 2 : 1,
          total: index % 3 === 0 ? 3 : index % 2 === 0 ? 2 : 1,
          note:
            index % 3 === 0
              ? 'Hoàn thành task UI'
              : index % 2 === 0
                ? 'Trao đổi với team'
                : 'Cập nhật trạng thái công việc',
        }))
      );
      setWeeklyActivityNotes([
        { icon: '✅', title: 'Hoàn thành task UI', detail: '2 task đã hoàn tất trong tuần này', path: '/tasks' },
        { icon: '💬', title: 'Tin nhắn công việc', detail: '3 đoạn trao đổi quan trọng được gửi', path: '/chat/friends' },
        { icon: '📝', title: 'Cập nhật tiến độ', detail: '1 task được cập nhật trạng thái', path: '/tasks' },
      ]);
      setRecentDmContacts([
        { id: 'dm-demo-1', name: 'Lan Anh', preview: 'Cập nhật mockup mới rồi nhé', time: '2 phút trước' },
        { id: 'dm-demo-2', name: 'Minh Tuấn', preview: 'Chiều họp nhanh 15p được không?', time: '12 phút trước' },
        { id: 'dm-demo-3', name: 'Hải Nam', preview: 'Mình đã gửi tài liệu qua file', time: '1 giờ trước' },
      ]);
      setRecentNotifications([
        { id: 'nt-demo-1', title: 'Nhắc hạn task', preview: 'Task UI Dashboard sắp đến hạn', time: '5 phút trước' },
        { id: 'nt-demo-2', title: 'Lời mời kết bạn', preview: 'Bạn có 1 lời mời kết bạn mới', time: '20 phút trước' },
        { id: 'nt-demo-3', title: 'Tin nhắn mới', preview: 'Bạn được nhắc trong một cuộc trò chuyện', time: '1 giờ trước' },
      ]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const orgList = Array.isArray(orgsQuery.data) ? orgsQuery.data : [];
        setWorkspaceEntries(
          orgList.slice(0, 6).map((org) => ({
            id: org?._id || org?.id,
            name: org?.name || t('dashboard.orgFallback'),
            slug: org?.slug || '',
            myRole: org?.myRole || org?.role || 'member',
          }))
        );
        const orgSlugById = new Map(
          orgList.map((org) => [String(org?._id || org?.id || ''), String(org?.slug || '')])
        );
        const summary = summaryQuery.data;
        const orgCount = summary?.orgCount ?? orgList.length;
        const orgIds = orgList
          .map((org) => String(org?._id || org?.id || '').trim())
          .filter(isValidObjectId);

        let taskDone = summary?.taskDone ?? null;
        if (taskDone == null && orgIds.length === 0) {
          taskDone = 0;
        } else if (taskDone == null && orgIds.length > 0) {
          const taskStats = await sumTaskDoneAcrossOrgs(orgIds);
          taskDone = taskStats.allFailed ? null : taskStats.total;
        }

        const friendsRaw = Array.isArray(friendsQuery.data) ? friendsQuery.data : [];
        const friendsTotal =
          summary?.friendsTotal ??
          (friendsQuery.isLoading && friendsQuery.data === undefined ? null : friendsRaw.length);

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

        let meetingsUi = [];
        const summaryMeetings = Array.isArray(summary?.upcomingMeetings)
          ? summary.upcomingMeetings
          : [];
        if (summaryMeetings.length > 0) {
          meetingsUi = summaryMeetings.map((m) => {
            const startDt = m.startTime ? new Date(m.startTime) : null;
            const timeStr =
              startDt && !Number.isNaN(startDt.getTime())
                ? startDt.toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';
            return {
              id: m.id || m._id,
              title: m.title || t('dashboard.meetingFallback'),
              time: timeStr,
              attendees: Number(m.participants) || 1,
              startTime: m.startTime,
            };
          });
        } else {
          const startFrom = new Date();
          const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
          const meetingRes = await meetingAPI
            .getMeetings({
              startFrom: startFrom.toISOString(),
              startTo: startTo.toISOString(),
              limit: 8,
            })
            .catch(() => null);
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
        }
        setUpcomingMeetings(meetingsUi);

        const pendingCount = summary?.pendingCount ?? pendingQuery.pendingCount ?? 0;
        const unread =
          summary?.unread ?? (Number(notificationsQuery.data?.unreadCount) || 0);
        const notifRows = Array.isArray(notificationsQuery.data?.notifications)
          ? notificationsQuery.data.notifications
          : [];
        const nowTs = Date.now();
        const relTime = (value) => {
          const ts = value ? new Date(value).getTime() : NaN;
          if (!Number.isFinite(ts)) return 'Vừa xong';
          const diffMin = Math.max(1, Math.floor((nowTs - ts) / 60000));
          if (diffMin < 60) return `${diffMin} phút trước`;
          const diffHours = Math.floor(diffMin / 60);
          if (diffHours < 24) return `${diffHours} giờ trước`;
          const diffDays = Math.floor(diffHours / 24);
          return `${diffDays} ngày trước`;
        };
        const dashboardRecentNotifications = notifRows.slice(0, 3).map((row, idx) => ({
          id: row?._id || row?.id || `nt-${idx}`,
          title: row?.title || 'Thông báo',
          preview: row?.content || row?.message || '',
          time: relTime(row?.createdAt),
        }));

        const dayKey = dayKeyFromDate;
        const getRowId = (value) => String(value?._id || value?.id || value || '').trim();
        const resolveWeeklyPath = ({ kind, organizationId }) => {
          const orgId = String(organizationId || '').trim();
          const orgSlug = orgId ? orgSlugById.get(orgId) : '';
          if (orgSlug) {
            return kind === 'task'
              ? `/w/${encodeURIComponent(orgSlug)}?tab=tasks`
              : `/w/${encodeURIComponent(orgSlug)}`;
          }
          return kind === 'task' ? '/tasks' : '/chat/friends';
        };
        const weekDayLabels =
          locale === 'en'
            ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const daily = {};
        const taskRows = await fetchTasksForDashboardPaged({ maxPages: 25, limit: 100 }).catch(() => []);
        const weeklyDayMap = new Map();
        const weeklyNotes = [];
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - 6);
        const weekStartTs = weekStart.getTime();
        Array.from({ length: 7 }, (_, index) => {
          const dayDate = new Date(weekStart);
          dayDate.setDate(weekStart.getDate() + index);
          const key = dayKey(dayDate);
          const weekday = dayDate.getDay();
          const entry = {
            key,
            dayLabel: weekDayLabels[weekday] || '',
            date: dayDate,
            tasks: 0,
            messages: 0,
            total: 0,
            note: '',
            noteTs: 0,
          };
          weeklyDayMap.set(key, entry);
          return entry;
        });
        const registerWeekItem = ({ when, kind, icon, title, detail, path }) => {
          const ts = new Date(when).getTime();
          if (!Number.isFinite(ts) || ts < weekStartTs) return;
          const key = dayKey(when);
          const day = weeklyDayMap.get(key);
          if (!day) return;
          if (kind === 'task') day.tasks += 1;
          else day.messages += 1;
          day.total += 1;
          if (ts >= day.noteTs) {
            day.noteTs = ts;
            day.note = detail;
            day.icon = icon;
            day.path = path;
            day.title = title;
          }
          weeklyNotes.push({ key: `${kind}:${ts}:${title}`, ts, icon, title, detail, path, dayKey: key });
        };
        taskRows.forEach((task) => {
          const taskMatchesUser =
            !currentUserKey ||
            [task.createdBy, task.assigneeId, task.completedBy].some((value) => getRowId(value) === currentUserKey);
          if (!taskMatchesUser) return;
          const key = dayKey(task.completedAt || task.updatedAt || task.createdAt);
          if (key) daily[key] = { tasks: (daily[key]?.tasks || 0) + 1, messages: daily[key]?.messages || 0 };
          const title = truncateText(task.title || task.name || t('dashboard.taskFallback') || 'Task', 40);
          const status = String(task.status || '').toLowerCase();
          const note = task.completedAt
            ? `Đã hoàn thành task: ${title}`
            : status && status !== 'todo'
              ? `Đã cập nhật task: ${title}`
              : `Tạo task: ${title}`;
          const when = task.completedAt || task.updatedAt || task.createdAt;
          const taskOrgId = getRowId(task.organizationId);
          if (when) {
            registerWeekItem({
              when,
              kind: 'task',
              icon: task.completedAt ? '✅' : '📝',
              title,
              detail: note,
              path: resolveWeeklyPath({ kind: 'task', organizationId: taskOrgId }),
            });
          }
        });
        const msgRows = await fetchMessagesForDashboardPaged(api, { maxPages: 3, limit: 50 }).catch(() => []);
        msgRows.forEach((msg) => {
          const senderId = getRowId(msg.senderId);
          if (currentUserKey && senderId !== currentUserKey) return;
          const key = dayKey(msg.createdAt);
          if (key) daily[key] = { tasks: daily[key]?.tasks || 0, messages: (daily[key]?.messages || 0) + 1 };
          const messageType = String(msg.messageType || 'text');
          const previewText =
            messageType === 'file'
              ? truncateText(msg.fileMeta?.originalName || msg.content || 'Tệp đính kèm', 40)
              : messageType === 'image'
                ? 'Hình ảnh'
                : messageType === 'business_card'
                  ? 'Danh thiếp'
                  : truncateText(msg.content || 'Tin nhắn', 48);
          const detail =
            messageType === 'file'
              ? `Đã gửi file: ${previewText}`
              : messageType === 'image'
                ? `Đã gửi ảnh: ${previewText}`
                : messageType === 'business_card'
                  ? `Đã chia sẻ danh thiếp: ${previewText}`
                  : `Đã nhắn: ${previewText}`;
          if (msg.createdAt) {
            const msgOrgId = getRowId(msg.organizationId);
            registerWeekItem({
              when: msg.createdAt,
              kind: 'message',
              icon: messageType === 'file' ? '📎' : messageType === 'image' ? '🖼️' : '💬',
              title: previewText,
              detail,
              path: resolveWeeklyPath({ kind: 'message', organizationId: msgOrgId }),
            });
          }
        });

        const friendNameById = new Map();
        friendsRaw.forEach((row) => {
          const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : null;
          const fid = String(u?._id || u?.id || u?.userId || row.friendId || '').trim();
          if (!fid) return;
          const n =
            u?.displayName ||
            u?.name ||
            u?.username ||
            (u?.email ? String(u.email).split('@')[0] : '') ||
            'Bạn bè';
          friendNameById.set(fid, n);
        });

        const dmLatestByPeer = new Map();
        const makePreview = (msg) => {
          const type = String(msg?.messageType || 'text');
          if (type === 'file') return msg?.fileMeta?.originalName || msg?.content || 'Đã gửi tệp đính kèm';
          if (type === 'image') return 'Đã gửi hình ảnh';
          if (type === 'business_card') return 'Đã chia sẻ danh thiếp';
          const text = String(msg?.content || '').trim();
          return text || 'Tin nhắn mới';
        };
        msgRows.forEach((msg) => {
          if (msg?.roomId) return;
          const senderId = getRowId(msg?.senderId);
          const receiverId = getRowId(msg?.receiverId);
          if (!senderId || !receiverId || !currentUserKey) return;
          const mySide = String(currentUserKey);
          if (senderId !== mySide && receiverId !== mySide) return;
          const peerId = senderId === mySide ? receiverId : senderId;
          if (!peerId) return;
          const ts = new Date(msg?.createdAt).getTime();
          if (!Number.isFinite(ts)) return;
          const prev = dmLatestByPeer.get(peerId);
          if (!prev || ts > prev.ts) {
            const senderObj = msg?.senderId && typeof msg.senderId === 'object' ? msg.senderId : null;
            const receiverObj = msg?.receiverId && typeof msg.receiverId === 'object' ? msg.receiverId : null;
            const peerObj = senderId === mySide ? receiverObj : senderObj;
            const peerName =
              friendNameById.get(peerId) ||
              peerObj?.displayName ||
              peerObj?.name ||
              peerObj?.username ||
              'Bạn bè';
            dmLatestByPeer.set(peerId, {
              id: peerId,
              name: peerName,
              preview: makePreview(msg),
              ts,
            });
          }
        });
        const relDmTime = (ts) => {
          const now = Date.now();
          const diffMin = Math.max(1, Math.floor((now - ts) / 60000));
          if (diffMin < 60) return `${diffMin} phút trước`;
          const diffHours = Math.floor(diffMin / 60);
          if (diffHours < 24) return `${diffHours} giờ trước`;
          const diffDays = Math.floor(diffHours / 24);
          return `${diffDays} ngày trước`;
        };
        const dashboardRecentDms = Array.from(dmLatestByPeer.values())
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 3)
          .map((row) => ({ ...row, time: relDmTime(row.ts) }));

        const weekActivityGrid = Array.from(weeklyDayMap.values()).map((day) => ({
          ...day,
          note: day.note || 'Chưa có hoạt động',
        }));
        const weekActivityNotes = weeklyNotes.sort((a, b) => b.ts - a.ts).slice(0, 3);

        if (!cancelled) {
          setMetrics({
            loading: false,
            orgCount,
            friendsTotal,
            pendingCount,
            unread,
            taskDone,
          });
          setActivityDailyMap({ ...daily });
          setRecentDmContacts(dashboardRecentDms);
          setRecentNotifications(dashboardRecentNotifications);
          setWeeklyActivityDays(weekActivityGrid);
          setWeeklyActivityNotes(weekActivityNotes);
        }
      } catch {
        if (!cancelled) {
          setMetrics((m) => ({ ...m, loading: false }));
          setPresenceFriends([]);
          setWorkspaceEntries([]);
          setUpcomingMeetings([]);
          setWeeklyActivityDays([]);
          setWeeklyActivityNotes([]);
          setActivityDailyMap({});
          setRecentDmContacts([]);
          setRecentNotifications([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentUserKey,
    metricsTick,
    landingDemo,
    demoVariant,
    locale,
    t,
    orgsQuery.data,
    summaryQuery.data,
    friendsQuery.data,
    pendingQuery.pendingCount,
    notificationsQuery.data,
  ]);

  /**
   * Presence realtime: khi socket đã kết nối, danh sách `onlineUsers` từ socket-service là nguồn đúng
   * (ai không còn trong danh sách = offline). Không fallback `p.status` từ API khi đã connected — API/DB
   * có thể vẫn là "online" vài giây sau khi peer đã disconnect.
   */
  const displayPresenceFriends = useMemo(() => {
    const set = new Set((onlineUsers || []).map(String));
    return presenceFriends.map((p) => {
      const idStr = String(p?.id ?? '');
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

  const contributionYearChoices = useMemo(() => {
    const y = new Date().getFullYear();
    return [0, 1, 2, 3, 4].map((i) => y - i);
  }, []);

  const githubGrid = useMemo(
    () => buildGithubYearGrid(activityYear, activityDailyMap, locale),
    [activityYear, activityDailyMap, locale]
  );

  const activityTotalSelectedYear = useMemo(() => {
    if (!activityDailyMap || typeof activityDailyMap !== 'object') return 0;
    const prefix = `${activityYear}-`;
    let sum = 0;
    for (const [k, v] of Object.entries(activityDailyMap)) {
      if (!k.startsWith(prefix)) continue;
      sum += Number(v?.tasks || 0) + Number(v?.messages || 0);
    }
    return sum;
  }, [activityDailyMap, activityYear]);

  /** Nhãn cột ngày bên trái (sparse): T2/T4/T6 ↔ Mon/Wed/Fri */
  const contributionLeftDayMarkers = useMemo(() => {
    if (locale === 'en') {
      return ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    }
    return ['', 'T2', '', 'T4', '', 'T6', ''];
  }, [locale]);

  const shellBg = appShellBg(isDarkMode);
  const dashHeader = isDarkMode
    ? 'border-b border-white/[0.06] bg-[#0D0D0F]/95 backdrop-blur-md'
    : 'border-b border-sky-200/90 bg-sky-50/95 backdrop-blur-md';
  const dashMain = isDarkMode ? '' : 'bg-gradient-to-b from-sky-50/90 via-transparent to-slate-200/80';
  const dashAside = isDarkMode
    ? 'border-l border-white/[0.06] bg-[#121214]'
    : 'border-l border-sky-200/90 bg-sky-100/85';
  const cardSurface = isDarkMode
    ? 'border border-white/[0.04] bg-[#171a22]'
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

  const activityCellClass = (value) => {
    const total = Number(value) || 0;
    if (total <= 0) {
      return isDarkMode ? 'bg-white/[0.03]' : 'bg-slate-100';
    }
    if (total === 1) {
      return isDarkMode ? 'bg-cyan-500/[0.12]' : 'bg-cyan-100';
    }
    if (total === 2) {
      return isDarkMode ? 'bg-cyan-400/[0.22]' : 'bg-cyan-200';
    }
    if (total === 3) {
      return isDarkMode ? 'bg-cyan-400/[0.34]' : 'bg-cyan-300';
    }
    return isDarkMode ? 'bg-cyan-300/[0.46]' : 'bg-cyan-400';
  };

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
          nguon: t('dashboard.drilldownSourceOrgApi'),
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
          nguon: t('dashboard.drilldownSourceTasksApi'),
          done: metrics.taskDone ?? '—',
          soToChuc: metrics.orgCount ?? '—',
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
          nguon: t('dashboard.drilldownSourceFriendsApi'),
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
          nguon: t('dashboard.drilldownSourceNotifyApi'),
          chuaDoc: metrics.unread,
        },
      },
    ];
  }, [metrics, t]);

  const selectedStat = useMemo(() => {
    if (!selectedStatKey) return null;
    return stats.find((stat) => stat.key === selectedStatKey) || null;
  }, [selectedStatKey, stats]);

  const drilldownLabel = useCallback(
    (key) => {
      const map = {
        nguon: 'dashboard.drilldownSource',
        done: 'dashboard.drilldownDone',
        soToChuc: 'dashboard.drilldownOrgCount',
        soBan: 'dashboard.drilldownFriends',
        loiMoiCho: 'dashboard.drilldownPending',
        chuaDoc: 'dashboard.drilldownUnread',
      };
      const path = map[key];
      return path ? t(path) : key;
    },
    [t]
  );

  const activities = useMemo(() => {
    if (!landingDemo) return [];
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
  }, [landingDemo, t]);

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

  const myOverviewItems = useMemo(
    () =>
      workspaceEntries
        .filter((row) => row?.slug)
        .map((row) => ({
          id: String(row.id || row.slug),
          title: String(row.myRole || 'member').toUpperCase(),
          detail: t('dashboard.detailTask'),
          workspaceName: row.name,
          workspaceSlug: row.slug,
          route: '/workspaces',
        })),
    [workspaceEntries, t]
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
  const shellH = landingDemo ? 'min-h-[760px] h-[760px]' : 'h-screen';

  return (
    <>
    <div className={`relative flex ${shellH} overflow-hidden ${shellBg}`}>
      <ShellWaveBackdrop />
      <div className="relative z-[2] h-full shrink-0">
        <NavigationSidebar landingDemo={landingDemo} />
      </div>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className={`flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-6 ${dashHeader}`}>
          <p className={`max-w-[40%] truncate text-sm font-medium md:max-w-none md:text-[15px] ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>
            {getGreeting()}
          </p>
          <div className="min-w-0 flex-1 md:mx-auto md:max-w-xl">
            <AppSearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={t('dashboard.searchPlaceholder')}
              isDarkMode={isDarkMode}
              id="dashboard-header-search"
              aria-label={t('dashboard.ariaSearch')}
              size="lg"
              onFocus={() => setQuickNavOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setQuickNavOpen(true);
                }
              }}
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
            </div>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat, idx) => (
              <GlassCard
                key={idx}
                hover
                onClick={() => setSelectedStatKey(stat.key)}
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

          <GlassCard className={`mb-8 ${cardSurface} ${isDarkMode ? 'shadow-[0_8px_32px_rgba(0,0,0,0.25)]' : 'shadow-md'}`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className={`text-base font-bold ${textHeading}`}>{t('dashboard.personalActivityTitle')}</h2>
                <p className={`mt-1 text-xs ${textMuted}`}>{t('dashboard.personalActivitySub')}</p>
                <p className={`mt-1 text-[11px] ${textSub}`}>{t('dashboard.personalActivityHint')}</p>
              </div>
              <div className={`text-right text-xs tabular-nums ${textSub}`}>
                <span className={`font-semibold ${accentText}`}>{activityYear}</span>
                <span className="mx-1 opacity-70">·</span>
                {t('dashboard.personalActivityCount', { n: activityTotalSelectedYear })}
              </div>
            </div>
            <div className={`flex flex-col gap-4 rounded-xl px-3 py-3 sm:px-4 ${isDarkMode ? 'bg-[#0d1117]/35' : 'bg-slate-50/70'}`}>
              <div className="flex min-w-0 flex-1 gap-4">
                <div className={`min-h-0 min-w-0 flex-1 overflow-x-auto scrollbar-overlay ${isDarkMode ? '' : ''}`}>
                  <div className="flex w-max min-w-full gap-2">
                    <div className="flex shrink-0 flex-col pt-[15px]">
                      <div className="flex flex-col gap-[3px]" aria-hidden>
                        {contributionLeftDayMarkers.map((lab, i) => (
                          <span
                            key={`dw-${i}`}
                            className={`flex h-[10px] items-center justify-end whitespace-nowrap pr-1 text-[9px] ${textMuted}`}
                          >
                            {lab || '\u00a0'}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="min-w-0 shrink-0">
                      <div className="flex gap-[3px]">
                        {githubGrid.monthLabels.map((lab, wi) => (
                          <div key={`mh-${wi}`} className="w-[11px] shrink-0 text-left leading-none">
                            {lab ? <span className={`text-[10px] ${textMuted}`}>{lab}</span> : null}
                          </div>
                        ))}
                      </div>
                      <div className="mt-[3px] flex gap-[3px]">
                        {githubGrid.weeks.map((week, wi) => (
                          <div key={`wk-${wi}`} className="flex shrink-0 flex-col gap-[3px]" role="presentation">
                            {week.map((cell, di) => (
                              <div
                                key={cell.key + String(di)}
                                title={
                                  cell.inYear
                                    ? t('dashboard.personalActivityDayTitle', {
                                        date: cell.key,
                                        tasks: cell.tasks,
                                        messages: cell.messages,
                                      })
                                    : ''
                                }
                                className={`h-[10px] w-[11px] rounded-[2px] ${
                                  cell.inYear ? githubContributionCellClass(cell.total, isDarkMode) : 'pointer-events-none border-0 bg-transparent'
                                }`}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <nav
                  aria-label={t('dashboard.activityYearNavAria')}
                  className={`flex shrink-0 flex-col items-end gap-0.5 border-l pl-3 ${isDarkMode ? 'border-white/[0.08]' : 'border-slate-200'}`}
                >
                  {contributionYearChoices.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setActivityYear(y)}
                      className={`rounded-md px-2 py-0.5 text-sm font-semibold transition ${
                        y === activityYear
                          ? isDarkMode
                            ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-500/40'
                            : 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200'
                          : isDarkMode
                            ? `${textMuted} hover:bg-white/[0.06] hover:text-white`
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </nav>
              </div>
              <div className={`flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] ${textMuted}`}>
                <span>{t('dashboard.personalActivityDataNote')}</span>
                <div className="flex items-center gap-1">
                  <span>{t('dashboard.personalActivityLegendLess')}</span>
                  <div className="flex gap-1">
                    {[0, 1, 4, 8, 12].map((fakeTotal, i) => (
                      <div
                        key={`lg-${i}`}
                        className={`h-[10px] w-[11px] rounded-[2px] ${fakeTotal === 0 ? githubContributionCellClass(0, isDarkMode) : githubContributionCellClass(fakeTotal, isDarkMode)}`}
                      />
                    ))}
                  </div>
                  <span>{t('dashboard.personalActivityLegendMore')}</span>
                </div>
              </div>
            </div>
          </GlassCard>

          <div id="vh-dashboard-activity" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <GlassCard className={`${cardSurface} ${isDarkMode ? 'shadow-[0_8px_24px_rgba(0,0,0,0.22)]' : 'shadow-md'}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-base font-bold ${textHeading}`}>{t('dashboard.privateMessagesTitle')}</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/chat/friends')}
                    className={`text-xs font-semibold ${accentText}`}
                  >
                    Xem tất cả
                  </button>
                </div>
                <div className="space-y-2">
                  {recentDmContacts.length === 0 ? (
                    <p className={`rounded-xl border border-dashed px-3 py-2 text-xs ${isDarkMode ? 'border-white/[0.08] text-[#6b7280]' : 'border-slate-200 text-slate-500'}`}>
                      Chưa có tin nhắn gần đây.
                    </p>
                  ) : (
                    recentDmContacts.map((activity, idx) => (
                      <button
                        key={`dm-${activity.id || idx}`}
                        type="button"
                        onClick={() => navigate('/chat/friends')}
                        className={`w-full rounded-xl px-3 py-2 text-left transition ${
                          isDarkMode ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className={`truncate text-sm font-semibold ${textHeading}`}>{activity.name}</div>
                          <div className={`shrink-0 text-[11px] ${textSub}`}>{activity.time}</div>
                        </div>
                        <div className={`mt-0.5 truncate text-xs ${textMuted}`}>{activity.preview}</div>
                      </button>
                    ))
                  )}
                </div>
              </GlassCard>

              <GlassCard className={`${cardSurface} ${isDarkMode ? 'shadow-[0_8px_24px_rgba(0,0,0,0.22)]' : 'shadow-md'}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className={`text-base font-bold ${textHeading}`}>Thông báo</h2>
                  <button
                    type="button"
                    onClick={() => navigate('/notifications')}
                    className={`text-xs font-semibold ${accentText}`}
                  >
                    Tất cả
                  </button>
                </div>
                <div className="space-y-2">
                  {recentNotifications.length === 0 ? (
                    <p className={`rounded-xl border border-dashed px-3 py-2 text-xs ${isDarkMode ? 'border-white/[0.08] text-[#6b7280]' : 'border-slate-200 text-slate-500'}`}>
                      Chưa có thông báo gần đây.
                    </p>
                  ) : (
                    recentNotifications.map((activity, idx) => (
                    <button
                      key={`noti-${activity.id || idx}`}
                      type="button"
                      onClick={() => navigate('/notifications')}
                      className={`w-full rounded-xl px-3 py-2 text-left transition ${
                        isDarkMode ? 'bg-white/[0.03] hover:bg-white/[0.06]' : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className={`truncate text-sm font-semibold ${textHeading}`}>{activity.title}</div>
                        <div className={`shrink-0 text-[11px] ${textSub}`}>{activity.time}</div>
                      </div>
                      <div className={`mt-0.5 truncate text-xs ${textMuted}`}>{activity.preview}</div>
                    </button>
                    ))
                  )}
                </div>
              </GlassCard>
            </div>

            <GlassCard className={`${cardSurface} ${isDarkMode ? 'shadow-[0_8px_32px_rgba(0,0,0,0.25)]' : 'shadow-md'}`}>
              <div className="mb-3">
                <h2 className={`text-lg font-bold ${textHeading}`}>Vào workspace</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {myOverviewItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/w/${encodeURIComponent(item.workspaceSlug)}`)}
                    className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                      isDarkMode ? 'border-white/[0.08] bg-[#141416] hover:bg-white/[0.05]' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className={`text-base font-semibold ${textHeading}`}>{item.workspaceName}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${
                        isDarkMode ? 'border-cyan-500/40 text-cyan-300' : 'border-cyan-300 text-cyan-700'
                      }`}>
                        {item.title}
                      </span>
                    </div>
                    <div className={`mt-1 text-xs ${textMuted}`}>{item.detail}</div>
                  </button>
                ))}
              </div>
            </GlassCard>
          </div>
          </main>

      <aside className={`flex w-80 shrink-0 flex-col overflow-hidden ${dashAside}`}>
        <div className="flex-1 min-h-0 space-y-6 overflow-y-auto overflow-x-visible p-4 scrollbar-overlay">
          <div className={`rounded-2xl p-3.5 ${isDarkMode ? 'bg-[#0f1218]' : 'bg-white'}`}>
            <div className={`rounded-2xl p-3 ${isDarkMode ? 'bg-gradient-to-b from-[#1a1f2b] to-[#141821]' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-3">
                <UserAvatar avatar={user?.avatar} name={displayName} size="md" />
                <div className="min-w-0">
                  <div className={`truncate text-base font-bold ${textHeading}`}>{displayName}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className={`text-2xl font-extrabold tabular-nums ${textHeading}`}>{metrics.orgCount ?? 0}</div>
                  <div className={`text-[11px] ${textSub}`}>{t('dashboard.statOrg')}</div>
                </div>
                <div>
                  <div className={`text-2xl font-extrabold tabular-nums ${textHeading}`}>{metrics.friendsTotal ?? 0}</div>
                  <div className={`text-[11px] ${textSub}`}>{t('dashboard.statFriends')}</div>
                </div>
                <div>
                  <div className={`text-2xl font-extrabold tabular-nums ${textHeading}`}>{metrics.taskDone ?? 0}</div>
                  <div className={`text-[11px] ${textSub}`}>{t('dashboard.statTaskDone')}</div>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>Sắp tới</h3>
                <button
                  type="button"
                  onClick={() => navigate('/calendar')}
                  className={`text-[11px] font-semibold ${isDarkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-600'}`}
                >
                  {t('dashboard.viewAllShort')}
                </button>
              </div>
              <div className="space-y-2.5">
                {!metrics.loading && upcomingMeetings.length === 0 && (
                  <p className={`rounded-xl border border-dashed px-3 py-2 text-xs ${isDarkMode ? 'border-white/[0.08] text-[#6b7280]' : 'border-slate-200 text-slate-500'}`}>
                    {t('dashboard.noMeetingsWeek')}
                  </p>
                )}
                {upcomingMeetings.slice(0, 3).map((event, idx) => {
                  const borderColors = ['border-l-blue-500', 'border-l-emerald-500', 'border-l-amber-500'];
                  const bc = borderColors[idx % borderColors.length];
                  return (
                    <button
                      key={event.id != null ? String(event.id) : idx}
                      type="button"
                      onClick={() => navigate('/calendar')}
                      className={`w-full rounded-xl border-l-4 px-3 py-2 text-left transition ${bc} ${isDarkMode ? 'bg-[#161b25] hover:bg-white/[0.04]' : 'bg-white hover:bg-slate-50'}`}
                    >
                      <div className={`truncate text-sm font-semibold ${textHeading}`}>{event.title}</div>
                      <div className={`mt-0.5 text-xs ${textMuted}`}>
                        {event.time} · {t('dashboard.peopleUnit', { n: event.attendees })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">

            {!metrics.loading && metrics.pendingCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('/friends')}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition ${
                  isDarkMode
                    ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                {t('dashboard.pendingInvites', { n: metrics.pendingCount })}
              </button>
            )}
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
                    <UserAvatar avatar={pf.avatarUrl} name={pf.name} size="md" />
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
              className={`mt-3 w-full rounded-xl py-2.5 text-sm font-semibold transition ${isDarkMode ? 'bg-white/[0.03] text-[#9ca3af] hover:bg-white/[0.08] hover:text-white' : 'bg-white text-slate-800 shadow-sm hover:bg-slate-50 hover:text-slate-900'}`}
            >
              {t('dashboard.openFriendChat')}
            </button>
          </div>

          <div className={`rounded-2xl border p-3 ${cardSurface}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className={`text-xs font-bold uppercase tracking-wider ${textSub}`}>{t('dashboard.weekActivity')}</h3>
                <p className={`mt-1 text-[11px] ${textSub}`}>Lưới 7 ngày từ task và tin nhắn của tôi.</p>
              </div>
              <div className={`text-right text-[11px] ${textSub}`}>
                <div className={`text-sm font-bold ${accentText}`}>
                  {weeklyActivityDays.reduce((sum, item) => sum + (item.total || 0), 0)}
                </div>
                <div>hoạt động</div>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {weeklyActivityDays.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => day.path && navigate(day.path)}
                  title={`${day.dayLabel} · ${day.total} hoạt động · ${day.note || 'Chưa có hoạt động'}`}
                  className={`group flex min-h-[92px] flex-col rounded-xl border p-1.5 text-left transition ${
                    isDarkMode ? 'border-white/[0.06] bg-[#141416] hover:bg-white/[0.04]' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[10px] font-semibold">
                    <span className={textSub}>{day.dayLabel}</span>
                    <span className={day.total > 0 ? accentText : textSub}>{day.total}</span>
                  </div>
                  <div
                    className={`mt-1 flex-1 rounded-lg border ${
                      isDarkMode ? 'border-white/[0.05]' : 'border-white'
                    } ${activityCellClass(day.total, isDarkMode)}`}
                  />
                  <div className={`mt-1 line-clamp-2 text-[10px] leading-snug ${textSub}`}>
                    {truncateText(day.note || 'Chưa có hoạt động', 34)}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 space-y-1.5">
              {weeklyActivityNotes.length === 0 ? (
                <p className={`rounded-xl border border-dashed px-3 py-2 text-[11px] ${isDarkMode ? 'border-white/[0.08] text-[#6b7280]' : 'border-slate-200 text-slate-500'}`}>
                  Chưa có note hoạt động trong tuần này.
                </p>
              ) : (
                weeklyActivityNotes.map((note) => (
                  <button
                    key={note.key}
                    type="button"
                    onClick={() => note.path && navigate(note.path)}
                    className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                      isDarkMode ? 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06]' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <span className="mt-0.5 text-sm">{note.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-xs font-semibold ${textHeading}`}>{note.title}</div>
                      <div className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${textSub}`}>{note.detail}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
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
      onClose={() => setSelectedStatKey(null)}
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

                  {Object.entries(selectedStat.drilldown || {}).filter(([key]) => !['projects', 'nguoiDongGopNhieuNhat', 'roles', 'channels'].includes(key)).map(([key, value]) => (
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
                      setSelectedStatKey(null);
                    }
                  }}
                >
                  {getStatDetailRoute(selectedStat.key).cta}
                </GradientButton>
              </div>
            )}

            {Array.isArray(selectedStat.drilldown?.projects) && selectedStat.drilldown.projects.length > 0 && (
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

            {Array.isArray(selectedStat.drilldown?.nguoiDongGopNhieuNhat) && selectedStat.drilldown.nguoiDongGopNhieuNhat.length > 0 && (
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

            {Array.isArray(selectedStat.drilldown?.roles) && selectedStat.drilldown.roles.length > 0 && (
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

            {Array.isArray(selectedStat.drilldown?.channels) && selectedStat.drilldown.channels.length > 0 && (
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
