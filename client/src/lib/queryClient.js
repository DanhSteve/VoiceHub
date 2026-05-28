import { QueryClient } from '@tanstack/react-query';

/** Badge khi socket chưa kết nối — khi connected dùng snapshot `notification:unread_updated` */
export const STALE_TIME_BADGE_MS = 30_000;

/** Danh sách org — ít đổi hơn */
export const STALE_TIME_ORGS_MS = 120_000;

/** Danh sách bạn — trung bình */
export const STALE_TIME_FRIENDS_MS = 60_000;

export const GC_TIME_MS = 10 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: GC_TIME_MS,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
