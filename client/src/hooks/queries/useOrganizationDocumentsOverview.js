import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_ORGS_MS } from '../../lib/queryClient';
import { organizationAPI } from '../../services/api/organizationAPI';
import { getResolvedBearerToken } from '../../utils/tokenStorage';
import {
  flattenChannelsFromStructure,
  mapLibraryDocumentToOrgFile,
  mapMessageToOrgFile,
  unwrapApiPayload,
} from '../../features/orgDocuments/orgDocumentUtils';
import { useAppStrings } from '../../locales/appStrings';

const unwrapOverview = (payload) => {
  const raw = unwrapApiPayload(payload);
  return raw?.data ?? raw;
};

/** Map payload BFF → danh sách file (dùng chung hook + loadWorkspaceDocuments). */
export function buildOrgFilesFromOverview(overview, t, locale) {
  if (!overview) return [];
  const branches = Array.isArray(overview.branches) ? overview.branches : [];
  const channels = flattenChannelsFromStructure(branches);
  const channelByRoomId = new Map(channels.map((ch) => [ch._id, ch]));
  const messages = Array.isArray(overview.attachmentMessages) ? overview.attachmentMessages : [];
  const attachmentFiles = messages.map((m) => mapMessageToOrgFile(m, channelByRoomId, t, locale));
  const libraryList = Array.isArray(overview.libraryDocuments) ? overview.libraryDocuments : [];
  const libraryFiles = libraryList.map((doc) => mapLibraryDocumentToOrgFile(doc, t, locale));
  return [...attachmentFiles, ...libraryFiles].sort((a, b) => {
    const ta = new Date(a.raw?.createdAt || a.raw?.updatedAt || 0).getTime();
    const tb = new Date(b.raw?.createdAt || b.raw?.updatedAt || 0).getTime();
    return tb - ta;
  });
}

/** Gọi BFF documents-overview — JWT do apiClient interceptor gắn. */
export async function fetchOrganizationDocumentsOverview(orgId) {
  const id = orgId ? String(orgId) : '';
  if (!id) return null;
  const payload = await organizationAPI.getDocumentsOverview(id);
  return unwrapOverview(payload);
}

export function useOrganizationDocumentsOverview(
  organizationId,
  { enabled: enabledProp = true } = {}
) {
  const { t, locale } = useAppStrings();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const id = organizationId ? String(organizationId) : '';
  const authReady = Boolean(getResolvedBearerToken());

  const query = useQuery({
    queryKey: [...queryKeys.org.documentsOverview(id), authReady ? 'auth' : 'anon'],
    queryFn: () => fetchOrganizationDocumentsOverview(id),
    enabled:
      enabledProp && !authLoading && isAuthenticated && authReady && Boolean(id),
    staleTime: STALE_TIME_ORGS_MS,
    retry: (failureCount, error) => {
      const status = error?.response?.status ?? error?.status;
      if (status === 401 || status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });

  const overview = query.data;
  const files = overview ? buildOrgFilesFromOverview(overview, t, locale) : [];

  const orgName =
    String(overview?.orgName || overview?.organization?.name || '').trim();

  return {
    ...query,
    files,
    orgName,
    overview,
    reload: query.refetch,
  };
}
