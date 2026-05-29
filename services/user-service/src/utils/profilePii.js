const {
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  decryptFieldSafe,
  phoneBlindIndex,
} = require('/shared/utils/fieldCrypto');
const {
  readEmailFromStored,
  writeEmailFields,
  migrateEmailOnDocument,
} = require('/shared/utils/emailPii');
const { unwrapPlaintext } = require('/shared/utils/migration');
const {
  readDateOfBirthFromStored,
  writeDateOfBirthFields,
  migrateDateOfBirthOnDocument,
} = require('/shared/utils/dateOfBirthPii');

function readBioPlain(stored) {
  if (stored == null || stored === '') return '';
  const text = unwrapPlaintext(stored);
  if (typeof text !== 'string') return '';
  if (text.startsWith('enc:v1:')) {
    const decoded = decryptFieldSafe(text, '');
    return decoded && !decoded.startsWith('enc:v1:') ? decoded : '';
  }
  return text;
}

/** Plaintext cho API response (GET /users/me). */
function readPiiFromProfile(plain) {
  return {
    email: readEmailFromStored(plain.email),
    bio: readBioPlain(plain.bio),
    phone: decryptFieldSafe(plain.phone, ''),
    location: unwrapPlaintext(plain.location) || '',
    dateOfBirth: readDateOfBirthFromStored(plain.dateOfBirth),
  };
}

function writeEmailPatch(email) {
  return writeEmailFields(email);
}

async function maybeMigrateProfileEmail(UserProfile, doc) {
  if (!doc) return null;
  const { plain, persist } = migrateEmailOnDocument(doc);
  if (persist && doc._id) {
    await UserProfile.updateOne({ _id: doc._id }, { $set: persist });
    Object.assign(doc, persist);
  }
  return plain;
}

async function maybeMigrateProfilePii(UserProfile, doc) {
  if (!doc) return;
  let persist = null;
  const emailM = migrateEmailOnDocument(doc);
  if (emailM.persist) persist = { ...emailM.persist };
  const dobM = migrateDateOfBirthOnDocument(doc);
  if (dobM.persist) persist = { ...(persist || {}), ...dobM.persist };
  if (persist && doc._id) {
    await UserProfile.updateOne({ _id: doc._id }, { $set: persist });
    Object.assign(doc, persist);
  }
}

/** Chuẩn bị $set khi PATCH profile — mã hóa at-rest khi bật ENCRYPTION_MASTER_KEY. */
function writePiiPatch(input = {}) {
  const out = {};
  if (input.bio !== undefined) {
    const plain = String(input.bio ?? '').trim();
    out.bio = plain && isEncryptionEnabled() ? encryptField(plain) : plain;
  }
  if (input.location !== undefined) {
    const plain = String(input.location ?? '').trim();
    out.location = plain && isEncryptionEnabled() ? encryptField(plain) : plain;
  }
  if (input.phone !== undefined) {
    const plain = String(input.phone ?? '').trim();
    if (!plain) {
      out.phone = '';
      out.phoneBlindIndex = null;
    } else if (isEncryptionEnabled()) {
      out.phone = encryptField(plain);
      out.phoneBlindIndex = phoneBlindIndex(plain);
    } else {
      out.phone = plain;
      out.phoneBlindIndex = null;
    }
  }
  if (input.dateOfBirth !== undefined) {
    Object.assign(out, writeDateOfBirthFields(input.dateOfBirth));
  }
  if (Object.keys(out).length > 0 && isEncryptionEnabled()) {
    out.encV = 1;
  }
  return out;
}

module.exports = {
  readPiiFromProfile,
  writePiiPatch,
  writeEmailPatch,
  writeDateOfBirthFields,
  maybeMigrateProfileEmail,
  maybeMigrateProfilePii,
};
