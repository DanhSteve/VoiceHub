/** @deprecated — dùng shared/messaging/orgEvents.js (wave-3a). Giữ export cho import cũ. */
const orgEvents = require('./orgEvents');

module.exports = {
  ORG_ACL_EXCHANGE: orgEvents.ORG_EVENT_EXCHANGE,
  ORG_ACL_ROUTING_KEY: orgEvents.ORG_EVENT_TYPES.ACL_UPDATED,
  ORG_ACL_QUEUE: orgEvents.ORG_EVENTS_CHAT_QUEUE,
};
