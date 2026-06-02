const crypto = require('crypto');
const {
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  emailBlindIndex,
  parseMasterKey,
} = require('./fieldCrypto');
const { unwrapPlaintext } = require('./migration');
const MAX_EMAIL_LENGTH = 320;
const EMAIL_ENC_PREFIX = 'enc:e1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MAX_EMAIL_CIPHERTEXT_LENGTH = 512;

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function toBase64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(str) {
  const base = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const withPad = base + '='.repeat((4 - (base.length % 4)) % 4);
  return Buffer.from(withPad, 'base64');
}

function deriveEmailKey(masterBuf) {
  return crypto.hkdfSync(
    'sha256',
    masterBuf,
    Buffer.from('voicehub-field'),
    Buffer.from('kid:v1'),
    32
  );
}

function isCompactEmailCipher(value) {
  return typeof value === 'string' && value.startsWith(EMAIL_ENC_PREFIX);
}

function encryptEmailCompact(plain) {
  const master = parseMasterKey();
  if (!master) return String(plain || '');
  const key = deriveEmailKey(master);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${EMAIL_ENC_PREFIX}${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ct)}`;
}

function decryptEmailCompact(stored) {
  if (!isCompactEmailCipher(stored)) return null;
  try {
    const body = String(stored).slice(EMAIL_ENC_PREFIX.length);
    const [ivPart, tagPart, ctPart] = body.split('.');
    if (!ivPart || !tagPart || !ctPart) return '';
    const master = parseMasterKey();
    if (!master) return '';
    const iv = fromBase64Url(ivPart);
    const tag = fromBase64Url(tagPart);
    const ct = fromBase64Url(ctPart);
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return '';
    const key = deriveEmailKey(master);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Bộ lọc Mongo tra cứu user theo email (hỗ trợ plaintext + blind index cho dữ liệu cũ/mã hóa). */
function emailLookupFilter(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const idx = emailBlindIndex(normalized);
  if (!idx) return { email: normalized };
  return { $or: [{ email: normalized }, { emailBlindIndex: idx }] };
}

function readEmailFromStored(stored) {
  if (stored == null || stored === '') return '';
  const source = isCompactEmailCipher(stored) ? decryptEmailCompact(stored) : unwrapPlaintext(stored);
  const normalized = String(source || '').trim().toLowerCase();
  if (normalized.length > MAX_EMAIL_LENGTH) return '';
  return normalized;
}

/** Ghi DB: mã hóa compact cho email để giảm độ dài ciphertext. */
function writeEmailFields(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { email: '', emailBlindIndex: null, encV: 0 };
  }
  if (!isEncryptionEnabled()) {
    return { email: normalized, emailBlindIndex: null, encV: 0 };
  }
  const compact = encryptEmailCompact(normalized);
  if (compact.length <= MAX_EMAIL_CIPHERTEXT_LENGTH) {
    return {
      email: compact,
      emailBlindIndex: emailBlindIndex(normalized),
      encV: 1,
    };
  }
  // Fallback cho trường hợp hiếm khi compact format vượt ngưỡng cho phép.
  return {
    email: encryptField(normalized),
    emailBlindIndex: emailBlindIndex(normalized),
    encV: 1,
  };
}

/**
 * Lazy migration một document — trả plaintext email + patch $set nếu cần mã hóa compact.
 */
function migrateEmailOnDocument(doc) {
  const normalized = readEmailFromStored(doc?.email);
  if (!normalized || !isEncryptionEnabled()) {
    return { plain: normalized, persist: null };
  }
  if ((isEncrypted(doc?.email) || isCompactEmailCipher(doc?.email)) && doc?.emailBlindIndex) {
    return { plain: normalized, persist: null };
  }
  const written = writeEmailFields(normalized);
  return {
    plain: normalized,
    persist: {
      email: written.email,
      emailBlindIndex: written.emailBlindIndex,
      encV: 1,
    },
  };
}

module.exports = {
  normalizeEmail,
  emailLookupFilter,
  readEmailFromStored,
  writeEmailFields,
  migrateEmailOnDocument,
};
