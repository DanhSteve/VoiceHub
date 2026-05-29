const { socketAuth } = require('/shared/middleware/auth');
const { logger } = require('/shared');
const roomManager = require('../sfu/roomManager');
const voiceRoomSessionService = require('../services/voiceRoomSession.service');

const getUserFromSocket = (socket) => socket.data?.user || socket.user || {};
const callbackError = () => ({ success: false, error: 'Không thể xử lý thao tác thoại lúc này' });

function registerVoiceNamespace(io) {
  const voiceNamespace = io.of('/voice');
  voiceNamespace.use(socketAuth);

  voiceNamespace.on('connection', (socket) => {
    const authUser = getUserFromSocket(socket);
    const userId = authUser.id || authUser.userId || authUser._id || socket.id;
    const displayName = authUser.displayName || authUser.username || authUser.email || `user-${userId}`;
    logger.info(`[voice] user connected ${userId} socket:${socket.id}`);

    socket.on('voice:joinRoom', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId;
        if (!roomId) throw new Error('roomId is required');

        const joined = await roomManager.joinRoom({
          roomId,
          socketId: socket.id,
          userInfo: { ...authUser, userId, displayName },
        });

        const peerCount = Array.isArray(joined.peers) ? joined.peers.length : 1;
        let sessionMeta = null;
        try {
          sessionMeta = await voiceRoomSessionService.onUserJoinRoom({
            roomId: String(roomId),
            userId,
            organizationId: payload.organizationId,
            channelLabel: payload.channelLabel || payload.displayName,
            peerCount,
          });
        } catch (sessionErr) {
          logger.warn(`[voice] session start skipped room=${roomId}: ${sessionErr.message}`);
        }

        socket.data.voiceRoomId = roomId;
        socket.data.voiceJoinedAt = Date.now();
        socket.join(joined.roomTag);

        callback({
          success: true,
          roomId,
          rtpCapabilities: joined.rtpCapabilities,
          peers: joined.peers,
          meetingId: sessionMeta?.meetingId || null,
        });

        socket.to(joined.roomTag).emit('voice:peerJoined', {
          socketId: socket.id,
          userId,
          displayName,
        });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:createTransport', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const direction = payload.direction || 'send';
        const transport = await roomManager.createWebRtcTransport({
          roomId,
          socketId: socket.id,
          direction,
        });
        callback({ success: true, transport });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:connectTransport', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.connectTransport({
          roomId,
          socketId: socket.id,
          transportId: payload.transportId,
          dtlsParameters: payload.dtlsParameters,
        });
        callback({ success: true });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:produce', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const result = await roomManager.produce({
          roomId,
          socketId: socket.id,
          transportId: payload.transportId,
          kind: payload.kind,
          rtpParameters: payload.rtpParameters,
          appData: payload.appData,
        });

        callback({ success: true, ...result });

        socket.to(`voice:${roomId}`).emit('voice:newProducer', {
          producerId: result.producerId,
          socketId: socket.id,
          userId: result.userId,
          displayName: result.displayName,
          kind: result.kind,
        });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:getProducers', (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const producers = roomManager.getProducersForRoom({ roomId, socketId: socket.id });
        callback({ success: true, producers });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:consume', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        const consumer = await roomManager.consume({
          roomId,
          socketId: socket.id,
          transportId: payload.transportId,
          producerId: payload.producerId,
          rtpCapabilities: payload.rtpCapabilities,
        });
        callback({ success: true, consumer });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:resumeConsumer', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.resumeConsumer({
          roomId,
          socketId: socket.id,
          consumerId: payload.consumerId,
        });
        callback({ success: true });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:pauseProducer', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.pauseProducer({
          roomId,
          socketId: socket.id,
          producerId: payload.producerId,
        });
        callback({ success: true });
      } catch (error) {
        callback(callbackError());
      }
    });

    socket.on('voice:resumeProducer', async (payload = {}, callback = () => {}) => {
      try {
        const roomId = payload.roomId || socket.data.voiceRoomId;
        await roomManager.resumeProducer({
          roomId,
          socketId: socket.id,
          producerId: payload.producerId,
        });
        callback({ success: true });
      } catch (error) {
        callback(callbackError());
      }
    });

    const leave = async () => {
      const roomId = socket.data.voiceRoomId;
      if (!roomId) return;
      const roomTag = `voice:${roomId}`;
      const left = roomManager.leaveRoom({ roomId, socketId: socket.id });
      if (left.removed) {
        socket.to(roomTag).emit('voice:peerLeft', {
          socketId: socket.id,
          userId: left.userId,
          displayName: left.displayName,
        });
      }
      if (left.roomClosed) {
        let closedPayload = { roomId: String(roomId), recordingSaved: false };
        try {
          const finalized = await voiceRoomSessionService.finalizeRoomSession(roomId);
          if (finalized) {
            closedPayload = { ...closedPayload, ...finalized };
          }
        } catch (finalizeErr) {
          logger.error(`[voice] finalize session failed room=${roomId}:`, finalizeErr);
        }
        socket.emit('voice:roomClosed', closedPayload);
        voiceNamespace.to(roomTag).emit('voice:roomClosed', closedPayload);
      }
      socket.leave(roomTag);
      delete socket.data.voiceRoomId;
      delete socket.data.voiceJoinedAt;
    };

    socket.on('voice:leaveRoom', (_payload, callback = () => {}) => {
      leave();
      callback({ success: true });
    });

    socket.on('disconnect', () => {
      leave();
      logger.info(`[voice] user disconnected ${userId} socket:${socket.id}`);
    });
  });
}

module.exports = registerVoiceNamespace;
