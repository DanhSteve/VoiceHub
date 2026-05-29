const {
  encryptField,
  decryptFieldSafe,
  isEncrypted,
  isEncryptionEnabled,
  emailBlindIndex,
} = require('./fieldCrypto');
const { unwrapPlaintext } = require('./migration');

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

/** Bộ lọc Mongo tra cứu user theo email (hỗ trợ legacy plaintext + blind index). */
function emailLookupFilter(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  if (isEncryptionEnabled()) {
    const idx = emailBlindIndex(normalized);
    return { $or: [{ emailBlindIndex: idx }, { email: normalized }] };
  }
  return { email: normalized };
}

function readEmailFromStored(stored) {
  if (stored == null || stored === '') return '';
  return String(unwrapPlaintext(stored) || '').trim().toLowerCase();
}

/** Ghi DB: mã hóa email + blind index khi bật ENCRYPTION_MASTER_KEY. */
function writeEmailFields(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { email: '', emailBlindIndex: null };
  }
  if (!isEncryptionEnabled()) {
    return { email: normalized, emailBlindIndex: null };
  }
  return {
    email: encryptField(normalized),
    emailBlindIndex: emailBlindIndex(normalized),
    encV: 1,
  };
}

/**
 * Lazy migration một document — trả plaintext email + patch $set nếu cần mã hóa.
 */
function migrateEmailOnDocument(doc) {
  const normalized = readEmailFromStored(doc?.email);
  if (!normalized || !isEncryptionEnabled()) {
    return { plain: normalized, persist: null };
  }
  if (isEncrypted(doc.email) && doc.emailBlindIndex) {
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
