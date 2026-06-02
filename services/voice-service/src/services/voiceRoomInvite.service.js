const voiceRoomLobbyService = require('./voiceRoomLobby.service');
const voiceRoomNotify = require('./voiceRoomNotify.service');

async function sendInvites({ roomId, hostUserId, hostName, friendIds = [], emails = [], req }) {
  const rid = String(roomId || '').trim();
  const isHost = await voiceRoomLobbyService.isHost(rid, hostUserId);
  if (!isHost) {
    const err = new Error('Only the room host can send invites');
    err.statusCode = 403;
    throw err;
  }

  const frontendUrl = voiceRoomNotify.resolveFrontendUrl(req);
  const friendIdList = [...new Set((friendIds || []).map((id) => String(id).trim()).filter(Boolean))];
  const emailList = [...new Set((emails || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

  const notifiedFriendIds = [];
  for (const fid of friendIdList) {
    if (String(fid) === String(hostUserId)) continue;
    await voiceRoomNotify.notifyVoiceRoomInvite({
      userId: fid,
      roomId: rid,
      hostName,
      frontendUrl,
    });
    notifiedFriendIds.push(fid);
  }

  const emailResults = [];
  for (const email of emailList) {
    const existingUserId = await voiceRoomNotify.lookupUserIdByEmail(email);
    if (existingUserId && existingUserId !== String(hostUserId)) {
      await voiceRoomNotify.notifyVoiceRoomInvite({
        userId: existingUserId,
        roomId: rid,
        hostName,
        frontendUrl,
      });
      emailResults.push({ email, channel: 'notification', userId: existingUserId });
      continue;
    }
    const mail = await voiceRoomNotify.sendVoiceRoomInviteEmail({
      email,
      roomId: rid,
      hostName,
      frontendUrl,
    });
    emailResults.push({ email, channel: 'email', ...mail });
  }

  return {
    roomId: rid,
    friendsNotified: notifiedFriendIds.length,
    emails: emailResults,
  };
}

module.exports = {
  sendInvites,
};
