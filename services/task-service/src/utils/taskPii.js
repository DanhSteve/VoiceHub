const {
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
} = require('/shared/utils/fieldCrypto');
const { unwrapPlaintext } = require('/shared/utils/migration');
const { recordLazyMigrate } = require('/shared/utils/cryptoMetrics');

const TEXT_FIELDS = ['title', 'summary', 'description'];

function encryptTextIfEnabled(plain) {
  if (plain === undefined || plain === null) return plain;
  const str = String(plain);
  if (!str) return str;
  if (!isEncryptionEnabled()) return str;
  return encryptField(str);
}

function readTextField(stored) {
  if (stored === undefined || stored === null) return stored;
  return unwrapPlaintext(stored);
}

function encryptComments(comments) {
  if (!Array.isArray(comments)) return comments;
  return comments.map((c) => {
    if (!c || typeof c !== 'object') return c;
    const next = { ...c };
    if (next.content !== undefined) {
      next.content = encryptTextIfEnabled(next.content);
    }
    return next;
  });
}

function decryptComments(comments) {
  if (!Array.isArray(comments)) return comments;
  return comments.map((c) => {
    if (!c || typeof c !== 'object') return c;
    return { ...c, content: readTextField(c.content) };
  });
}

function encryptAttachments(attachments) {
  if (!Array.isArray(attachments)) return attachments;
  return attachments.map((a) => {
    if (!a || typeof a !== 'object') return a;
    const next = { ...a };
    if (next.name !== undefined) {
      next.name = encryptTextIfEnabled(next.name);
    }
    return next;
  });
}

function decryptAttachments(attachments) {
  if (!Array.isArray(attachments)) return attachments;
  return attachments.map((a) => {
    if (!a || typeof a !== 'object') return a;
    return { ...a, name: readTextField(a.name) };
  });
}

/** Payload ghi Task — mã hóa các trường text nhạy cảm. */
function writeTaskPayload(input = {}) {
  const out = { ...input };
  for (const key of TEXT_FIELDS) {
    if (out[key] !== undefined) {
      out[key] = encryptTextIfEnabled(out[key]);
    }
  }
  if (out.comments !== undefined) {
    out.comments = encryptComments(out.comments);
  }
  if (out.attachments !== undefined) {
    out.attachments = encryptAttachments(out.attachments);
  }
  if (isEncryptionEnabled() && Object.keys(out).length > 0) {
    out.encV = 1;
  }
  return out;
}

/** Plaintext cho API / webhook. */
function readTaskFromStored(task) {
  if (!task || typeof task !== 'object') return task;
  const o = typeof task.toObject === 'function' ? task.toObject() : { ...task };
  for (const key of TEXT_FIELDS) {
    if (o[key] !== undefined) o[key] = readTextField(o[key]);
  }
  if (o.comments) o.comments = decryptComments(o.comments);
  if (o.attachments) o.attachments = decryptAttachments(o.attachments);
  return o;
}

/** Lazy migration khi đọc task plaintext cũ. */
async function maybeMigrateTaskDoc(TaskModel, doc) {
  if (!doc || !isEncryptionEnabled()) return doc;
  const updates = {};
  for (const key of TEXT_FIELDS) {
    const val = doc[key];
    if (typeof val === 'string' && val && !isEncrypted(val)) {
      updates[key] = encryptField(val);
      recordLazyMigrate();
    }
  }
  if (Array.isArray(doc.comments)) {
    const migrated = encryptComments(doc.comments);
    const changed = JSON.stringify(migrated) !== JSON.stringify(doc.comments);
    if (changed) {
      updates.comments = migrated;
      recordLazyMigrate();
    }
  }
  if (Object.keys(updates).length === 0) return doc;
  updates.encV = 1;
  await TaskModel.updateOne({ _id: doc._id }, { $set: updates });
  Object.assign(doc, updates);
  return doc;
}

module.exports = {
  writeTaskPayload,
  readTaskFromStored,
  maybeMigrateTaskDoc,
  encryptTextIfEnabled,
};
