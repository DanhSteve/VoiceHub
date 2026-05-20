import { useCallback, useEffect, useMemo, useState } from 'react';
import { taskAPI } from '../services/api/taskAPI';
import { meetingAPI } from '../services/api/meetingAPI';
import {
  endOfMonth,
  mapMeetingToCalendarEvent,
  mapTaskToCalendarEvent,
  mergeAndSortCalendarEvents,
  startOfMonth,
  toDateKey,
} from '../utils/calendarUtils';

const LOCAL_STORAGE_LEGACY = 'calendar:events';
const LOCAL_STORAGE_CUSTOM = 'voicehub:calendar:localCustom';

function migrateLegacyLocal() {
  try {
    const legacy = localStorage.getItem(LOCAL_STORAGE_LEGACY);
    if (!legacy) return;
    if (localStorage.getItem(LOCAL_STORAGE_CUSTOM)) return;
    localStorage.setItem(LOCAL_STORAGE_CUSTOM, legacy);
  } catch {
    /* ignore */
  }
}

function loadLocalCustomEvents() {
  migrateLegacyLocal();
  try {
    const raw =
      localStorage.getItem(LOCAL_STORAGE_CUSTOM) || localStorage.getItem(LOCAL_STORAGE_LEGACY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e) => ({
      ...e,
      kind: e.kind || 'local',
      source: 'local',
      startAt: e.startAt ? new Date(e.startAt) : null,
    }));
  } catch {
    return [];
  }
}

/**
 * Feed lịch: task + meeting (API) trong tháng của selectedDate, + sự kiện local (merge).
 * Support lọc theo organizationId nếu cần.
 */
export function useCalendarFeed(selectedDate, organizationId = '') {
  const [apiEvents, setApiEvents] = useState([]);
  const [localEvents, setLocalEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const range = useMemo(() => {
    const from = startOfMonth(selectedDate);
    const to = endOfMonth(selectedDate);
    return { from, to };
  }, [selectedDate]);

  const loadLocal = useCallback(() => {
    setLocalEvents(loadLocalCustomEvents());
  }, []);

  const fetchApi = useCallback(async () => {
    const dueFrom = range.from.toISOString();
    const dueTo = range.to.toISOString();
    const filters = { dueFrom, dueTo };
    if (organizationId) filters.organizationId = organizationId;
    
    const [tRes, mRes] = await Promise.all([
      taskAPI.getTasks(filters),
      meetingAPI.getMeetings({ startFrom: dueFrom, startTo: dueTo, ...(organizationId ? { organizationId } : {}) }),
    ]);

    const taskPayload = tRes.data?.data;
    const tasks = taskPayload?.tasks ?? [];
    const meetingPayload = mRes.data?.data;
    const meetings = meetingPayload?.meetings ?? [];

    const mapped = [];
    for (const t of tasks) {
      const ev = mapTaskToCalendarEvent(t);
      if (ev) mapped.push(ev);
    }
    for (const m of meetings) {
      const ev = mapMeetingToCalendarEvent(m);
      if (ev) mapped.push(ev);
    }
    return mergeAndSortCalendarEvents(mapped);
  }, [range.from, range.to, organizationId]);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const merged = await fetchApi();
      setApiEvents(merged);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Không tải được lịch';
      setError(msg);
      setApiEvents([]);
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  useEffect(() => {
    const onFocus = () => refetch();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refetch]);

  const events = useMemo(() => {
    const ym = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}`;
    const localInMonth = localEvents.filter((e) => e.date && String(e.date).startsWith(ym));
    return mergeAndSortCalendarEvents([...apiEvents, ...localInMonth]);
  }, [apiEvents, localEvents, selectedDate]);

  const tasksForAlerts = useMemo(() => apiEvents.filter((e) => e.kind === 'task' && e.raw), [apiEvents]);

  return {
    events,
    apiEvents,
    localEvents,
    tasksForAlerts,
    loading,
    error,
    refetch,
    reloadLocal: loadLocal,
    range,
    toDateKey,
  };
}
