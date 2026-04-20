/**
 * Lưu JWT: mặc định localStorage; đặt VITE_TOKEN_STORAGE=sessionStorage để giảm rủi ro persist XSS (tab đóng là mất token).
 * Lộ trình đầy đủ: refresh httpOnly cookie (xem docs/AUTH_HTTPONLY.md).
 */
const KEY = 'token';

export function getTokenStorage() {
  if (typeof window === 'undefined') return null;
  return import.meta.env.VITE_TOKEN_STORAGE === 'sessionStorage' ? sessionStorage : localStorage;
}

export function getToken() {
  const s = getTokenStorage();
  if (!s) return null;
  return s.getItem(KEY);
}

export function setToken(token) {
  const s = getTokenStorage();
  if (!s) return;
  s.setItem(KEY, token);
}

export function removeToken() {
  const s = getTokenStorage();
  if (!s) return;
  s.removeItem(KEY);
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
