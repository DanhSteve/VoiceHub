/**
 * Đổi thông báo lỗi phiên JWT từ server (thường tiếng Anh) sang tiếng Việt thân thiện.
 */
export function mapAuthSessionMessageForLogout(serverMessage) {
  const raw = String(serverMessage || '').trim();
  const t = raw.toLowerCase();

  if (!raw) {
    return 'Vui lòng đăng nhập lại.';
  }

  if (t === 'token expired' || t.includes('token expired') || (t.includes('token') && t.includes('expired'))) {
    return 'Vui lòng đăng nhập lại.';
  }

  if (t === 'invalid token' || t.includes('invalid token') || t.includes('jsonwebtoken')) {
    return 'Vui lòng đăng nhập lại.';
  }

  if (t.includes('no token provided') || t === 'no token provided') {
    return 'Vui lòng đăng nhập lại.';
  }

  return raw;
}
