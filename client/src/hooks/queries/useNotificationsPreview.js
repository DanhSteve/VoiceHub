import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_BADGE_MS } from '../../lib/queryClient';
import { fetchNotificationsPreview } from './fetchers';

export function useNotificationsPreview({
  scope = 'personal',
  organizationId = '',
  limit = 8,
  enabled: enabledProp = true,
} = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;
  const normalizedScope = scope === 'organization' ? 'organization' : 'personal';

  return useQuery({
    queryKey: queryKeys.notifications.list(normalizedScope, organizationId, limit),
    queryFn: () =>
      fetchNotificationsPreview({
        scope: normalizedScope,
        organizationId,
        limit,
      }),
    staleTime: STALE_TIME_BADGE_MS,
    enabled,
  });
}
