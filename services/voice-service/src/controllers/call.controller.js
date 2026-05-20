const callSessionService = require('../services/callSession.service');
const { logger } = require('/shared');

function userIdFromReq(req) {
  return req.user?.id || req.user?.userId || req.user?._id;
}

class CallController {
  async initiate(req, res) {
    try {
      const callerId = userIdFromReq(req);
      if (!callerId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const calleeId = req.body?.calleeId ?? req.body?.toUserId;
      const media = req.body?.media;
      const session = await callSessionService.initiate({
        callerId: String(callerId),
        calleeId: String(calleeId || '').trim(),
        media,
        authorizationHeader: req.headers.authorization,
      });
      return res.status(201).json({
        success: true,
        data: {
          callId: String(session._id),
          roomId: session.roomId,
          status: session.status,
          media: session.media,
          expiresAt: session.expiresAt,
        },
      });
    } catch (error) {
      const code = error.statusCode || 400;
      if (code >= 500) logger.error('call initiate error:', error);
      else logger.warn('call initiate:', error.message);
      const body = { success: false, message: error.message || 'Lỗi khởi tạo cuộc gọi' };
      if (error.existingCallId) body.existingCallId = error.existingCallId;
      return res.status(code).json(body);
    }
  }

  async getCall(req, res) {
    try {
      const userId = userIdFromReq(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const { callId } = req.params;
      const doc = await callSessionService.getByIdForUser(callId, userId);
      return res.json({
        success: true,
        data: {
          callId: String(doc._id),
          roomId: doc.roomId,
          callerId: doc.callerId,
          calleeId: doc.calleeId,
          status: doc.status,
          media: doc.media,
          startedAt: doc.startedAt,
          endedAt: doc.endedAt,
          expiresAt: doc.expiresAt,
          endedReason: doc.endedReason,
        },
      });
    } catch (error) {
      const code = error.statusCode || 400;
      return res.status(code).json({ success: false, message: error.message || 'Error' });
    }
  }

  async accept(req, res) {
    try {
      const userId = userIdFromReq(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const doc = await callSessionService.accept(req.params.callId, userId);
      return res.json({
        success: true,
        data: {
          callId: String(doc._id),
          roomId: doc.roomId,
          status: doc.status,
        },
      });
    } catch (error) {
      const code = error.statusCode || 400;
      return res.status(code).json({ success: false, message: error.message || 'Error' });
    }
  }

  async reject(req, res) {
    try {
      const userId = userIdFromReq(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const doc = await callSessionService.reject(req.params.callId, userId);
      return res.json({
        success: true,
        data: { callId: String(doc._id), status: doc.status },
      });
    } catch (error) {
      const code = error.statusCode || 400;
      return res.status(code).json({ success: false, message: error.message || 'Error' });
    }
  }

  async cancel(req, res) {
    try {
      const userId = userIdFromReq(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const doc = await callSessionService.cancel(req.params.callId, userId);
      return res.json({
        success: true,
        data: { callId: String(doc._id), status: doc.status },
      });
    } catch (error) {
      const code = error.statusCode || 400;
      return res.status(code).json({ success: false, message: error.message || 'Error' });
    }
  }

  async end(req, res) {
    try {
      const userId = userIdFromReq(req);
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const doc = await callSessionService.end(req.params.callId, userId);
      return res.json({
        success: true,
        data: { callId: String(doc._id), status: doc.status },
      });
    } catch (error) {
      const code = error.statusCode || 400;
      return res.status(code).json({ success: false, message: error.message || 'Error' });
    }
  }
}

module.exports = new CallController();
