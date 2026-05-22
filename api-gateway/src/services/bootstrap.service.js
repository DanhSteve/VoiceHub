/** @deprecated — dùng `src/bff/bootstrap.service.js` */
const { buildTrustedHeaders } = require('../bff/httpDownstream');
const { buildBootstrap } = require('../bff/bootstrap.service');

async function getBootstrap(userId, userEmail) {
  return buildBootstrap(userId, userEmail);
}

module.exports = {
  getBootstrap,
  buildTrustedHeaders,
};
