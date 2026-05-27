/**
 * Lưu JWT: mặc định localStorage; đặt VITE_TOKEN_STORAGE=sessionStorage để giảm rủi ro persist XSS.
 * getToken() đọc cả hai storage (tránh lệch env / login cũ).
 */
const KEY = 'token';
const TOKEN_CHANGE_EVENT = 'vh-token-changed';

function notifyTokenChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(TOKEN_CHANGE_EVENT));
  }
}

export function onTokenChange(listener) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(TOKEN_CHANGE_EVENT, listener);
  return () => window.removeEventListener(TOKEN_CHANGE_EVENT, listener);
}

export function getTokenStorage() {
  if (typeof window === 'undefined') return null;
  return import.meta.env.VITE_TOKEN_STORAGE === 'sessionStorage' ? sessionStorage : localStorage;
}

/** Đọc JWT — ưu tiên storage cấu hình, fallback storage còn lại. */
export function getToken() {
  if (typeof window === 'undefined') return null;
  try {
    const primary = getTokenStorage();
    const fromPrimary = primary?.getItem(KEY);
    if (fromPrimary) return fromPrimary;
    return localStorage.getItem(KEY) || sessionStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

/** Chuẩn hóa JWT để gắn header Authorization (bỏ prefix Bearer / quote thừa). */
export function normalizeBearerToken(raw) {
  if (!raw) return '';
  let token = String(raw).trim();
  if (!token || token === 'null' || token === 'undefined') return '';
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  return token;
}

/** Token đã chuẩn hóa từ storage — dùng cho mọi axios instance. */
export function getResolvedBearerToken() {
  return normalizeBearerToken(getToken());
}

/**
 * Gắn Authorization vào axios config (api.js + apiClient.js).
 * Luôn gọi trong request interceptor cho route cần JWT.
 */
export function applyAuthHeader(config) {
  if (!config) return config;
  const token = getResolvedBearerToken();
  if (!token) return config;

  if (!config.headers) {
    config.headers = {};
  }

  const value = `Bearer ${token}`;
  if (typeof config.headers.set === 'function') {
    config.headers.set('Authorization', value);
  } else {
    config.headers.Authorization = value;
  }
  return config;
}

/** Ghi JWT vào cả localStorage + sessionStorage — tránh mất token khi đổi VITE_TOKEN_STORAGE. */
export function setToken(token) {
  const value = token != null ? String(token).trim() : '';
  if (!value) return;
  try {
    localStorage.setItem(KEY, value);
    sessionStorage.setItem(KEY, value);
  } catch {
    const s = getTokenStorage();
    if (s) s.setItem(KEY, value);
  }
  notifyTokenChange();
}

export function removeToken() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  const s = getTokenStorage();
  if (s) {
    try {
      s.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }
  notifyTokenChange();
}
