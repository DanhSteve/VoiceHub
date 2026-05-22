import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { dmMessageService } from '../../services/dmMessageService';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_FRIENDS_MS } from '../../lib/queryClient';
import { parseMessageListPage } from '../../lib/parseMessageListPage';

export function useDmConversation(peerId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const id = String(peerId || '').trim();

  const query = useInfiniteQuery({
    queryKey: queryKeys.dm.messages(id),
    queryFn: async ({ pageParam }) => {
      const resp = await dmMessageService.getConversation(id, {
        pageToken: pageParam || undefined,
        page: pageParam ? undefined : 1,
        limit: dmMessageService.pageSize,
      });
      return parseMessageListPage(resp);
    },
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
    enabled: Boolean(id) && enabled,
  });

  const messages = (query.data?.pages || []).flatMap((p) => p.messages);

  const setMessagesOptimistic = (updater) => {
    queryClient.setQueryData(queryKeys.dm.messages(id), (old) => {
      if (!old?.pages?.length) return old;
      const nextMessages =
        typeof updater === 'function' ? updater(old.pages.flatMap((p) => p.messages)) : updater;
      const first = { ...old.pages[0], messages: nextMessages };
      return { ...old, pages: [first, ...old.pages.slice(1)] };
    });
  };

  return {
    ...query,
    messages,
    hasMoreOlder: Boolean(query.hasNextPage),
    loadOlderMessages: () => query.fetchNextPage(),
    loadingOlder: query.isFetchingNextPage,
    setMessagesOptimistic,
  };
}
