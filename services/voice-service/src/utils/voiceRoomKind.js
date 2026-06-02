const mongoose = require('../db');

function isFreePublicLobbyRoom(roomId) {
  const rid = String(roomId || '').trim();
  if (!rid.startsWith('room-')) return false;
  if (rid.startsWith('friend-1on1-')) return false;
  return true;
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || '').trim());
}

module.exports = {
  isFreePublicLobbyRoom,
  isObjectId,
};
