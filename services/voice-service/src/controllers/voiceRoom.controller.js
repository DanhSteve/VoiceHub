const voiceRoomLobbyService = require('../services/voiceRoomLobby.service');
const voiceRoomJoinRequestService = require('../services/voiceRoomJoinRequest.service');
const voiceRoomInviteService = require('../services/voiceRoomInvite.service');
const voiceRoomNotify = require('../services/voiceRoomNotify.service');
const { rememberLobbyBootstrap } = require('../services/voiceRoomAccess.service');

function getUserId(req) {
  return req.user?.id || req.user?.userId || req.user?._id;
}

function safeErrorMessage(error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) return 'Hệ thống phòng thoại đang bận. Vui lòng thử lại sau.';
  return String(error?.message || fallback);
}

class VoiceRoomController {
  async registerHost(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId } = req.params;
      const lobby = await voiceRoomLobbyService.registerHost(roomId, userId);
      rememberLobbyBootstrap(roomId, userId);
      return res.json({
        success: true,
        data: {
          roomId: lobby.roomId,
          hostUserId: String(lobby.hostUserId),
          joinPolicy: lobby.joinPolicy,
          role: 'host',
        },
      });
    } catch (error) {
      return res.status(Number(error?.statusCode) || 400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể đăng ký chủ phòng'),
      });
    }
  }

  async getLobby(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId } = req.params;
      const lobby = await voiceRoomLobbyService.getLobby(roomId);
      const myRequest = await voiceRoomJoinRequestService.getRequestForUser(roomId, userId);
      const isHost = lobby ? String(lobby.hostUserId) === String(userId) : false;
      return res.json({
        success: true,
        data: {
          roomId: String(roomId),
          hostUserId: lobby ? String(lobby.hostUserId) : null,
          joinPolicy: lobby?.joinPolicy || null,
          role: isHost ? 'host' : 'guest',
          joinRequestStatus: myRequest?.status || 'none',
        },
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể tải thông tin phòng'),
      });
    }
  }

  async createJoinRequest(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId } = req.params;
      const displayName = String(req.body?.displayName || '').trim();
      const request = await voiceRoomJoinRequestService.createOrRefreshRequest({
        roomId,
        userId,
        displayName,
      });
      const lobby = await voiceRoomLobbyService.getLobby(roomId);
      if (lobby?.hostUserId) {
        await voiceRoomNotify.notifyJoinRequestToHost({
          hostUserId: String(lobby.hostUserId),
          roomId,
          requesterName: displayName || 'Người dùng',
          requestId: request.id,
          requestUserId: request.userId,
          frontendUrl: voiceRoomNotify.resolveFrontendUrl(req),
        });
      }
      return res.status(201).json({ success: true, data: request });
    } catch (error) {
      return res.status(Number(error?.statusCode) || 400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể gửi yêu cầu vào phòng'),
      });
    }
  }

  async getMyJoinRequest(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId } = req.params;
      const request = await voiceRoomJoinRequestService.getRequestForUser(roomId, userId);
      return res.json({ success: true, data: request });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể tải yêu cầu'),
      });
    }
  }

  async listJoinRequests(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId } = req.params;
      const rows = await voiceRoomJoinRequestService.listPendingForHost(roomId, userId);
      return res.json({ success: true, data: rows });
    } catch (error) {
      return res.status(Number(error?.statusCode) || 403).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể tải danh sách chờ duyệt'),
      });
    }
  }

  async approveJoinRequest(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId, requestId } = req.params;
      const request = await voiceRoomJoinRequestService.resolveRequest({
        roomId,
        requestId,
        hostUserId: userId,
        status: 'approved',
      });
      rememberLobbyBootstrap(roomId, request.userId);
      await voiceRoomNotify.markJoinRequestNotificationsResolved({
        hostUserId: userId,
        roomId,
        requestId: request.id,
        requestUserId: request.userId,
      });
      return res.json({ success: true, data: request });
    } catch (error) {
      return res.status(Number(error?.statusCode) || 400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể duyệt yêu cầu'),
      });
    }
  }

  async rejectJoinRequest(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId, requestId } = req.params;
      const request = await voiceRoomJoinRequestService.resolveRequest({
        roomId,
        requestId,
        hostUserId: userId,
        status: 'rejected',
      });
      await voiceRoomNotify.markJoinRequestNotificationsResolved({
        hostUserId: userId,
        roomId,
        requestId: request.id,
        requestUserId: request.userId,
      });
      return res.json({ success: true, data: request });
    } catch (error) {
      return res.status(Number(error?.statusCode) || 400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể từ chối yêu cầu'),
      });
    }
  }

  async sendInvites(req, res) {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { roomId } = req.params;
      const friendIds = Array.isArray(req.body?.friendIds) ? req.body.friendIds : [];
      const emails = Array.isArray(req.body?.emails) ? req.body.emails : [];
      const hostName = String(req.body?.hostName || req.user?.displayName || '').trim();
      const result = await voiceRoomInviteService.sendInvites({
        roomId,
        hostUserId: userId,
        hostName,
        friendIds,
        emails,
        req,
      });
      return res.json({ success: true, data: result });
    } catch (error) {
      return res.status(Number(error?.statusCode) || 400).json({
        success: false,
        message: safeErrorMessage(error, 'Không thể gửi lời mời'),
      });
    }
  }
}

module.exports = new VoiceRoomController();
