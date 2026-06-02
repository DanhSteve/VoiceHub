/* eslint-disable no-console */
const fixtures = [
  { status: 401, body: { success: false, errorCode: 'AUTH_TOKEN_EXPIRED', messageUser: 'Vui lòng đăng nhập lại.' } },
  { status: 403, body: { success: false, errorCode: 'ORG_ACCESS_DENIED', messageUser: 'Bạn không có quyền truy cập' } },
  { status: 404, body: { success: false, errorCode: 'USER_PROFILE_NOT_FOUND', messageUser: 'Chưa tìm thấy hồ sơ người dùng.' } },
  { status: 409, body: { success: false, errorCode: 'ROLE_NAME_EXISTS', messageUser: 'Tên vai trò đã tồn tại.' } },
  { status: 500, body: { success: false, errorCode: 'TASK_INTERNAL_ERROR', messageUser: 'Hệ thống tạm thời gặp sự cố.' } },
];

function assertShape(item) {
  if (!item || typeof item !== 'object') throw new Error('Fixture invalid');
  if (typeof item.status !== 'number') throw new Error('Missing status');
  if (!item.body || typeof item.body !== 'object') throw new Error('Missing body');
  if (!('messageUser' in item.body)) throw new Error(`Missing messageUser for ${item.status}`);
  if (!('errorCode' in item.body) || !String(item.body.errorCode || '').trim()) {
    throw new Error(`Missing errorCode for ${item.status}`);
  }
}

try {
  fixtures.forEach(assertShape);
  console.log('PASS error-response-shape smoke');
  process.exit(0);
} catch (err) {
  console.error('FAIL error-response-shape smoke:', err.message);
  process.exit(1);
}
