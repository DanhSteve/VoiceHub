import { useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_FRIENDS_MS } from '../../lib/queryClient';
import { parseMessageListPage } from '../../lib/parseMessageListPage';

const ORG_MSG_PAGE_SIZE = 50;

async function fetchOrgChannelMessages({ roomId, organizationId, pageParam }) {
  const params = {
    roomId,
    limit: ORG_MSG_PAGE_SIZE,
    fields: 'summary',
  };
  if (organizationId) params.organizationId = organizationId;
  if (pageParam && typeof pageParam === 'string') {
    params.pageToken = pageParam;
  } else if (typeof pageParam === 'number' && pageParam > 1) {
    params.page = pageParam;
  }
  const resp = await api.get('/messages', {
    params,
    skipPermissionDeniedToast: true,
  });
  return parseMessageListPage(resp);
}

export function useOrgChannelMessages(roomId, organizationId, { enabled = true } = {}) {
  const { isAuthenticated } = useAuth();
  const rid = roomId ? String(roomId) : '';
  const oid = organizationId ? String(organizationId) : '';

  const query = useInfiniteQuery({
    queryKey: queryKeys.org.channelMessages(rid, oid),
    queryFn: ({ pageParam }) =>
      fetchOrgChannelMessages({ roomId: rid, organizationId: oid, pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.nextPageToken) return lastPage.nextPageToken;
      if (lastPage.hasMore && lastPage.currentPage != null && lastPage.totalPages != null) {
        return lastPage.currentPage < lastPage.totalPages
          ? lastPage.currentPage + 1
          : undefined;
      }
      return undefined;
    },
    staleTime: STALE_TIME_FRIENDS_MS,
    enabled: isAuthenticated && Boolean(rid) && enabled,
  });

  const messagesChronological = useMemo(() => {
    const pages = query.data?.pages || [];
    return pages
      .flatMap((p) => p.messages)
      .slice()
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }, [query.data]);

  const messagesFingerprint = useMemo(() => {
    const pages = query.data?.pages || [];
    return pages
      .map(
        (p, i) =>
          `${i}:${p.messages?.length ?? 0}:${p.nextPageToken ?? ''}:${p.messages?.[0]?._id ?? ''}:${p.messages?.[p.messages?.length - 1]?._id ?? ''}`
      )
      .join('|');
  }, [query.data]);

  return {
    ...query,
    messages: messagesChronological,
    messagesFingerprint,
    pageSize: ORG_MSG_PAGE_SIZE,
    hasMoreOlder: Boolean(query.hasNextPage),
    loadOlderMessages: () => query.fetchNextPage(),
    loadingOlder: query.isFetchingNextPage,
  };
}

export function useInvalidateOrgChannelMessages() {
  const queryClient = useQueryClient();
  return (roomId, organizationId) => {
    const rid = roomId ? String(roomId) : '';
    const oid = organizationId ? String(organizationId) : '';
    queryClient.invalidateQueries({ queryKey: queryKeys.org.channelMessages(rid, oid) });
  };
}
