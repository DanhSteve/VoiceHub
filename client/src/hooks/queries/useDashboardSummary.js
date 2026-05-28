import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_ORGS_MS } from '../../lib/queryClient';
import { fetchDashboardSummary } from '../../services/dashboardService';

export function useDashboardSummary({ enabled: enabledProp = true } = {}) {
  const { isAuthenticated } = useAuth();
  const enabled = enabledProp && isAuthenticated;

  return useQuery({
    queryKey: queryKeys.dashboard.summary(),
    queryFn: fetchDashboardSummary,
    staleTime: STALE_TIME_ORGS_MS,
    refetchOnWindowFocus: false,
    enabled,
  });
}
