import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_BADGE_MS } from '../../lib/queryClient';
import api from '../../services/api';

const PAGE_SIZE = 20;

async function fetchNotificationsPage({ scope, organizationId, before }) {
  const params = { limit: PAGE_SIZE, scope, fields: 'summary' };
  if (scope === 'organization' && organizationId) {
    params.organizationId = String(organizationId);
  }
  if (before) params.before = before;

  const resp = await api.get('/notifications', {
    params,
    skipGlobalErrorHandling: true,
  });
  const d = resp?.data?.data ?? resp?.data ?? resp;
  return {
    notifications: Array.isArray(d?.notifications) ? d.notifications : [],
    unreadCount: Number(d?.unreadCount) || 0,
    nextBefore: d?.nextBefore || null,
    hasMore: Boolean(d?.hasMore),
  };
}

export function useNotificationsInfinite({
  scope = 'personal',
  organizationId = '',
  enabled: enabledProp = true,
} = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;
  const normalizedScope = scope === 'organization' ? 'organization' : 'personal';

  return useInfiniteQuery({
    queryKey: queryKeys.notifications.infinite(normalizedScope, organizationId),
    queryFn: ({ pageParam }) =>
      fetchNotificationsPage({
        scope: normalizedScope,
        organizationId,
        before: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextBefore ? lastPage.nextBefore : undefined,
    staleTime: STALE_TIME_BADGE_MS,
    enabled,
  });
}

export { PAGE_SIZE as NOTIFICATIONS_PAGE_SIZE };
