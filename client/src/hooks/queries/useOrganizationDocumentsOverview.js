import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { queryKeys } from '../../lib/queryKeys';
import { organizationAPI } from '../../services/api/organizationAPI';
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

async function fetchOrganizationDocumentsOverview(orgId) {
  const payload = await organizationAPI.getDocumentsOverview(orgId);
  return unwrapOverview(payload);
}

export function useOrganizationDocumentsOverview(organizationId) {
  const { t, locale } = useAppStrings();
  const { isAuthenticated } = useAuth();
  const id = organizationId ? String(organizationId) : '';

  const query = useQuery({
    queryKey: queryKeys.org.documentsOverview(id),
    queryFn: () => fetchOrganizationDocumentsOverview(id),
    enabled: isAuthenticated && Boolean(id),
    staleTime: 60_000,
  });

  const overview = query.data;
  const files = overview
    ? (() => {
        const branches = Array.isArray(overview.branches) ? overview.branches : [];
        const channels = flattenChannelsFromStructure(branches);
        const channelByRoomId = new Map(channels.map((ch) => [ch._id, ch]));
        const messages = Array.isArray(overview.attachmentMessages)
          ? overview.attachmentMessages
          : [];
        const attachmentFiles = messages.map((m) =>
          mapMessageToOrgFile(m, channelByRoomId, t, locale)
        );
        const libraryList = Array.isArray(overview.libraryDocuments)
          ? overview.libraryDocuments
          : [];
        const libraryFiles = libraryList.map((doc) =>
          mapLibraryDocumentToOrgFile(doc, t, locale)
        );
        return [...attachmentFiles, ...libraryFiles].sort((a, b) => {
          const ta = new Date(a.raw?.createdAt || a.raw?.updatedAt || 0).getTime();
          const tb = new Date(b.raw?.createdAt || b.raw?.updatedAt || 0).getTime();
          return tb - ta;
        });
      })()
    : [];

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
