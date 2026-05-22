import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_ORGS_MS } from '../../lib/queryClient';
import { organizationAPI } from '../../services/api/organizationAPI';

const unwrapShell = (payload) => {
  const raw = payload?.data ?? payload;
  return raw?.data ?? raw;
};

export async function fetchOrgShell(orgId) {
  const payload = await organizationAPI.getOrgShell(orgId);
  return unwrapShell(payload);
}

export function useOrgShell(orgId, { enabled: enabledProp = true } = {}) {
  const { isAuthenticated } = useAuth();
  const id = orgId ? String(orgId) : '';
  const enabled = enabledProp && isAuthenticated && Boolean(id);

  return useQuery({
    queryKey: queryKeys.org.shell(id),
    queryFn: () => fetchOrgShell(id),
    staleTime: STALE_TIME_ORGS_MS,
    enabled,
    retry: (failureCount, error) => {
      const status = error?.response?.status ?? error?.status;
      if (status === 404 || status === 403 || status === 401) return false;
      return failureCount < 1;
    },
  });
}
