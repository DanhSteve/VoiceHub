const {
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  decryptFieldSafe,
} = require('./fieldCrypto');

/** Chuẩn hóa Date hoặc chuỗi → YYYY-MM-DD (local calendar). */
function normalizeDateOfBirthToIso(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  if (typeof value === 'string' && isEncrypted(value)) {
    const dec = decryptFieldSafe(value, '');
    if (!dec) return null;
    return normalizeDateOfBirthToIso(dec);
  }

  const str = String(value).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Đọc plaintext ISO hoặc null cho API. */
function readDateOfBirthFromStored(stored) {
  return normalizeDateOfBirthToIso(stored);
}

/** Ghi DB — Date (legacy) khi tắt mã hóa; ciphertext string khi bật. */
function writeDateOfBirthFields(value) {
  const iso = normalizeDateOfBirthToIso(value);
  if (!iso) {
    return { dateOfBirth: null };
  }
  if (!isEncryptionEnabled()) {
    return { dateOfBirth: new Date(iso) };
  }
  return {
    dateOfBirth: encryptField(iso),
    encV: 1,
  };
}

/**
 * Lazy migration — trả plaintext ISO + patch $set nếu cần mã hóa.
 */
function migrateDateOfBirthOnDocument(doc) {
  const iso = readDateOfBirthFromStored(doc?.dateOfBirth);
  if (!iso || !isEncryptionEnabled()) {
    return { plain: iso, persist: null };
  }
  const stored = doc?.dateOfBirth;
  if (typeof stored === 'string' && isEncrypted(stored)) {
    return { plain: iso, persist: null };
  }
  const written = writeDateOfBirthFields(iso);
  return {
    plain: iso,
    persist: {
      dateOfBirth: written.dateOfBirth,
      encV: 1,
    },
  };
}

module.exports = {
  normalizeDateOfBirthToIso,
  readDateOfBirthFromStored,
  writeDateOfBirthFields,
  migrateDateOfBirthOnDocument,
};
