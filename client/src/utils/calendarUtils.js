/**
 * Hỗ trợ lịch: join window meeting, map API → UI event
 */

export const CALENDAR_JOIN_LEAD_MINUTES = Number(
  import.meta.env.VITE_CALENDAR_MEETING_JOIN_LEAD_MINUTES
) || 30;

export const DEFAULT_MEETING_DURATION_MINUTES = 60;

/** YYYY-MM-DD (local) */
export function toDateKey(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD (UTC) */
export function toDateKeyUTC(d) {
  const x = new Date(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


export function formatTimeLabel(d) {
  return new Date(d).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** Đầu tháng 00:00 local */
export function startOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Cuối tháng 23:59:59 local */
export function endOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Số ngày trong tháng */
export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * @param {object} meetingLike — { startTime, endTime?, status? }
 * @param {Date} [now]
 * @param {{ leadMinutes?: number, defaultDurationMinutes?: number }} [opts]
 */
export function getMeetingJoinState(meetingLike, now = new Date(), opts = {}) {
  const leadMinutes = opts.leadMinutes ?? CALENDAR_JOIN_LEAD_MINUTES;
  const defaultDurationMinutes = opts.defaultDurationMinutes ?? DEFAULT_MEETING_DURATION_MINUTES;
  const leadMs = leadMinutes * 60 * 1000;

  if (!meetingLike?.startTime) {
    return {
      joinEligible: false,
      disabledReason: 'invalid',
      startAt: null,
      endAt: null,
    };
  }

  if (meetingLike.status === 'cancelled' || meetingLike.status === 'ended') {
    return {
      joinEligible: false,
      disabledReason: meetingLike.status,
      startAt: new Date(meetingLike.startTime),
      endAt: meetingLike.endTime ? new Date(meetingLike.endTime) : null,
    };
  }

  const startAt = new Date(meetingLike.startTime);
  const endAt = meetingLike.endTime
    ? new Date(meetingLike.endTime)
    : new Date(startAt.getTime() + defaultDurationMinutes * 60 * 1000);

  const t = now.getTime();
  const windowStart = startAt.getTime() - leadMs;
  const windowEnd = endAt.getTime();

  if (t < windowStart) {
    return {
      joinEligible: false,
      disabledReason: 'too_early',
      startAt,
      endAt,
      secondsUntilWindow: Math.max(0, Math.ceil((windowStart - t) / 1000)),
    };
  }
  if (t > windowEnd) {
    return {
      joinEligible: false,
      disabledReason: 'ended',
      startAt,
      endAt,
    };
  }

  return {
    joinEligible: true,
    disabledReason: null,
    startAt,
    endAt,
  };
}

function colorForPriority(priority) {
  const map = {
    urgent: 'from-red-600 to-orange-500',
    high: 'from-red-500 to-orange-500',
    medium: 'from-orange-500 to-yellow-500',
    low: 'from-slate-500 to-slate-600',
  };
  return map[priority] || map.medium;
}

/**
 * @returns {object|null} UI event
 */
export function mapTaskToCalendarEvent(task) {
  if (!task?.dueDate) return null;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const id = `task:${task._id}`;
  // API date/time có thể đang ở UTC (vd: ISO ...Z).
  // Lấy ngày theo UTC để tránh bị lệch sang ngày khác trong local.
  const date = toDateKeyUTC(due);
  return {

    id,
    kind: 'task',
    source: 'api',
    taskId: String(task._id),
    title: task.title || 'Task',
    date,
    time: formatTimeLabel(due),
    duration: '',
    type: 'deadline',
    status: task.status,
    priority: task.priority,
    description: task.description || '',
    color: colorForPriority(task.priority),
    startAt: due,
    endAt: due,
    raw: task,
  };
}

function formatDurationFromMinutes(mins) {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} giờ ${m} phút` : `${h} giờ`;
  }
  return `${mins} phút`;
}

/**
 * @returns {object|null} UI event
 */
export function mapMeetingToCalendarEvent(meeting) {
  if (!meeting?.startTime) return null;
  const start = new Date(meeting.startTime);
  if (Number.isNaN(start.getTime())) return null;

  const end = meeting.endTime
    ? new Date(meeting.endTime)
    : new Date(start.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60 * 1000);
  const durationMins = Math.max(1, Math.round((end - start) / 60000));

  const id = `meeting:${meeting._id}`;
  // API date/time có thể đang ở UTC (vd: ISO ...Z).
  // Lấy ngày theo UTC để tránh bị lệch sang ngày khác trong local.
  const date = toDateKeyUTC(start);
  return {
    id,
    kind: 'meeting',
    source: 'api',
    meetingId: String(meeting._id),
    title: meeting.title || 'Meeting',
    date,
    time: formatTimeLabel(start),
    duration: formatDurationFromMinutes(durationMins),
    type: 'meeting',
    location: '',
    description: meeting.description || '',
    attendees: Array.isArray(meeting.participants) ? meeting.participants.length : 0,
    attendeeNames: [],
    color: 'from-blue-500 to-cyan-500',
    startAt: start,
    endAt: end,
    raw: meeting,
  };
}

/** Gộp và sắp theo startAt */
export function mergeAndSortCalendarEvents(events) {
  return [...events].sort((a, b) => {
    const ta = a.startAt ? new Date(a.startAt).getTime() : 0;
    const tb = b.startAt ? new Date(b.startAt).getTime() : 0;
    return ta - tb;
  });
}

/** Ô lưới tháng: 6 hàng x 7 cột (Chủ nhật đầu tuần) */
export function getMonthGridCells(viewDate) {
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  const firstDay = new Date(y, m, 1);
  const startWeekday = firstDay.getDay();
  const dim = daysInMonth(y, m);
  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) {
    cells.push({ type: 'empty', key: `pad-${i}` });
  }
  for (let d = 1; d <= dim; d += 1) {
    cells.push({
      type: 'day',
      day: d,
      date: new Date(y, m, d),
      key: `day-${d}`,
    });
  }
  while (cells.length < 42) {
    cells.push({ type: 'empty', key: `trail-${cells.length}` });
  }
  return cells;
}
