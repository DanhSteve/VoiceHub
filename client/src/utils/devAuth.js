/**
 * Khi bật (VITE_DISABLE_AUTO_LOGOUT=true): không xóa token / redirect /login khi 401 — tiện debug backend.
 * Nhớ tắt trước khi build production.
 */
export function isAutoLogoutDisabled() {
  const v = import.meta.env.VITE_DISABLE_AUTO_LOGOUT;
  return v === 'true' || v === '1' || v === 1;
}
