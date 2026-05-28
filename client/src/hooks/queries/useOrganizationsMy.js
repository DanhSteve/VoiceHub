import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_ORGS_MS } from '../../lib/queryClient';
import { getCachedOrganizationsMy } from '../../lib/queryCacheSeed';
import { fetchOrganizationsMy } from './fetchers';

export function useOrganizationsMy({ enabled: enabledProp = true } = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;
  const cached = getCachedOrganizationsMy();
  const initialUpdatedAtRef = useRef(
    cached ? Date.now() : undefined
  );

  return useQuery({
    queryKey: queryKeys.organizations.my(),
    queryFn: fetchOrganizationsMy,
    staleTime: STALE_TIME_ORGS_MS,
    enabled,
    initialData: cached,
    initialDataUpdatedAt: initialUpdatedAtRef.current,
    placeholderData: (previousData) => previousData ?? cached,
  });
}
