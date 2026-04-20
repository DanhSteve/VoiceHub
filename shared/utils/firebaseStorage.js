/**
 * Firebase Storage (Admin SDK): signed URL upload, copy, delete, read URL.
 * Bật khi đủ biến môi trường FIREBASE_* — nếu thiếu, isEnabled() === false.
 */
const logger = require('./logger');

let adminApp;
let bucketInstance;

function getPrivateKey() {
  const raw = process.env.FIREBASE_PRIVATE_KEY;
  if (!raw) return null;
  return String(raw).replace(/\\n/g, '\n');
}

function isEnabled() {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    getPrivateKey() &&
    process.env.FIREBASE_STORAGE_BUCKET
  );
}

function getBucket() {
  if (!isEnabled()) return null;
  if (!adminApp) {
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: getPrivateKey(),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    }
    adminApp = admin;
  }
  if (!bucketInstance) {
    const admin = require('firebase-admin');
    bucketInstance = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET);
  }
  return bucketInstance;
}

const DEFAULT_UPLOAD_URL_MINUTES = 15;

/** GCS signed URL V4: tối đa 7 ngày (604800 giây). */
const MAX_V4_SIGNED_URL_MS = 7 * 24 * 60 * 60 * 1000;

function capSignedUrlTtlMs(ttlMs) {
  const n = Number(ttlMs);
  if (!Number.isFinite(n) || n <= 0) return MAX_V4_SIGNED_URL_MS;
  return Math.min(n, MAX_V4_SIGNED_URL_MS);
}

/**
 * @param {string} storagePath - ví dụ temp/userId/uuid_name.ext
 * @param {string} contentType
 * @param {number} [ttlMinutes]
 * @returns {Promise<{ uploadUrl: string, expires: Date }>}
 */
async function getSignedUploadUrl(storagePath, contentType, ttlMinutes = DEFAULT_UPLOAD_URL_MINUTES) {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error('Firebase Storage is not configured');
  }
  const file = bucket.file(storagePath);
  const ttlMs = capSignedUrlTtlMs(ttlMinutes * 60 * 1000);
  const expires = Date.now() + ttlMs;
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires,
    contentType: contentType || 'application/octet-stream',
  });
  return { uploadUrl, expires: new Date(expires) };
}

/**
 * Signed URL đọc file (tải xuống). ttlMs bị giới hạn tối đa MAX_V4_SIGNED_URL_MS (7 ngày — giới hạn GCS).
 */
async function getSignedReadUrl(storagePath, ttlMs = MAX_V4_SIGNED_URL_MS) {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error('Firebase Storage is not configured');
  }
  const file = bucket.file(storagePath);
  const expires = Date.now() + capSignedUrlTtlMs(ttlMs);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires,
  });
  return { url, expires: new Date(expires) };
}

async function deleteObject(storagePath) {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error('Firebase Storage is not configured');
  }
  try {
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
    return true;
  } catch (err) {
    logger.warn(`[firebaseStorage] delete ${storagePath}: ${err.message}`);
    throw err;
  }
}

/**
 * Copy object trong bucket (temp -> tasks/...).
 */
async function copyObject(srcPath, destPath) {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error('Firebase Storage is not configured');
  }
  await bucket.file(srcPath).copy(bucket.file(destPath));
  return destPath;
}

/**
 * Tên object trên GCS: giữ Unicode (tiếng Việt, khoảng trắng hợp lệ), chỉ loại ký tự nguy hiểm cho path.
 */
function sanitizeFileName(name) {
  const base = String(name || 'file').split(/[/\\]/).pop() || 'file';
  try {
    const n = base.normalize('NFC');
    const cleaned = n
      .replace(/[\u0000-\u001F\u007F<>:"|?*\\]/g, '_')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return cleaned.slice(0, 200) || 'file';
  } catch {
    return base.replace(/[\u0000-\u001F\u007F<>:"|?*\\/]/g, '_').slice(0, 200) || 'file';
  }
}

module.exports = {
  isEnabled,
  getBucket,
  getSignedUploadUrl,
  getSignedReadUrl,
  deleteObject,
  copyObject,
  sanitizeFileName,
  DEFAULT_UPLOAD_URL_MINUTES,
  MAX_V4_SIGNED_URL_MS,
};
