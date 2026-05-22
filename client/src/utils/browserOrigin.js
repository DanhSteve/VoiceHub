/**
 * URL API / signaling khi UI chạy sau reverse proxy (https://voicehub.local).
 * Tránh hardcode localhost:3000 hoặc :3000 trên hostname LAN.
 */

export function isRelativeApiBase() {
  const v = String(import.meta.env.VITE_API_URL || '').trim();
  return !v || v.startsWith('/');
}

/** Base path cho axios — luôn same-origin khi HTTPS hoặc VITE_API_URL relative. */
export function resolveApiBaseUrl() {
  const env = String(import.meta.env.VITE_API_URL || '').trim();
  if (import.meta.env.DEV || isRelativeApiBase()) return '/api';
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    return '/api';
  }
  return env || '/api';
}

/**
 * Origin cho Socket.IO gateway và voice signaling (mediasoup).
 * Ưu tiên trình duyệt đang mở (Nginx TLS), không gắn cổng gateway :3000.
 */
/** Origin UI đang mở (vd. https://voicehub.local) — gửi kèm auth API để link email đúng host. */
export function getBrowserFrontendOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }
  return '';
}

export function resolveAppOrigin() {
  const explicit = String(import.meta.env.VITE_VOICE_SIGNAL_URL || '').trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  const api = resolveApiBaseUrl();
  if (api.startsWith('http')) return api.replace(/\/api\/?$/, '');
  return '';
}
