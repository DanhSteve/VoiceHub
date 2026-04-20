import { useCallback, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { ConfirmDialog, GlassCard, GradientButton, Modal } from '../../components/Shared';
import { useCalendarFeed } from '../../hooks/useCalendarFeed';
import { useTaskDueAlerts } from '../../hooks/useTaskDueAlerts';
import {
  getMeetingJoinState,
  getMonthGridCells,
  toDateKey,
} from '../../utils/calendarUtils';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import { PageSearchBar, SearchFilterChips } from '../../features/search';

const LOCAL_CUSTOM_KEY = 'voicehub:calendar:localCustom';

function parseTimeInputToDisplay(hhmm, loc) {
  if (!hhmm || !String(hhmm).includes(':')) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const tag = loc === 'en' ? 'en-US' : 'vi-VN';
  return d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
}

function CalendarPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const [view, setView] = useState('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [createType, setCreateType] = useState('meeting');
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    duration: '30 phút',
    location: '',
    description: '',
    attendeesText: '',
  });
  const [attendeeNames, setAttendeeNames] = useState([]);
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState(null);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  /** all | meeting | deadline | local */
  const [calendarKindFilter, setCalendarKindFilter] = useState('all');
  const jumpDateInputRef = useRef(null);

  const {
    events,
    loading,
    error,
    tasksForAlerts,
    reloadLocal,
    refetch,
  } = useCalendarFeed(selectedDate);

  useTaskDueAlerts(tasksForAlerts, {
    enabled: true,
    onAlert: ({ title }) => {
      toast(t('calendar.toastDeadlineAlert', { title }), { icon: '⏰' });
    },
  });

  const eventsByKind = useMemo(() => {
    if (calendarKindFilter === 'all') return events;
    return events.filter((e) => {
      if (calendarKindFilter === 'meeting') return e.kind === 'meeting' || e.type === 'meeting';
      if (calendarKindFilter === 'deadline') return e.kind === 'task' || e.type === 'deadline';
      if (calendarKindFilter === 'local') return e.kind === 'local' || e.source === 'local';
      return true;
    });
  }, [events, calendarKindFilter]);

  const calendarKindOptions = useMemo(
    () => [
      { id: 'all', label: t('calendar.kindAll'), icon: '📋' },
      { id: 'meeting', label: t('calendar.kindMeetings'), icon: '🎤' },
      { id: 'deadline', label: t('calendar.kindDeadlines'), icon: '⏰' },
      { id: 'local', label: t('calendar.kindLocal'), icon: '📝' },
    ],
    [t]
  );

  const eventsForDisplay = useMemo(() => {
    const q = eventSearchQuery.trim().toLowerCase();
    if (!q) return eventsByKind;
    return eventsByKind.filter((e) => {
      const hay = [e.title, e.date, e.time, e.location, e.description, e.duration, e.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [eventsByKind, eventSearchQuery]);

  const todayEvents = useMemo(() => {
    const k = toDateKey(new Date());
    return eventsForDisplay.filter((e) => e.date === k);
  }, [eventsForDisplay]);

  const upcomingEvents = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return eventsForDisplay
      .filter((e) => {
        if (!e.date) return false;
        const d = new Date(`${e.date}T12:00:00`);
        return d > start;
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [eventsForDisplay]);

  const monthCells = useMemo(() => getMonthGridCells(selectedDate), [selectedDate]);

  const resetEventForm = () => {
    setEditingEventId(null);
    setCreateType('meeting');
    setAttendeeNames([]);
    setEventForm({
      title: '',
      date: '',
      time: '',
      duration: '30 phút',
      location: '',
      description: '',
      attendeesText: '',
    });
  };

  const openCreateModal = () => {
    resetEventForm();
    setShowCreateEventModal(true);
  };

  const openEditModal = (eventData) => {
    if (!eventData) return;
    if (eventData.source === 'api') {
      toast(t('calendar.toastEditElsewhere'), { icon: 'ℹ️' });
      return;
    }
    setEditingEventId(eventData.id);
    setCreateType(eventData.type || 'meeting');
    setEventForm({
      title: eventData.title || '',
      date: eventData.date || '',
      time: eventData.timeInput || eventData.time || '',
      duration: eventData.duration || '30 phút',
      location: eventData.location || '',
      description: eventData.description || '',
      attendeesText: '',
    });
    if (Array.isArray(eventData.attendeeNames)) {
      setAttendeeNames(eventData.attendeeNames.filter(Boolean));
    } else {
      setAttendeeNames([]);
    }
    setShowCreateEventModal(true);
  };

  const handleAddAttendees = () => {
    const raw = String(eventForm.attendeesText || '').trim();
    if (!raw) {
      toast.error(t('calendar.toastParticipantName'));
      return;
    }

    const parsed = raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      toast.error(t('calendar.toastParticipantInvalid'));
      return;
    }

    setAttendeeNames((prev) => Array.from(new Set([...prev, ...parsed])));
    setEventForm((prev) => ({ ...prev, attendeesText: '' }));
    toast.success(t('calendar.toastParticipantAdded'));
  };

  const handleRemoveAttendee = (name) => {
    setAttendeeNames((prev) => prev.filter((item) => item !== name));
  };

  const persistLocalList = useCallback((updater) => {
    try {
      let list = [];
      const raw = localStorage.getItem(LOCAL_CUSTOM_KEY) || localStorage.getItem('calendar:events');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) list = p;
      }
      const next = typeof updater === 'function' ? updater(list) : updater;
      localStorage.setItem(LOCAL_CUSTOM_KEY, JSON.stringify(next));
      reloadLocal();
    } catch {
      toast.error(t('calendar.toastLocalSaveFail'));
    }
  }, [reloadLocal, t]);

  const handleSaveEvent = () => {
    const title = String(eventForm.title || '').trim();
    const date = String(eventForm.date || '').trim();
    const timeRaw = String(eventForm.time || '').trim();

    if (!title || !date || !timeRaw) {
      toast.error(t('calendar.toastFillRequired'));
      return;
    }

    const colorByType = {
      meeting: 'from-blue-500 to-cyan-500',
      deadline: 'from-red-500 to-orange-500',
      reminder: 'from-cyan-600 to-teal-600',
    };

    const timeLabel = parseTimeInputToDisplay(timeRaw) || timeRaw;
    let startAt = null;
    try {
      startAt = new Date(`${date}T${timeRaw}`);
      if (Number.isNaN(startAt.getTime())) startAt = null;
    } catch {
      startAt = null;
    }

    const nextEvent = {
      id: editingEventId || `local:${Date.now()}`,
      kind: 'local',
      source: 'local',
      title,
      date,
      time: timeLabel,
      timeInput: timeRaw,
      duration: createType === 'meeting' ? eventForm.duration : '',
      type: createType,
      attendees: createType === 'meeting' ? attendeeNames.length : 0,
      attendeeNames: createType === 'meeting' ? attendeeNames : [],
      location: eventForm.location || '',
      description: eventForm.description || '',
      priority: createType === 'deadline' ? 'high' : undefined,
      color: colorByType[createType] || colorByType.reminder,
      startAt: startAt ? startAt.toISOString() : null,
    };

    if (editingEventId) {
      persistLocalList((list) =>
        list.map((item) => (String(item.id) === String(editingEventId) ? nextEvent : item))
      );
      toast.success(t('calendar.toastUpdated'));
    } else {
      persistLocalList((list) => [nextEvent, ...list]);
      toast.success(t('calendar.toastCreated'));
    }

    setShowCreateEventModal(false);
    resetEventForm();
  };

  const handleDeleteEvent = (eventId, source) => {
    if (!eventId) return;
    if (source === 'api') {
      toast(t('calendar.toastDeleteTaskVoice'), { icon: 'ℹ️' });
      return;
    }
    setDeleteConfirmEventId(eventId);
  };

  const confirmDeleteLocalEvent = () => {
    const eventId = deleteConfirmEventId;
    if (!eventId) return;
    persistLocalList((list) => list.filter((item) => String(item.id) !== String(eventId)));
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(null);
    }
    toast.success(t('calendar.toastDeleted'));
  };

  const handleJoinEvent = (eventData) => {
    if (!eventData) return;
    if (eventData.kind === 'meeting' && eventData.meetingId && eventData.raw) {
      const st = getMeetingJoinState(eventData.raw, new Date());
      if (!st.joinEligible) {
        if (st.disabledReason === 'too_early') {
          toast.error(t('calendar.toastJoinWindow'));
        } else if (st.disabledReason === 'ended') {
          toast.error(t('calendar.toastMeetingEnded'));
        } else {
          toast.error(t('calendar.toastJoinFail'));
        }
        return;
      }
      navigate(`/voice/${encodeURIComponent(eventData.meetingId)}`);
      toast.success(t('calendar.toastJoining'));
      return;
    }
    if (eventData.type === 'meeting' && eventData.source === 'local') {
      toast(t('calendar.toastLocalEvent'), { icon: 'ℹ️' });
      return;
    }
    if (eventData.kind === 'task' || eventData.type === 'deadline') {
      toast(t('calendar.toastOpenTasks'), { icon: 'ℹ️' });
      return;
    }
    toast(t('calendar.toastDetail'), { icon: 'ℹ️' });
  };

  const calShell = `${appShellBg(isDarkMode)} ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`;
  const calHeader = isDarkMode ? 'border-slate-800 bg-slate-900/40' : 'border-slate-200 bg-white';
  const viewInactive = isDarkMode
    ? 'border border-slate-800 bg-[#040f2a] text-gray-400 hover:bg-slate-800/70'
    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';

  const calChrome = isDarkMode
    ? 'border border-slate-600/60 bg-gradient-to-b from-[#0a1224] via-[#060d1c] to-[#030a14] shadow-[0_4px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.04]'
    : 'border border-slate-200 bg-white shadow-md ring-1 ring-slate-900/[0.04]';
  const calMonthHeader = isDarkMode
    ? 'shrink-0 border-b border-slate-700/70 bg-slate-950/40 px-4 py-3 sm:px-5'
    : 'shrink-0 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5';
  const calMonthKicker =
    'text-[11px] font-semibold uppercase tracking-wider ' + (isDarkMode ? 'text-slate-400' : 'text-slate-500');
  const calMonthTitle = isDarkMode ? 'text-xl font-bold text-white sm:text-2xl' : 'text-xl font-bold text-slate-900 sm:text-2xl';
  const calNavBtn = isDarkMode
    ? 'rounded-lg border border-slate-700 bg-[#0c1629] px-3 py-2 text-sm text-white transition hover:bg-slate-800/80'
    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50';
  const iconToolBtn = isDarkMode
    ? 'rounded-lg border border-slate-700 bg-[#0c1629] px-2.5 py-2 text-base leading-none text-white transition hover:bg-slate-800/80 sm:px-3'
    : 'rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-base leading-none text-slate-700 shadow-sm transition hover:bg-slate-50 sm:px-3';
  const dayHeaderCell = isDarkMode ? 'py-2 text-center text-sm font-bold text-gray-300' : 'py-2 text-center text-sm font-bold text-slate-600';
  const sideHeading = isDarkMode
    ? 'mb-4 flex items-center gap-2 text-lg font-bold text-white'
    : 'mb-4 flex items-center gap-2 text-lg font-bold text-slate-900';
  const sideCard = isDarkMode
    ? 'cursor-pointer border border-slate-800 bg-slate-900/60'
    : 'cursor-pointer border border-slate-200 bg-white shadow-sm';
  const sideCardCompact = isDarkMode ? `${sideCard} p-3` : `${sideCard} p-3`;
  const modalGlass = isDarkMode ? 'border border-slate-800 bg-slate-900/60' : 'border border-slate-200 bg-slate-50 shadow-sm';
  const modalHeading = isDarkMode ? 'font-bold text-white' : 'font-bold text-slate-900';
  const modalBody = isDarkMode ? 'text-sm text-gray-300' : 'text-sm text-slate-600';
  const modalDestructive = isDarkMode
    ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-6 py-3 font-semibold text-red-400 transition-all hover:bg-slate-800/70'
    : 'rounded-xl border border-slate-200 bg-white px-6 py-3 font-semibold text-red-600 shadow-sm transition-all hover:bg-slate-50';
  const attendeeRow = isDarkMode
    ? 'flex items-center gap-2 rounded-lg border border-slate-800 bg-[#040f2a] p-2'
    : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm';
  const formShell = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const formLabel = isDarkMode ? 'mb-2 block text-sm font-semibold text-slate-300' : 'mb-2 block text-sm font-semibold text-slate-700';
  const formInput = isDarkMode
    ? 'w-full rounded-xl border border-slate-600/80 bg-[#0a1628] px-4 py-3 text-white outline-none transition-all placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50'
    : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25';
  const formSelect = isDarkMode
    ? 'w-full rounded-xl border border-slate-600/80 bg-[#0a1628] px-4 py-3 text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40'
    : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none focus:border-cyan-500';
  const formBtnSecondary = isDarkMode
    ? 'shrink-0 rounded-xl border border-slate-600 bg-[#0a1628] px-4 py-3 font-semibold text-white transition-all hover:bg-slate-700/80'
    : 'shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50';
  const formTypeInactive = isDarkMode
    ? 'rounded-xl border border-slate-600 bg-[#0a1628] px-3 py-3 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/90 sm:flex-row'
    : 'rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-white sm:flex-row';

  const handleJumpDateChange = (e) => {
    const v = e.target.value;
    if (!v) return;
    setSelectedDate(new Date(`${v}T12:00:00`));
    toast.success(t('calendar.toastGoto', { v }));
    e.target.value = '';
  };

  const handleCalendarRefresh = async () => {
    reloadLocal();
    await refetch();
    toast.success(t('calendar.toastRefreshed'));
  };

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className={`flex h-full flex-col ${calShell}`}>
        {/* Header gọn — lịch là trọng tâm */}
        <div className={`shrink-0 border-b px-3 py-2.5 sm:px-4 sm:py-3 ${calHeader}`}>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="min-w-0 flex flex-wrap items-end gap-x-4 gap-y-2">
              <div>
                <h1 className={`text-xl font-extrabold sm:text-2xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('calendar.title')}</h1>
                <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-500' : 'text-slate-600'}`}>
                  {t('calendar.pageSubtitle')}
                  {loading && t('calendar.loadingSuffix')}
                  {error && ` · ${error}`}
                </p>
              </div>
              {/* Thống kê dạng chip nhỏ — không dùng GlassCard p-6 */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {[
                  { icon: '📅', value: todayEvents.length, label: t('calendar.statToday') },
                  { icon: '🔜', value: upcomingEvents.length, label: t('calendar.statUpcoming') },
                  { icon: '🎤', value: eventsForDisplay.filter((e) => e.type === 'meeting').length, label: t('calendar.statMeetings') },
                  { icon: '⏰', value: eventsForDisplay.filter((e) => e.type === 'deadline').length, label: t('calendar.statDeadlines') },
                ].map((s) => (
                  <div
                    key={s.label}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 sm:px-2.5 ${isDarkMode ? 'border-slate-700/50 bg-[#0a1322]/90' : 'border-slate-200 bg-white'}`}
                    title={s.label}
                  >
                    <span className="text-sm sm:text-base leading-none" aria-hidden>
                      {s.icon}
                    </span>
                    <span className={`text-sm font-bold tabular-nums leading-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{s.value}</span>
                    <span
                      className={`max-w-[5.5rem] truncate text-[11px] font-medium leading-tight sm:max-w-none sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}
                    >
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex min-w-0 flex-shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex min-w-0 w-full flex-col gap-2 sm:max-w-md">
                <PageSearchBar
                  className="w-full"
                  value={eventSearchQuery}
                  onChange={setEventSearchQuery}
                  placeholder={t('calendar.searchEventsPlaceholder')}
                  isDarkMode={isDarkMode}
                  id="calendar-event-search"
                  aria-label={t('calendar.searchEventsAria')}
                />
                <SearchFilterChips
                  aria-label={t('calendar.kindFilterAria')}
                  options={calendarKindOptions}
                  value={calendarKindFilter}
                  onChange={setCalendarKindFilter}
                  isDarkMode={isDarkMode}
                  size="sm"
                />
              </div>
              <div className="flex gap-1">
                {['day', 'week', 'month'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 sm:text-sm ${
                      view === v
                        ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white'
                        : viewInactive
                    }`}
                  >
                    {v === 'day' ? t('calendar.viewDay') : v === 'week' ? t('calendar.viewWeek') : t('calendar.viewMonth')}
                  </button>
                ))}
              </div>
              <GradientButton variant="primary" className="!px-3 !py-2 text-sm" onClick={openCreateModal}>
                {t('calendar.createBtn')}
              </GradientButton>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 grid grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-3 lg:gap-5 lg:p-5">
          {/* Calendar View — khung riêng, 2/3 chiều ngang trên desktop */}
          <div className="flex min-h-[38vh] lg:min-h-0 lg:col-span-2">
            <div className={`flex w-full min-h-0 flex-col overflow-hidden rounded-2xl ${calChrome}`}>
              <div className={calMonthHeader}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className={calMonthKicker}>{t('calendar.monthKicker')}</p>
                    <h2 className={calMonthTitle}>
                      {selectedDate.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </h2>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <input
                      ref={jumpDateInputRef}
                      type="date"
                      className="sr-only"
                      aria-hidden
                      tabIndex={-1}
                      onChange={handleJumpDateChange}
                    />
                    <button
                      type="button"
                      title={t('calendar.ariaPickDate')}
                      className={iconToolBtn}
                      onClick={() => {
                        const el = jumpDateInputRef.current;
                        if (el && typeof el.showPicker === 'function') {
                          try {
                            el.showPicker();
                          } catch {
                            el.click();
                          }
                        } else if (el) el.click();
                      }}
                    >
                      🔍
                    </button>
                    <button type="button" title={t('calendar.ariaRefresh')} className={iconToolBtn} onClick={handleCalendarRefresh}>
                      🔄
                    </button>
                    <button
                      type="button"
                      title={t('calendar.ariaSettings')}
                      className={iconToolBtn}
                      onClick={() => {
                        navigate('/settings');
                        toast(t('calendar.toastOpenSettings'), { icon: 'ℹ️' });
                      }}
                    >
                      ⚙️
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setMonth(newDate.getMonth() - 1);
                        setSelectedDate(newDate);
                        toast(t('calendar.toastMonthNav', { m: newDate.getMonth() + 1, y: newDate.getFullYear() }), { icon: '📅' });
                      }}
                      className={calNavBtn}
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(new Date());
                        toast(t('calendar.toastBackToday'), { icon: '📅' });
                      }}
                      className={`${calNavBtn} font-semibold sm:px-4`}
                    >
                      {t('calendar.todayNavBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setMonth(newDate.getMonth() + 1);
                        setSelectedDate(newDate);
                        toast(t('calendar.toastMonthNav', { m: newDate.getMonth() + 1, y: newDate.getFullYear() }), { icon: '📅' });
                      }}
                      className={calNavBtn}
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className={dayHeaderCell}>
                    {t(`calendar.wd${i}`)}
                  </div>
                ))}
                {monthCells.map((cell) => {
                  if (cell.type === 'empty') {
                    return <div key={cell.key} className="aspect-square opacity-20" />;
                  }
                  const { date, day } = cell;
                  const key = toDateKey(date);
                  const isToday = key === toDateKey(new Date());
                  const dayEvents = eventsForDisplay.filter((e) => e.date === key);
                  const hasEvent = dayEvents.length > 0;
                  return (
                    <div
                      key={cell.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedDate(date);
                        if (dayEvents.length > 0) {
                          toast(
                            t('calendar.toastDayEvents', {
                              count: dayEvents.length,
                              day,
                              month: date.getMonth() + 1,
                              year: date.getFullYear(),
                            }),
                            { icon: '📅' }
                          );
                        }
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setSelectedDate(date);
                        }
                      }}
                      className={`aspect-square cursor-pointer rounded-lg border p-2 transition-all hover:scale-105 ${
                        isToday
                          ? 'border-cyan-500 bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-md'
                          : isDarkMode
                            ? hasEvent
                              ? 'border-cyan-500/50 bg-[#040f2a] hover:bg-white/10'
                              : 'border-slate-800 bg-[#040f2a] hover:bg-slate-800/70'
                            : hasEvent
                              ? 'border-cyan-400/80 bg-white shadow-sm hover:border-cyan-500'
                              : 'border-slate-200 bg-slate-50 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <div
                        className={`text-sm font-bold ${
                          isToday ? 'text-white' : isDarkMode ? 'text-gray-200' : 'text-slate-800'
                        }`}
                      >
                        {day}
                      </div>
                      {hasEvent && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dayEvents.slice(0, 3).map((e) => (
                            <div key={e.id} className="w-1 h-1 rounded-full bg-cyan-400" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          </div>

          {/* Events Sidebar — 1/3 */}
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1 scrollbar-overlay lg:col-span-1 lg:max-h-[calc(100vh-8rem)]">
            {/* Today's Events */}
            <div>
              <h3 className={sideHeading}>
                <span>📅</span> {t('calendar.sectionTodayCount', { n: todayEvents.length })}
              </h3>
              <div className="space-y-3">
                {todayEvents.map((event, idx) => {
                  const meetingJoin =
                    event.kind === 'meeting' && event.raw ? getMeetingJoinState(event.raw) : null;
                  const joinLabel =
                    event.type === 'meeting'
                      ? meetingJoin && !meetingJoin.joinEligible
                        ? t('calendar.joinClosed')
                        : t('calendar.joinAction')
                      : t('calendar.viewDetail');
                  return (
                  <GlassCard
                    key={event.id} 
                    hover 
                    className={`animate-slideUp ${sideCard}`}
                    style={{animationDelay: `${idx * 0.1}s`}}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className={`w-full h-1 rounded-full bg-gradient-to-r ${event.color} mb-3`}></div>
                    <h4 className={`mb-2 font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{event.title}</h4>
                    <div className={`space-y-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                      <div className="flex items-center gap-2">
                        <span>🕐</span>
                        <span>{event.time}</span>
                        {event.duration && <span>({event.duration})</span>}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2">
                          <span>📍</span>
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.attendees ? (
                        <div className="flex items-center gap-2">
                          <span>👥</span>
                          <span>{t('calendar.peopleCount', { n: event.attendees })}</span>
                        </div>
                      ) : null}
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinEvent(event);
                      }}
                      disabled={Boolean(
                        event.type === 'meeting' && meetingJoin && !meetingJoin.joinEligible
                      )}
                      className={`mt-3 w-full rounded-lg border py-2 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                        isDarkMode
                          ? 'border-slate-800 bg-[#040f2a] hover:bg-slate-800/70'
                          : 'border-slate-200 bg-white shadow-sm hover:bg-slate-50'
                      }`}
                    >
                      {joinLabel}
                    </button>
                  </GlassCard>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Events */}
            <div>
              <h3 className={sideHeading}>
                <span>🔜</span> {t('calendar.sidebarUpcomingTitle')}
              </h3>
              <div className="space-y-2">
                {upcomingEvents.slice(0, 4).map((event, idx) => (
                  <GlassCard
                    key={event.id} 
                    hover 
                    className={sideCardCompact}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center text-xl flex-shrink-0`}>
                        {event.type === 'meeting' ? '🎤' : '⏰'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{event.title}</div>
                        <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                          {event.date} • {event.time}
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
        }
      />

    {/* Event Detail Modal */}
    <Modal 
      isOpen={selectedEvent !== null} 
      onClose={() => setSelectedEvent(null)}
      title={selectedEvent?.title}
      size="lg"
    >
      {selectedEvent && (
        <div className="space-y-4">
          {/* Event Header */}
          <div className={`w-full h-2 rounded-full bg-gradient-to-r ${selectedEvent.color}`}></div>
          
          {/* Event Info */}
          <div className="grid grid-cols-2 gap-4">
            <GlassCard className={modalGlass}>
              <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
                <span>🕐</span> {t('calendar.sectionTime')}
              </h4>
              <div className={`space-y-2 ${modalBody}`}>
                <div>📅 {selectedEvent.date}</div>
                <div>⏰ {selectedEvent.time}</div>
                {selectedEvent.duration && <div>⌛ {selectedEvent.duration}</div>}
              </div>
            </GlassCard>

            <GlassCard className={modalGlass}>
              <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
                <span>ℹ️</span> {t('calendar.sectionDetailBlock')}
              </h4>
              <div className={`space-y-2 ${modalBody}`}>
                <div>
                  📌{' '}
                  {selectedEvent.kind === 'task'
                    ? t('calendar.kindTaskDeadline')
                    : selectedEvent.type === 'meeting'
                      ? t('calendar.kindMeeting')
                      : t('calendar.eventOrMeeting')}
                </div>
                {selectedEvent.location && <div>📍 {selectedEvent.location}</div>}
                {selectedEvent.attendees && (
                  <div>👥 {t('calendar.peopleCount', { n: selectedEvent.attendees })}</div>
                )}
              </div>
            </GlassCard>
          </div>

          {/* Attendees List — chỉ danh sách tên khi sự kiện local có attendeeNames */}
          {selectedEvent.type === 'meeting' &&
            Array.isArray(selectedEvent.attendeeNames) &&
            selectedEvent.attendeeNames.length > 0 && (
            <GlassCard className={modalGlass}>
              <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
                <span>👥</span> {t('calendar.attendeesSection', { n: selectedEvent.attendeeNames.length })}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {selectedEvent.attendeeNames.map((name, idx) => (
                  <div key={name} className={attendeeRow}>
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${['from-cyan-600 to-teal-600', 'from-blue-500 to-cyan-500', 'from-green-500 to-emerald-500', 'from-orange-500 to-red-500'][idx % 4]} flex items-center justify-center text-xs font-bold`}>
                      {String(name).split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{name}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Description */}
          <GlassCard className={modalGlass}>
            <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
              <span>📝</span> {t('calendar.sectionDescription')}
            </h4>
            <p className={`whitespace-pre-wrap text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-600'}`}>
              {selectedEvent.description ||
                (selectedEvent.raw?.description) ||
                (selectedEvent.type === 'meeting' ? t('calendar.meetingHint') : t('calendar.taskHint'))}
            </p>
          </GlassCard>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {selectedEvent.type === 'meeting' && (() => {
              const mj =
                selectedEvent.kind === 'meeting' && selectedEvent.raw
                  ? getMeetingJoinState(selectedEvent.raw)
                  : null;
              const joinDisabled = Boolean(mj && !mj.joinEligible);
              return (
              <GradientButton 
                variant="primary" 
                disabled={joinDisabled}
                onClick={() => {
                  handleJoinEvent(selectedEvent);
                  setSelectedEvent(null);
                }}
                className="flex-1 min-w-[140px]"
              >
                {joinDisabled ? t('calendar.joinClosedBtn') : t('calendar.joinNow')}
              </GradientButton>
              );
            })()}
            {selectedEvent.source !== 'api' && (
            <GradientButton 
              variant="secondary" 
              onClick={() => {
                setSelectedEvent(null);
                openEditModal(selectedEvent);
              }}
              className="flex-1 min-w-[140px]"
            >
              {t('calendar.editEventBtn')}
            </GradientButton>
            )}
            {selectedEvent.source !== 'api' && (
            <button 
              type="button"
              onClick={() => {
                handleDeleteEvent(selectedEvent?.id, selectedEvent?.source);
              }}
            className={modalDestructive}
            >
              {t('calendar.deleteEventBtn')}
            </button>
            )}
          </div>
        </div>
      )}
    </Modal>

    {/* Create Event Modal */}
    <Modal 
      isOpen={showCreateEventModal} 
      onClose={() => setShowCreateEventModal(false)}
      title={editingEventId ? t('calendar.modalEditTitle') : t('calendar.modalCreateTitle')}
      size="lg"
    >
      <div className={`space-y-4 ${formShell}`}>
        {/* Event Title */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelEventTitle')}
          </label>
          <input 
            type="text"
            placeholder={t('calendar.phTitle')}
            value={eventForm.title}
            onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
            className={formInput}
          />
        </div>

        {/* Event Type — chữ sáng + nền tách khỏi glass modal */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelEventType')}
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { id: 'meeting', label: t('calendar.kindMeeting'), icon: '🎤' },
              { id: 'deadline', label: t('calendar.typeDeadline'), icon: '⏰' },
              { id: 'reminder', label: t('calendar.tabReminder'), icon: '🔔' },
            ].map((type) => {
              const active = createType === type.id;
              return (
              <button
                key={type.id}
                type="button"
                onClick={() => setCreateType(type.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-all sm:flex-row sm:gap-2 ${
                  active
                    ? 'border-cyan-400 bg-cyan-600/35 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]'
                    : formTypeInactive
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>{type.icon}</span>
                <span className={active ? 'text-white' : isDarkMode ? 'text-slate-100' : 'text-slate-800'}>{type.label}</span>
              </button>
              );
            })}
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={formLabel}>
              {t('calendar.labelDate')}
            </label>
            <input 
              type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
              className={`${formInput} ${isDarkMode ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
            />
          </div>
          <div>
            <label className={formLabel}>
              {t('calendar.labelTime')}
            </label>
            <input 
              type="time"
                value={eventForm.time}
                onChange={(e) => setEventForm((prev) => ({ ...prev, time: e.target.value }))}
              className={`${formInput} ${isDarkMode ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
            />
          </div>
        </div>

        {/* Duration & Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={formLabel}>
              {t('calendar.labelDuration')}
            </label>
            <select
              value={eventForm.duration}
              onChange={(e) => setEventForm((prev) => ({ ...prev, duration: e.target.value }))}
              className={formSelect}
            >
              <option value="15 phút" className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                {t('calendar.dur15')}
              </option>
              <option value="30 phút" className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                {t('calendar.dur30')}
              </option>
              <option value="45 phút" className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                {t('calendar.dur45')}
              </option>
              <option value="1 giờ" className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                {t('calendar.dur60')}
              </option>
              <option value="1.5 giờ" className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                {t('calendar.dur90')}
              </option>
              <option value="2 giờ" className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}>
                {t('calendar.dur120')}
              </option>
            </select>
          </div>
          <div>
            <label className={formLabel}>
              {t('calendar.labelLocation')}
            </label>
            <input 
              type="text"
              placeholder={t('calendar.phVoice')}
              value={eventForm.location}
              onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
              className={formInput}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelDesc')}
          </label>
          <textarea 
            rows={4}
            placeholder={t('calendar.phDesc')}
            value={eventForm.description}
            onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
            className={`${formInput} resize-none`}
          ></textarea>
        </div>

        {/* Attendees */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelAttendees')}
          </label>
          <div className="flex gap-2">
            <input 
              type="text"
              placeholder={t('calendar.phAttendees')}
              value={eventForm.attendeesText}
              onChange={(e) => setEventForm((prev) => ({ ...prev, attendeesText: e.target.value }))}
              className={`flex-1 ${formInput}`}
            />
            <button
              type="button"
              className={formBtnSecondary}
              onClick={handleAddAttendees}
            >
              {t('calendar.addAttendeeBtn')}
            </button>
          </div>
          {attendeeNames.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attendeeNames.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => handleRemoveAttendee(name)}
                  className="px-3 py-1.5 rounded-full text-xs bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/30 transition-all"
                >
                  {name} ✕
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <GradientButton 
            variant="primary" 
            onClick={handleSaveEvent}
            className="flex-1"
          >
            {editingEventId ? t('calendar.saveEvent') : t('calendar.createEvent')}
          </GradientButton>
          <button 
            type="button"
            onClick={() => setShowCreateEventModal(false)}
            className={formBtnSecondary}
          >
            {t('calendar.cancelBtn')}
          </button>
        </div>
      </div>
    </Modal>

    <ConfirmDialog
      isOpen={deleteConfirmEventId != null}
      onClose={() => setDeleteConfirmEventId(null)}
      onConfirm={confirmDeleteLocalEvent}
      title={t('calendar.confirmDeleteTitle')}
      message={t('calendar.confirmDeleteMsg')}
      confirmText={t('calendar.confirmDeleteOk')}
      cancelText={t('calendar.cancelBtn')}
    />
    </>
  );
}

export default CalendarPage;
