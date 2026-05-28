const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadsDir } = require('../config/uploadsPath');

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.ico',
  '.avif',
  '.jfif',
  '.pjpeg',
  '.heic',
  '.heif',
]);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function resolveExtension(file) {
  const fromName = path.extname(String(file.originalname || '')).toLowerCase();
  if (fromName && ALLOWED_EXTENSIONS.has(fromName)) return fromName;
  const mime = String(file.mimetype || '').toLowerCase();
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  if (mime.startsWith('image/')) return '.jpg';
  return '';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = resolveExtension(file) || '.jpg';
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = resolveExtension(file);
  const mime = String(file.mimetype || '').toLowerCase();
  const mimeOk = mime.startsWith('image/') || mime === 'application/octet-stream';
  if (ext && (mimeOk || mime === '')) {
    return cb(null, true);
  }
  cb(
    new Error(
      'Chỉ chấp nhận ảnh: jpg, jpeg, png, gif, webp, bmp, svg, ico, avif, heic'
    )
  );
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

module.exports = upload;
