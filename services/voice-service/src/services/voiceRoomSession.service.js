const mongoose = require('../db');
const Meeting = require('../models/Meeting');
const meetingService = require('./meeting.service');
const { logger } = require('/shared');

const MIN_RECORDING_SEC = 300;

/** @type {Map<string, { meetingId: string, startedAt: number, userIds: Set<string>, peakPeers: number, organizationId?: string }>} */
const activeByRoom = new Map();

function toObjectIdOrNull(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

async function onUserJoinRoom({ roomId, userId, organizationId, channelLabel, peerCount }) {
  const roomKey = String(roomId);
  const uid = String(userId);
  let session = activeByRoom.get(roomKey);

  if (!session) {
    const hostOid = toObjectIdOrNull(uid);
    if (!hostOid) {
      throw new Error('Invalid user id for voice session');
    }
    const orgOid = toObjectIdOrNull(organizationId);
    const channelOid = toObjectIdOrNull(roomKey);
    const titleBase = String(channelLabel || 'Voice').trim() || 'Voice';
    const meeting = new Meeting({
      title: `Họp thoại — ${titleBase}`.slice(0, 120),
      hostId: hostOid,
      organizationId: orgOid || undefined,
      voiceChannelId: channelOid || undefined,
      status: 'active',
      startTime: new Date(),
      isRecording: true,
      participants: [{ userId: hostOid, joinedAt: new Date() }],
    });
    await meeting.save();
    session = {
      meetingId: String(meeting._id),
      startedAt: Date.now(),
      userIds: new Set([uid]),
      peakPeers: Math.max(1, Number(peerCount) || 1),
      organizationId: organizationId ? String(organizationId) : undefined,
    };
    activeByRoom.set(roomKey, session);
    logger.info(`Voice room session started meeting=${session.meetingId} room=${roomKey}`);
    return { meetingId: session.meetingId, isNew: true };
  }

  session.userIds.add(uid);
  session.peakPeers = Math.max(session.peakPeers, Number(peerCount) || 1);
  try {
    await meetingService.addParticipant(session.meetingId, uid);
  } catch (error) {
    logger.warn(`addParticipant voice session failed: ${error.message}`);
  }
  return { meetingId: session.meetingId, isNew: false };
}

async function finalizeRoomSession(roomId) {
  const roomKey = String(roomId);
  const session = activeByRoom.get(roomKey);
  if (!session) return null;

  activeByRoom.delete(roomKey);
  const durationSec = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
  const uniqueParticipants = session.userIds.size;
  /** Ghi từ lúc vào phòng; chỉ persist bản ghi khi phiên >= 5 phút. */
  const shouldSaveRecording = durationSec >= MIN_RECORDING_SEC;

  if (shouldSaveRecording) {
    await Meeting.findByIdAndUpdate(session.meetingId, {
      $set: {
        status: 'ended',
        endTime: new Date(),
        isRecording: false,
        recordingUrl: `voicehub://meetings/${session.meetingId}/recording`,
      },
    });
    logger.info(
      `Voice room session saved meeting=${session.meetingId} room=${roomKey} duration=${durationSec}s`
    );
  } else {
    await Meeting.findByIdAndDelete(session.meetingId);
    logger.info(
      `Voice room session discarded (<${MIN_RECORDING_SEC}s) meeting=${session.meetingId} room=${roomKey} duration=${durationSec}s`
    );
  }

  return {
    roomId: roomKey,
    meetingId: shouldSaveRecording ? session.meetingId : null,
    durationSec,
    peakPeers: session.peakPeers,
    uniqueParticipants,
    recordingSaved: shouldSaveRecording,
  };
}

module.exports = {
  MIN_RECORDING_SEC,
  onUserJoinRoom,
  finalizeRoomSession,
};
