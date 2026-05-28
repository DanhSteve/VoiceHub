/** @deprecated — dùng orgEventsConsumer.js (wave-3a). Alias export cho server.js. */
const {
  startOrgEventsConsumer,
  stopOrgEventsConsumer,
  processOrgEvent,
} = require('./orgEventsConsumer');

module.exports = {
  startOrgAclConsumer: startOrgEventsConsumer,
  stopOrgAclConsumer: stopOrgEventsConsumer,
  startOrgEventsConsumer,
  stopOrgEventsConsumer,
  processOrgEvent,
};
