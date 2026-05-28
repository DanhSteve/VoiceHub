/**
 * Opaque page tokens for list APIs (wave-2e).
 * Payload: { createdAt: ISO8601, id: ObjectId string } → base64url JSON.
 */

function encodePageToken({ createdAt, id }) {
  if (!createdAt || !id) return null;
  const created =
    createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
  const payload = JSON.stringify({ createdAt: created, id: String(id) });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodePageToken(raw) {
  if (!raw) return null;
  try {
    const json = Buffer.from(String(raw).trim(), 'base64url').toString('utf8');
    const { createdAt, id } = JSON.parse(json);
    if (!createdAt || !id) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return { createdAt: date, id: String(id) };
  } catch {
    return null;
  }
}

/**
 * Mongo filter for sort { createdAt: -1, _id: -1 } — trang tiếp theo (cũ hơn).
 */
function pageTokenFilter(pageToken) {
  const tok = decodePageToken(pageToken);
  if (!tok) return null;
  return {
    $or: [
      { createdAt: { $lt: tok.createdAt } },
      { createdAt: tok.createdAt, _id: { $lt: tok.id } },
    ],
  };
}

function nextPageTokenFromDocs(docs, { hasMore }) {
  if (!hasMore || !Array.isArray(docs) || docs.length === 0) return null;
  const last = docs[docs.length - 1];
  const id = last?._id || last?.id;
  const createdAt = last?.createdAt;
  if (!id || !createdAt) return null;
  return encodePageToken({ createdAt, id });
}

module.exports = {
  encodePageToken,
  decodePageToken,
  pageTokenFilter,
  nextPageTokenFromDocs,
};
