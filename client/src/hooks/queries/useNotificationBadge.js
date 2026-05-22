import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_BADGE_MS } from '../../lib/queryClient';
import { fetchNotificationBadge } from './fetchers';

export function useNotificationBadge({
  scope = 'personal',
  organizationId = '',
  enabled: enabledProp = true,
} = {}) {
  const { isAuthenticated } = useAuth();
  const { connected: socketConnected } = useSocket();
  const enabled = enabledProp && isAuthenticated;
  const normalizedScope = scope === 'organization' ? 'organization' : 'personal';

  const query = useQuery({
    queryKey: queryKeys.notifications.badge(normalizedScope, organizationId),
    queryFn: () =>
      fetchNotificationBadge({
        scope: normalizedScope,
        organizationId,
      }),
    staleTime: socketConnected ? Number.POSITIVE_INFINITY : STALE_TIME_BADGE_MS,
    refetchOnWindowFocus: !socketConnected,
    enabled,
  });

  const unreadCount = query.data?.unreadCount ?? 0;

  return { ...query, unreadCount };
}
