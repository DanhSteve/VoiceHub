import apiClient from '../services/api/apiClient';
import { pickAvatarValue } from './avatarDisplay';
import { getResolvedBearerToken } from './tokenStorage';

export function isProtectedUploadPath(value) {
  const raw = pickAvatarValue(value) || String(value || '').trim();
  if (!raw) return false;
  return /\/uploads\//i.test(raw);
}

function uploadPathFromAvatar(avatar) {
  const raw = pickAvatarValue(avatar) || String(avatar || '').trim();
  if (!raw) return '';
  let path = raw.replace(/^https?:\/\/[^/]+/i, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path.split('?')[0];
}

/**
 * Tải avatar/file uploads với JWT (img không gửi được Authorization).
 */
export async function fetchProtectedAvatarBlob({ userId, avatar, cacheBust } = {}) {
  if (userId) {
    const qs = cacheBust ? `?v=${encodeURIComponent(String(cacheBust))}` : '';
    const res = await apiClient.get(`/users/${encodeURIComponent(String(userId))}/avatar${qs}`, {
      responseType: 'blob',
    });
    // apiClient interceptor đã unwrap response.data, nên với blob sẽ trả thẳng Blob.
    return res instanceof Blob ? res : res?.data;
  }

  const path = uploadPathFromAvatar(avatar);
  if (!path || !/\/uploads\//i.test(path)) {
    throw new Error('Protected avatar path required');
  }

  const token = getResolvedBearerToken();
  if (!token) {
    throw new Error('Unauthorized');
  }

  let url = `${window.location.origin}${path}`;
  if (cacheBust) {
    url += `${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(String(cacheBust))}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Avatar fetch failed: ${res.status}`);
  }
  return res.blob();
}
