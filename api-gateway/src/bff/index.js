const { publicBffRouter, orgBffRouter } = require('./routes');
const { connectBffRedis } = require('./cache');

module.exports = {
  publicBffRouter,
  orgBffRouter,
  connectBffRedis,
};
