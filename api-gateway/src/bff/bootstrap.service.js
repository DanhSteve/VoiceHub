const { services, buildTrustedHeaders, fetchJson, unwrapPayload } = require('./httpDownstream');

function mapBootstrapUser(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const id = profile.userId || profile.id || profile._id;
  if (!id) return null;
  return {
    id: String(id),
    userId: String(id),
    _id: String(id),
    email: profile.email || null,
    displayName: profile.displayName || profile.username || profile.name || null,
    username: profile.username || null,
    avatar: profile.avatar || null,
    status: profile.status,
  };
}

function mapOrganizations(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((org) => org && (org._id || org.id))
    .map((org) => {
      const id = org._id || org.id;
      return {
        ...org,
        _id: String(id),
        id: String(id),
        name: org.name,
        slug: org.slug,
        icon: org.logo || org.icon || null,
        myRole: org.myRole,
      };
    });
}

function mapPendingList(raw) {
  return Array.isArray(raw) ? raw : [];
}

/**
 * Gom shell app: user, organizations, badges (+ pending cho hydrate FE).
 */
async function buildBootstrap(userId, userEmail) {
  const headers = buildTrustedHeaders(userId, userEmail);
  const userUrl = `${services.user.url}/api/users/me`;
  const orgUrl = `${services.organization.url}/api/organizations/my`;
  const notifUrl = `${services.notification.url}/api/notifications?scope=personal&limit=1`;
  const friendUrl = `${services.friend.url}/api/friends/pending`;

  const [userRes, orgRes, notifRes, friendRes] = await Promise.all([
    fetchJson(userUrl, headers, 'users/me'),
    fetchJson(orgUrl, headers, 'organizations/my'),
    fetchJson(notifUrl, headers, 'notifications'),
    fetchJson(friendUrl, headers, 'friends/pending'),
  ]);

  const user = mapBootstrapUser(unwrapPayload(userRes.ok ? userRes.data : null));
  if (!user) {
    const err = new Error('User profile unavailable');
    err.statusCode = userRes.status === 404 ? 404 : 503;
    throw err;
  }

  const organizations = orgRes.ok ? mapOrganizations(unwrapPayload(orgRes.data)) : [];
  const friendsPending = friendRes.ok ? mapPendingList(unwrapPayload(friendRes.data)) : [];

  let notificationsUnreadPersonal = 0;
  if (notifRes.ok) {
    const notifData = unwrapPayload(notifRes.data);
    notificationsUnreadPersonal = Number(notifData?.unreadCount) || 0;
  }

  return {
    user,
    organizations,
    badges: {
      notificationsUnreadPersonal,
      friendPending: friendsPending.length,
    },
    friendsPending,
    partial: {
      organizations: !orgRes.ok,
      notifications: !notifRes.ok,
      friends: !friendRes.ok,
    },
  };
}

module.exports = { buildBootstrap };
