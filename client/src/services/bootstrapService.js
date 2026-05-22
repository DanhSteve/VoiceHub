import api from './api';
import { queryClient } from '../lib/queryClient';
import { queryKeys } from '../lib/queryKeys';
import { unwrapApiData } from '../utils/helpers';

let inflightBootstrap = null;

/**
 * GET /api/bootstrap — shell gom user, orgs, badges (gateway BFF).
 * Dedupe in-flight (React StrictMode mount 2 lần).
 */
export async function fetchBootstrap() {
  if (inflightBootstrap) return inflightBootstrap;

  inflightBootstrap = api
    .get('/bootstrap', { skipGlobalErrorHandling: true })
    .then((res) => unwrapApiData(res) ?? res)
    .finally(() => {
      inflightBootstrap = null;
    });

  return inflightBootstrap;
}

/**
 * Hydrate React Query cache từ bootstrap — sidebar/dashboard bỏ fetch trùng.
 */
export function hydrateBootstrapCache(payload) {
  if (!payload || typeof payload !== 'object') return;

  if (Array.isArray(payload.organizations)) {
    queryClient.setQueryData(queryKeys.organizations.my(), payload.organizations, {
      updatedAt: Date.now(),
    });
  }

  if (payload.badges && typeof payload.badges === 'object') {
    queryClient.setQueryData(
      queryKeys.notifications.badge('personal', ''),
      { unreadCount: Number(payload.badges.notificationsUnreadPersonal) || 0 },
      { updatedAt: Date.now() }
    );
  }

  if (Array.isArray(payload.friendsPending)) {
    queryClient.setQueryData(queryKeys.friends.pending(), payload.friendsPending, {
      updatedAt: Date.now(),
    });
  }
}

/** Gọi bootstrap và hydrate cache (sau auth/me). */
export async function loadBootstrapShell() {
  const data = await fetchBootstrap();
  hydrateBootstrapCache(data);
  return data;
}
