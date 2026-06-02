const ERROR_CODE_MESSAGES = {
  AUTH_NO_TOKEN: 'Vui lòng đăng nhập lại.',
  AUTH_TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  AUTH_TOKEN_INVALID: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
  AUTH_INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  AUTH_EMAIL_NOT_VERIFIED: 'Vui lòng xác thực email trước khi đăng nhập.',
  AUTH_ACCOUNT_INACTIVE: 'Tài khoản chưa kích hoạt.',
  AUTH_ACCOUNT_LOCKED: 'Tài khoản đang tạm khóa do đăng nhập sai nhiều lần.',
  AUTH_DB_UNAVAILABLE: 'Hệ thống đang bận. Vui lòng thử lại sau ít phút.',
  USER_PROFILE_NOT_FOUND: 'Chưa tìm thấy hồ sơ người dùng.',
  USER_NOT_AUTHENTICATED: 'Vui lòng đăng nhập lại.',
  USER_PROFILE_FORBIDDEN: 'Bạn không có quyền thực hiện hành động này.',
  USER_VALIDATION: 'Dữ liệu chưa hợp lệ.',
};

function stripTechnicalPrefix(message) {
  const raw = String(message || '').trim();
  if (!raw) return '';
  return raw
    .replace(/^error\s+[a-z_ ]+:\s*/i, '')
    .replace(/^error:\s*/i, '')
    .trim();
}

export function resolveApiErrorMessage(errorLike, fallback = 'Đã xảy ra lỗi') {
  const data = errorLike?.data || errorLike?.response?.data || {};
  const code = data?.errorCode || data?.code || '';
  if (code && ERROR_CODE_MESSAGES[code]) return ERROR_CODE_MESSAGES[code];
  const messageUser = data?.messageUser || '';
  if (String(messageUser).trim()) return String(messageUser).trim();
  const msg = stripTechnicalPrefix(data?.message || errorLike?.message || '');
  return msg || fallback;
}

export function extractApiErrorMeta(errorLike) {
  const data = errorLike?.data || errorLike?.response?.data || null;
  return {
    status: errorLike?.status || errorLike?.response?.status || null,
    code: errorLike?.code || '',
    errorCode: data?.errorCode || data?.code || '',
    data,
  };
}
