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

export function isWriteHttpMethod(method) {
  return WRITE_METHODS.has(String(method || 'get').toLowerCase());
}
