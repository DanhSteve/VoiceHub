const UserAuth = require('../models/UserAuth');
const {
  emailLookupFilter,
  readEmailFromStored,
  writeEmailFields,
  migrateEmailOnDocument,
  normalizeEmail,
} = require('/shared/utils/emailPii');

async function findUserAuthByEmail(email, options = {}) {
  const filter = emailLookupFilter(email);
  if (!filter) return null;
  let q = UserAuth.findOne(filter);
  if (options.maxTimeMS) q = q.maxTimeMS(options.maxTimeMS);
  if (options.lean) q = q.lean();
  return q;
}

/** Đọc email plaintext + lazy-migrate at-rest nếu cần. */
async function hydrateAuthEmailDoc(doc) {
  if (!doc) return '';
  const { plain, persist } = migrateEmailOnDocument(doc);
  if (persist) {
    Object.assign(doc, persist);
    if (typeof doc.save === 'function') {
      await doc.save();
    } else if (doc._id) {
      await UserAuth.updateOne({ _id: doc._id }, { $set: persist });
    }
  }
  return plain || readEmailFromStored(doc.email);
}

module.exports = {
  findUserAuthByEmail,
  hydrateAuthEmailDoc,
  writeEmailFields,
  normalizeEmail,
  readEmailFromStored,
};
