import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_BADGE_MS } from '../../lib/queryClient';
import { getCachedFriendsPending } from '../../lib/queryCacheSeed';
import { fetchFriendPending } from './fetchers';

export function useFriendPending({ enabled: enabledProp = true } = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;
  const cached = getCachedFriendsPending();

  const query = useQuery({
    queryKey: queryKeys.friends.pending(),
    queryFn: fetchFriendPending,
    staleTime: STALE_TIME_BADGE_MS,
    enabled,
    initialData: cached,
    initialDataUpdatedAt: cached ? Date.now() : undefined,
  });

  const pendingCount = Array.isArray(query.data) ? query.data.length : 0;

  return { ...query, pendingCount, pendingList: query.data ?? [] };
}
