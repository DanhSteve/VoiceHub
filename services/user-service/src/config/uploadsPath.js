const path = require('path');

/** Thư mục lưu avatar — một nguồn cho multer + express.static. */
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');

module.exports = { uploadsDir };
