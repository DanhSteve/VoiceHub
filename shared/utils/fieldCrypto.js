/**
 * Mã hóa trường dữ liệu nhạy cảm — AES-256-GCM envelope, hỗ trợ xoay key (kid).
 * Yêu cầu ENCRYPTION_MASTER_KEY (>= 32 byte UTF-8 hoặc 64 ký tự hex = 32 byte).
 */
const crypto = require('crypto');

const ALG_LABEL = 'AES-256-GCM';
const IV_LENGTH = 12;
const DEFAULT_KID = 'v1';
const ENVELOPE_PREFIX = 'enc:v1:';

const { recordEncryptOk, recordDecryptFail } = require('./cryptoMetrics');

function parseMasterKey() {
  const raw = process.env.ENCRYPTION_MASTER_KEY || '';
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  if (trimmed.length >= 32) {
    return Buffer.from(trimmed.slice(0, 32), 'utf8');
  }
  return null;
}

function isEncryptionEnabled() {
  return Boolean(parseMasterKey());
}

function deriveFieldKey(masterBuf, kid) {
  return crypto.hkdfSync('sha256', masterBuf, Buffer.from('voicehub-field'), Buffer.from(`kid:${kid}`), 32);
}

/** HMAC blind index (phone lookup / unique) */
function deriveBlindKey(masterBuf) {
  return crypto.hkdfSync('sha256', masterBuf, Buffer.from('voicehub-blind'), Buffer.from('pii'), 32);
}

/**
 * @param {string} normalizedPhone
 * @returns {string} hex digest
 */
function phoneBlindIndex(normalizedPhone) {
  if (!normalizedPhone) return null;
  const master = parseMasterKey();
  if (master) {
    const h = crypto.createHmac('sha256', deriveBlindKey(master));
    h.update(String(normalizedPhone));
    return h.digest('hex');
  }
  return crypto.createHash('sha256').update(`phone|${normalizedPhone}`).digest('hex');
}

/** HMAC blind index cho email (login / unique) khi email at-rest được mã hóa. */
function emailBlindIndex(normalizedEmail) {
  const email = String(normalizedEmail || '')
    .trim()
    .toLowerCase();
  if (!email) return null;
  const master = parseMasterKey();
  if (master) {
    const h = crypto.createHmac('sha256', deriveBlindKey(master));
    h.update(`email|${email}`);
    return h.digest('hex');
  }
  return crypto.createHash('sha256').update(`email|${email}`).digest('hex');
}

function parseEnvelopeString(value) {
  if (typeof value !== 'string' || !value.startsWith(ENVELOPE_PREFIX)) return null;
  const b64 = value.slice(ENVELOPE_PREFIX.length);
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const o = JSON.parse(json);
    if (o && o.v === 1 && o.iv && o.ct && o.tag) return o;
  } catch (e) {
    return null;
  }
  return null;
}

function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  return Boolean(parseEnvelopeString(value));
}

/**
 * @param {string|Buffer|object} plaintext
 * @param {{ kid?: string }} [options]
 * @returns {string}
 */
function encryptField(plaintext, options = {}) {
  if (plaintext === undefined || plaintext === null) return plaintext;
  const master = parseMasterKey();
  if (!master) return typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);

  const str =
    typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const kid = options.kid || DEFAULT_KID;
  const key = deriveFieldKey(master, kid);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    v: 1,
    alg: ALG_LABEL,
    kid,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
  const payload = ENVELOPE_PREFIX + Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
  recordEncryptOk();
  return payload;
}

/**
 * @param {string} ciphertext
 * @returns {string|null}
 */
function decryptField(ciphertext) {
  if (ciphertext === undefined || ciphertext === null) return ciphertext;
  if (typeof ciphertext !== 'string') return String(ciphertext);

  const master = parseMasterKey();
  if (!master) return ciphertext;

  const env = parseEnvelopeString(ciphertext);
  if (!env) return ciphertext;

  try {
    const kid = env.kid || DEFAULT_KID;
    const key = deriveFieldKey(master, kid);
    const iv = Buffer.from(env.iv, 'base64');
    const ct = Buffer.from(env.ct, 'base64');
    const tag = Buffer.from(env.tag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    return plain;
  } catch (e) {
    recordDecryptFail();
    throw e;
  }
}

/**
 * Giải mã an toàn: trả plaintext hoặc placeholder nếu lỗi (để không crash API).
 */
function decryptFieldSafe(ciphertext, fallback = '') {
  try {
    if (!isEncrypted(ciphertext)) return ciphertext;
    return decryptField(ciphertext);
  } catch (e) {
    return fallback;
  }
}

function safeRedact(value, kind = 'default') {
  if (value === undefined || value === null) return value;
  const s = String(value);
  if (kind === 'phone') {
    if (s.length <= 4) return '****';
    return `***${s.slice(-4)}`;
  }
  if (kind === 'token' || kind === 'jwt') {
    if (s.length <= 12) return '[redacted]';
    return `${s.slice(0, 6)}…[redacted]`;
  }
  if (kind === 'content' || kind === 'text') {
    if (s.length <= 20) return '[…]';
    return `${s.slice(0, 6)}…[redacted]`;
  }
  return '[redacted]';
}

module.exports = {
  ALG_LABEL,
  DEFAULT_KID,
  ENVELOPE_PREFIX,
  encryptField,
  decryptField,
  decryptFieldSafe,
  isEncrypted,
  isEncryptionEnabled,
  phoneBlindIndex,
  emailBlindIndex,
  safeRedact,
  parseMasterKey,
};
