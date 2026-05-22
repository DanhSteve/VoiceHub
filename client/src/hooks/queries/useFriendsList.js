import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_FRIENDS_MS } from '../../lib/queryClient';
import { fetchFriendsList } from './fetchers';

export function useFriendsList({ status = 'accepted', enabled: enabledProp = true } = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;
  const normalizedStatus = status || 'accepted';

  return useQuery({
    queryKey: queryKeys.friends.list(normalizedStatus),
    queryFn: () => fetchFriendsList(normalizedStatus),
    staleTime: STALE_TIME_FRIENDS_MS,
    enabled,
  });
}
