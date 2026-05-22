import api from '../../services/api';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';

export function unwrapOrganizationsMy(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export async function fetchOrganizationsMy() {
  const payload = await organizationAPI.getOrganizations();
  return unwrapOrganizationsMy(payload);
}

export function unwrapFriendsList(resp) {
  const payload = resp?.data ?? resp;
  const result = payload?.data ?? payload;
  const list = result?.friends ?? result;
  return Array.isArray(list) ? list : [];
}

export async function fetchFriendsList(status = 'accepted') {
  const params = status && status !== 'accepted' ? { status } : {};
  const resp = await friendService.getFriends(params);
  return unwrapFriendsList(resp);
}

export async function fetchFriendPending() {
  const resp = await friendService.getPendingRequests({ skipGlobalErrorHandling: true });
  const raw = resp?.data ?? resp;
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return arr;
}

export async function fetchNotificationBadge({ scope = 'personal', organizationId = '' } = {}) {
  const params = { limit: 1, scope };
  if (scope === 'organization' && organizationId) {
    params.organizationId = String(organizationId);
  }
  const resp = await api.get('/notifications', {
    params,
    skipGlobalErrorHandling: true,
  });
  const d = resp?.data?.data ?? resp?.data ?? resp;
  return {
    unreadCount: Number(d?.unreadCount) || 0,
  };
}

export async function fetchNotificationsPreview({
  scope = 'personal',
  organizationId = '',
  limit = 8,
} = {}) {
  const params = { limit, scope };
  if (scope === 'organization' && organizationId) {
    params.organizationId = String(organizationId);
  }
  const resp = await api.get('/notifications', {
    params,
    skipGlobalErrorHandling: true,
  });
  const nd = resp?.data?.data ?? resp?.data ?? resp;
  return {
    unreadCount: Number(nd?.unreadCount) || 0,
    notifications: Array.isArray(nd?.notifications) ? nd.notifications : [],
  };
}
