/**
 * Cờ toàn cục: khung nhúng app trên trang landing (HomePage).
 * Chặn mọi thao tác ghi tới backend — tránh demo ghi nhầm vào DB thật.
 */
let active = false;

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

export function setLandingEmbedActive(value) {
  active = Boolean(value);
}

export function isLandingEmbedActive() {
  return active;
}

/**
 * Guard ghi dữ liệu chỉ áp dụng trong khung demo landing ở route "/".
 * Tránh trường hợp cờ embed còn sót sau HMR làm block nhầm các màn hình thật.
 */
export function isLandingEmbedWriteGuardActive() {
  if (!active) return false;
  if (typeof window === 'undefined') return active;
  return String(window.location?.pathname || '') === '/';
}

export function isWriteHttpMethod(method) {
  return WRITE_METHODS.has(String(method || 'get').toLowerCase());
}
