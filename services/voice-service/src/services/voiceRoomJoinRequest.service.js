const mongoose = require('../db');
const VoiceRoomJoinRequest = require('../models/VoiceRoomJoinRequest');
const voiceRoomLobbyService = require('./voiceRoomLobby.service');
const { isFreePublicLobbyRoom } = require('../utils/voiceRoomKind');

function toObjectId(userId) {
  const s = String(userId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(s);
}

function mapRequest(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(plain._id),
    roomId: plain.roomId,
    userId: String(plain.userId),
    displayName: plain.displayName || '',
    status: plain.status,
    requestedAt: plain.requestedAt,
    resolvedAt: plain.resolvedAt,
    resolvedBy: plain.resolvedBy ? String(plain.resolvedBy) : null,
  };
}

async function assertFreeLobbyRoom(roomId) {
  const rid = String(roomId || '').trim();
  if (!isFreePublicLobbyRoom(rid)) {
    const err = new Error('Join requests are only supported for public voice rooms');
    err.statusCode = 400;
    throw err;
  }
  return rid;
}

async function createOrRefreshRequest({ roomId, userId, displayName }) {
  const rid = await assertFreeLobbyRoom(roomId);
  const uid = toObjectId(userId);
  const host = await voiceRoomLobbyService.isHost(rid, uid);
  if (host) {
    const err = new Error('Host does not need a join request');
    err.statusCode = 400;
    throw err;
  }

  const lobby = await voiceRoomLobbyService.getLobby(rid);
  if (!lobby) {
    const err = new Error('Room host has not started the session yet');
    err.statusCode = 404;
    throw err;
  }

  const name = String(displayName || '').trim().slice(0, 120);
  const existing = await VoiceRoomJoinRequest.findOne({ roomId: rid, userId: uid });
  if (existing) {
    if (existing.status === 'approved') {
      return mapRequest(existing);
    }
    if (existing.status === 'rejected') {
      existing.status = 'pending';
      existing.displayName = name || existing.displayName;
      existing.requestedAt = new Date();
      existing.resolvedAt = null;
      existing.resolvedBy = null;
      await existing.save();
      return mapRequest(existing);
    }
    if (name) existing.displayName = name;
    await existing.save();
    return mapRequest(existing);
  }

  const doc = await VoiceRoomJoinRequest.create({
    roomId: rid,
    userId: uid,
    displayName: name,
    status: 'pending',
    requestedAt: new Date(),
  });
  return mapRequest(doc);
}

async function getRequestForUser(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return null;
  const doc = await VoiceRoomJoinRequest.findOne({ roomId: rid, userId: uid }).lean();
  return mapRequest(doc);
}

async function listPendingForHost(roomId, hostUserId) {
  const rid = await assertFreeLobbyRoom(roomId);
  const isHostUser = await voiceRoomLobbyService.isHost(rid, hostUserId);
  if (!isHostUser) {
    const err = new Error('Only the room host can view pending requests');
    err.statusCode = 403;
    throw err;
  }
  const rows = await VoiceRoomJoinRequest.find({ roomId: rid, status: 'pending' })
    .sort({ requestedAt: 1 })
    .lean();
  return rows.map(mapRequest);
}

async function resolveRequest({ roomId, requestId, hostUserId, status }) {
  const rid = await assertFreeLobbyRoom(roomId);
  const isHostUser = await voiceRoomLobbyService.isHost(rid, hostUserId);
  if (!isHostUser) {
    const err = new Error('Only the room host can resolve join requests');
    err.statusCode = 403;
    throw err;
  }
  if (!mongoose.Types.ObjectId.isValid(String(requestId || ''))) {
    const err = new Error('Invalid request id');
    err.statusCode = 400;
    throw err;
  }
  const doc = await VoiceRoomJoinRequest.findOne({
    _id: requestId,
    roomId: rid,
    status: 'pending',
  });
  if (!doc) {
    const err = new Error('Join request not found');
    err.statusCode = 404;
    throw err;
  }
  doc.status = status === 'approved' ? 'approved' : 'rejected';
  doc.resolvedAt = new Date();
  doc.resolvedBy = toObjectId(hostUserId);
  await doc.save();
  return mapRequest(doc);
}

async function isApproved(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return false;
  const doc = await VoiceRoomJoinRequest.findOne({
    roomId: rid,
    userId: uid,
    status: 'approved',
  }).lean();
  return Boolean(doc);
}

module.exports = {
  createOrRefreshRequest,
  getRequestForUser,
  listPendingForHost,
  resolveRequest,
  isApproved,
  mapRequest,
};
