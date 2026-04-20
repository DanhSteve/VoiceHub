/**
 * TTL message file trên Storage (ms) theo ngữ cảnh.
 * Có thể override bằng biến môi trường.
 */
function ttlMsForRetentionContext(context) {
  const meetingHours = Math.max(1, parseInt(process.env.FILE_RETENTION_MEETING_HOURS || '6', 10) || 6);
  const dmDays = Math.max(1, parseInt(process.env.FILE_RETENTION_DM_DAYS || '180', 10) || 180);
  const orgDays = Math.max(1, parseInt(process.env.FILE_RETENTION_ORG_DAYS || '365', 10) || 365);

  switch (context) {
    case 'meeting':
      return meetingHours * 60 * 60 * 1000;
    case 'org_room':
      return orgDays * 24 * 60 * 60 * 1000;
    case 'dm':
    default:
      return dmDays * 24 * 60 * 60 * 1000;
  }
}

const MAX_UPLOAD_BYTES = Math.min(
  parseInt(process.env.FILE_UPLOAD_MAX_MB || '50', 10) || 50,
  200
) * 1024 * 1024;

/** Danh sách prefix MIME cho phép (env FILE_ALLOWED_MIME, phân tách dấu phẩy). */
const DEFAULT_ALLOWED_MIME =
  [
    'image/',
    'video/',
    'audio/',
    'text/',
    'application/pdf',
    'application/rtf',
    'application/json',
    'application/xml',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/vnd.openxmlformats',
    'application/vnd.ms-',
    'application/msword',
    'application/x-msword',
    'application/vnd.oasis.opendocument',
  ].join(',');

const ALLOWED_MIME_PREFIXES = (process.env.FILE_ALLOWED_MIME || DEFAULT_ALLOWED_MIME)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isMimeAllowed(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (!m) return false;
  /** Trình duyệt thường dùng khi không nhận diện được loại file. */
  if (m === 'application/octet-stream') return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) =>
    prefix.endsWith('/') ? m.startsWith(prefix) : m.startsWith(prefix.toLowerCase())
  );
}

module.exports = {
  ttlMsForRetentionContext,
  MAX_UPLOAD_BYTES,
  isMimeAllowed,
};
