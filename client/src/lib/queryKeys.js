/** Query key factories — dùng thống nhất cho cache / invalidate */

export const queryKeys = {
  organizations: {
    all: ['organizations'],
    my: () => [...queryKeys.organizations.all, 'my'],
  },
  org: {
    all: ['org'],
    shell: (orgId) => ['org', String(orgId || ''), 'shell'],
    documentsOverview: (orgId) => ['org', String(orgId || ''), 'documents-overview'],
    channelMessages: (roomId, organizationId = '') => [
      ...queryKeys.org.all,
      'channel-messages',
      String(roomId || ''),
      String(organizationId || ''),
    ],
  },
  friends: {
    all: ['friends'],
    list: (status = 'accepted') => [...queryKeys.friends.all, 'list', status],
    pending: () => [...queryKeys.friends.all, 'pending'],
  },
  notifications: {
    all: ['notifications'],
    badge: (scope, organizationId = '') => [
      ...queryKeys.notifications.all,
      'badge',
      scope,
      String(organizationId || ''),
    ],
    list: (scope, organizationId = '', limit = 50) => [
      ...queryKeys.notifications.all,
      'list',
      scope,
      String(organizationId || ''),
      limit,
    ],
    infinite: (scope, organizationId = '') => [
      ...queryKeys.notifications.all,
      'infinite',
      scope,
      String(organizationId || ''),
    ],
  },
  dashboard: {
    all: ['dashboard'],
    summary: () => [...queryKeys.dashboard.all, 'summary'],
  },
  dm: {
    all: ['dm'],
    messages: (peerId) => [...queryKeys.dm.all, 'messages', String(peerId || '')],
  },
};
