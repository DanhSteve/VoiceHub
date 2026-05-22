#!/usr/bin/env node
/**
 * Wave 1B — kiểm tra shell API qua gateway (mọi endpoint phải 200).
 *
 * Mặc định: JWT dev (không cần email/password thật) — chỉ cần userId có profile trong DB.
 *   node devops/scripts/test-bootstrap-api.js
 *
 * Tùy chọn — đăng nhập thật: TEST_EMAIL + TEST_PASSWORD
 * Tùy chọn: TEST_USER_ID, JWT_SECRET, API_BASE_URL
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE = String(process.env.API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
/** userId dev — đổi nếu DB khác; không gửi dữ liệu đăng nhập thật */
const USER_ID = process.env.TEST_USER_ID || '69b29d1ece9946ee300c6a18';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const USER_EMAIL = process.env.TEST_USER_EMAIL || 'bootstrap-test@local';

function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
        rejectUnauthorized: process.env.SKIP_TLS_VERIFY === '1' ? false : true,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = { raw: data };
          }
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function signJwt(userId, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ id: userId, email, iat: now, exp: now + 3600 })
  ).toString('base64url');
  const crypto = require('crypto');
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

async function obtainToken() {
  if (EMAIL && PASSWORD) {
    const login = await request('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    if (login.status !== 200) {
      throw new Error(`Login failed: HTTP ${login.status} — ${login.json?.message || login.raw}`);
    }
    const token =
      login.json?.data?.accessToken ||
      login.json?.accessToken ||
      login.json?.data?.token;
    if (!token) throw new Error('Login OK but no accessToken in response');
    return { token, mode: 'login' };
  }
  return { token: signJwt(USER_ID, USER_EMAIL), mode: 'jwt-dev' };
}

function assertBootstrapContract(json) {
  const data = json?.data;
  if (!json?.success || !data?.user?.id) {
    throw new Error('Bootstrap contract: missing success/data/user.id');
  }
  if (!Array.isArray(data.organizations)) {
    throw new Error('Bootstrap contract: organizations must be array');
  }
  if (
    !data.badges ||
    typeof data.badges.notificationsUnreadPersonal !== 'number' ||
    typeof data.badges.friendPending !== 'number'
  ) {
    throw new Error('Bootstrap contract: badges shape invalid');
  }
}

async function main() {
  console.log('=== Wave 1B Bootstrap API test ===');
  console.log('Base URL:', BASE);

  const { token, mode } = await obtainToken();
  console.log('Auth mode:', mode, mode === 'jwt-dev' ? `(userId=${USER_ID})` : '');
  const auth = { Authorization: `Bearer ${token}` };

  const cases = [
    ['GET /api/auth/me', '/api/auth/me'],
    ['GET /api/bootstrap', '/api/bootstrap', assertBootstrapContract],
    ['GET /api/dashboard/summary', '/api/dashboard/summary'],
    ['GET /api/users/me', '/api/users/me'],
    ['GET /api/organizations/my', '/api/organizations/my'],
    ['GET /api/notifications (personal)', '/api/notifications?scope=personal&limit=20'],
    ['GET /api/friends/pending', '/api/friends/pending'],
  ];

  let failed = 0;
  for (const [name, path, validator] of cases) {
    const res = await request('GET', path, { headers: auth });
    if (res.status !== 200) {
      console.error(`FAIL  ${name}  HTTP ${res.status}`, res.json?.message || '');
      failed += 1;
      continue;
    }
    try {
      if (validator) validator(res.json);
      console.log(`PASS  ${name}  200`);
    } catch (e) {
      console.error(`FAIL  ${name}  ${e.message}`);
      failed += 1;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll shell API checks passed (HTTP 200).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
