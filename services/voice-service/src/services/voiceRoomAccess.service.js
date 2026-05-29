const mongoose = require('../db');
const Meeting = require('../models/Meeting');
const callSessionService = require('./callSession.service');
const { assertOrgVoiceChannelAccess } = require('../utils/orgVoiceChannelAccess');

/** userId đã gọi bootstrap cho phòng lobby mã tự do (Zoom-style). */
const lobbyBootstrapUsers = new Map();

function rememberLobbyBootstrap(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return;
  if (!lobbyBootstrapUsers.has(rid)) {
    lobbyBootstrapUsers.set(rid, new Set());
  }
  lobbyBootstrapUsers.get(rid).add(uid);
}

function hasLobbyBootstrap(roomId, userId) {
  const set = lobbyBootstrapUsers.get(String(roomId || '').trim());
  return Boolean(set && set.has(String(userId || '').trim()));
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || '').trim());
}

async function findMeetingForRoom(roomId) {
  const rid = String(roomId || '').trim();
  if (!rid || !isObjectId(rid)) return null;
  const byId = await Meeting.findById(rid).lean();
  if (byId) return byId;
  const channelOid = new mongoose.Types.ObjectId(rid);
  const byChannel = await Meeting.findOne({
    voiceChannelId: channelOid,
    status: { $in: ['scheduled', 'active'] },
  })
    .sort({ updatedAt: -1 })
    .lean();
  return byChannel || null;
}

function userInMeeting(meeting, userId) {
  const uid = String(userId || '').trim();
  if (!meeting || !uid) return false;
  if (String(meeting.hostId) === uid) return true;
  return (meeting.participants || []).some(
    (p) => String(p.userId) === uid && !p.leftAt
  );
}

/**
 * Kiểm tra quyền join/bootstrap phòng voice (friend / org channel / meeting / lobby mã).
 */
async function assertVoiceRoomAccess({ roomId, userId, organizationId, authorizationHeader }) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) {
    const err = new Error('roomId and userId are required');
    err.statusCode = 400;
    throw err;
  }

  if (rid.startsWith('friend-1on1-')) {
    return callSessionService.assertFriendCallRoomAccess(rid, uid);
  }

  const orgId = String(organizationId || '').trim();
  if (orgId) {
    const access = await assertOrgVoiceChannelAccess({
      userId: uid,
      organizationId: orgId,
      channelId: rid,
      authorizationHeader,
    });
    if (!access.allowed) {
      const err = new Error('Forbidden');
      err.statusCode = 403;
      throw err;
    }
    return { kind: 'org_channel', organizationId: orgId };
  }

  const meeting = await findMeetingForRoom(rid);
  if (meeting) {
    if (!userInMeeting(meeting, uid)) {
      const err = new Error('Not a meeting participant');
      err.statusCode = 403;
      throw err;
    }
    return { kind: 'meeting', meetingId: String(meeting._id) };
  }

  if (!hasLobbyBootstrap(rid, uid)) {
    const err = new Error('Bootstrap required before joining this room');
    err.statusCode = 403;
    throw err;
  }
  return { kind: 'lobby' };
}

module.exports = {
  rememberLobbyBootstrap,
  assertVoiceRoomAccess,
  findMeetingForRoom,
  userInMeeting,
};
