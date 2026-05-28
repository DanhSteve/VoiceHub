const { services, buildTrustedHeaders, fetchJson, unwrapPayload } = require('./httpDownstream');

const SUMMARY_TIMEOUT_MS = Math.min(
  8000,
  Math.max(3000, parseInt(process.env.DASHBOARD_SUMMARY_TIMEOUT_MS || '7000', 10) || 7000)
);

function unwrapFriendsList(body) {
  const data = unwrapPayload(body);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.friends)) return data.friends;
  return [];
}

async function sumTaskDoneForOrgs(orgIds, headers) {
  if (!orgIds.length) return { taskDone: 0, failed: false };
  let total = 0;
  let failures = 0;
  const capped = orgIds.slice(0, 8);
  await Promise.all(
    capped.map(async (oid) => {
      const url = `${services.task.url}/api/tasks/statistics?organizationId=${encodeURIComponent(oid)}`;
      const res = await fetchJson(url, headers, `tasks/stats/${oid}`, SUMMARY_TIMEOUT_MS);
      if (!res.ok) {
        failures += 1;
        return;
      }
      const stats = unwrapPayload(res.data);
      const done = Number(stats?.done);
      if (Number.isFinite(done)) total += done;
      else failures += 1;
    })
  );
  return {
    taskDone: failures === capped.length ? null : total,
    failed: failures === capped.length,
  };
}

async function buildDashboardSummary(userId, userEmail) {
  const headers = buildTrustedHeaders(userId, userEmail);
  const startFrom = new Date();
  const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);

  const orgUrl = `${services.organization.url}/api/organizations/my`;
  const friendsUrl = `${services.friend.url}/api/friends`;
  const pendingUrl = `${services.friend.url}/api/friends/pending`;
  const notifUrl = `${services.notification.url}/api/notifications?scope=personal&limit=1`;
  const meetingsUrl = `${services.voice.url}/api/meetings?startFrom=${encodeURIComponent(startFrom.toISOString())}&startTo=${encodeURIComponent(startTo.toISOString())}&limit=8`;

  const [orgRes, friendsRes, pendingRes, notifRes, meetingsRes] = await Promise.all([
    fetchJson(orgUrl, headers, 'organizations/my', SUMMARY_TIMEOUT_MS),
    fetchJson(friendsUrl, headers, 'friends', SUMMARY_TIMEOUT_MS),
    fetchJson(pendingUrl, headers, 'friends/pending', SUMMARY_TIMEOUT_MS),
    fetchJson(notifUrl, headers, 'notifications', SUMMARY_TIMEOUT_MS),
    fetchJson(meetingsUrl, headers, 'meetings', SUMMARY_TIMEOUT_MS),
  ]);

  const orgList = orgRes.ok ? unwrapPayload(orgRes.data) : [];
  const organizations = Array.isArray(orgList) ? orgList : [];
  const orgIds = organizations
    .map((o) => String(o?._id || o?.id || '').trim())
    .filter((id) => /^[a-f\d]{24}$/i.test(id));

  const friendsRaw = friendsRes.ok ? unwrapFriendsList(friendsRes.data) : [];
  const pendingRaw = pendingRes.ok ? unwrapPayload(pendingRes.data) : [];
  const friendsPending = Array.isArray(pendingRaw) ? pendingRaw : [];

  let notificationsUnreadPersonal = 0;
  if (notifRes.ok) {
    const nd = unwrapPayload(notifRes.data);
    notificationsUnreadPersonal = Number(nd?.unreadCount) || 0;
  }

  const { taskDone } = await sumTaskDoneForOrgs(orgIds, headers);

  let upcomingMeetings = [];
  if (meetingsRes.ok) {
    const inner = unwrapPayload(meetingsRes.data);
    const meetings = inner?.meetings ?? inner?.data?.meetings;
    if (Array.isArray(meetings)) {
      upcomingMeetings = meetings.slice(0, 5).map((m) => ({
        id: m._id,
        title: m.title,
        startTime: m.startTime,
        participants: Array.isArray(m.participants) ? m.participants.length : 0,
      }));
    }
  }

  return {
    orgCount: organizations.length,
    friendsTotal: friendsRaw.length,
    pendingCount: friendsPending.length,
    unread: notificationsUnreadPersonal,
    taskDone,
    upcomingMeetings,
    partial: {
      organizations: !orgRes.ok,
      friends: !friendsRes.ok,
      pending: !pendingRes.ok,
      notifications: !notifRes.ok,
      meetings: !meetingsRes.ok,
      tasks: taskDone === null,
    },
  };
}

module.exports = { buildDashboardSummary };
