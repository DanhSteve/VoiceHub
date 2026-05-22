const axios = require('axios');

/**
 * Username hợp lệ cho UserProfile (3–30 ký tự, không khoảng trắng thừa).
 */
/** Họ + tên (lastName trước firstName). */
function buildDisplayName(firstName, lastName) {
  const name = `${lastName || ''} ${firstName || ''}`.trim();
  return name.slice(0, 100);
}

function buildBootstrapUsername(firstName, lastName, email, userId) {
  const rawName = buildDisplayName(firstName, lastName);
  const fromEmail = String(email || '')
    .split('@')[0]
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24);

  let base = rawName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  if (base.length < 3) base = fromEmail;
  if (base.length < 3) base = `user${String(userId || '').slice(-6)}`;
  return base.slice(0, 30);
}

/**
 * Gọi user-service POST /api/users/internal/bootstrap (không qua webhook).
 * @returns {Promise<{ ok: boolean, reason?: string, data?: object }>}
 */
async function bootstrapUserProfile(userAuth, userId) {
  const uid = userId != null ? String(userId) : String(userAuth?.userId || '');
  if (!uid) {
    return { ok: false, reason: 'missing_user_id' };
  }

  const internalToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  if (!internalToken) {
    console.error(
      '[bootstrapUserProfile] USER_SERVICE_INTERNAL_TOKEN not set — không tạo được UserProfile. Đồng bộ root .env + docker-compose.'
    );
    return { ok: false, reason: 'missing_internal_token' };
  }

  const userServiceUrl = (process.env.USER_SERVICE_URL || 'http://user-service:3004').replace(
    /\/+$/,
    ''
  );
  const displayName = buildDisplayName(userAuth.firstName, userAuth.lastName);
  const username = buildBootstrapUsername(
    userAuth.firstName,
    userAuth.lastName,
    userAuth.email,
    uid
  );

  try {
    const response = await axios.post(
      `${userServiceUrl}/api/users/internal/bootstrap`,
      {
        userId: uid,
        username,
        email: userAuth.email,
        displayName,
        dateOfBirth: userAuth.dateOfBirth || undefined,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        timeout: Number(process.env.USER_BOOTSTRAP_TIMEOUT_MS || 15000),
      }
    );

    console.log('[bootstrapUserProfile] OK for', userAuth.email, response.status);
    return { ok: true, data: response.data };
  } catch (error) {
    const status = error.response?.status;
    const body = error.response?.data;
    console.error(
      '[bootstrapUserProfile] Failed:',
      userAuth.email,
      status || error.code,
      body?.message || error.message
    );
    return {
      ok: false,
      reason: body?.message || error.message,
      status,
    };
  }
}

module.exports = {
  bootstrapUserProfile,
  buildBootstrapUsername,
  buildDisplayName,
};
