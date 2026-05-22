const friendService = require('../services/friend.service');
const { logger } = require('/shared');

/** Chuẩn hóa lỗi từ service: 503 khi MongoDB/service unavailable, 404 khi User not found */
function errorToStatus(error, defaultMessage = 'An error occurred', defaultStatus = 400) {
  const msg = error?.message || defaultMessage;
  if (msg.includes('User not found')) return { status: 404, message: 'Không tìm thấy người dùng' };
  if (msg.includes('Friend request already sent')) {
    return { status: 409, message: 'Bạn đã gửi lời mời kết bạn cho người này rồi' };
  }
  if (msg.includes('Friend request already received')) {
    return { status: 409, message: 'Người này đã gửi lời mời cho bạn — hãy chấp nhận trong danh sách lời mời' };
  }
  if (msg.includes('Already friends')) return { status: 409, message: 'Hai bạn đã là bạn bè' };
  if (msg.includes('Cannot send friend request to blocked user')) {
    return { status: 403, message: 'Không thể gửi lời mời tới người đã bị chặn' };
  }
  if (msg.includes('Cannot add yourself')) {
    return { status: 400, message: 'Không thể kết bạn với chính mình' };
  }
  if (msg.includes('temporarily unavailable') || msg.includes('Service temporarily unavailable')) {
    return { status: 503, message: 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.' };
  }
  return { status: defaultStatus, message: msg };
}

function isExpectedFriendError(error) {
  const msg = String(error?.message || '');
  return (
    msg.includes('Friend request already') ||
    msg.includes('Already friends') ||
    msg.includes('Cannot send friend request') ||
    msg.includes('Cannot add yourself')
  );
}

class FriendController {
  // Gửi lời mời kết bạn
  async sendFriendRequest(req, res) {
    try {
      const friendId = req.body?.friendId ?? req.body?.userId;
      const currentUserId = req.user?.id ?? req.user?._id ?? req.userContext?.userId;
      const userId = currentUserId?.toString?.() ?? currentUserId;

      if (!friendId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'friendId and userId are required',
        });
      }

      const friend = await friendService.sendFriendRequest(userId, friendId);

      res.status(201).json({
        success: true,
        data: friend,
      });
    } catch (error) {
      if (isExpectedFriendError(error)) {
        logger.warn('Send friend request:', error.message);
      } else {
        logger.error('Send friend request error:', error);
      }
      const { status, message } = errorToStatus(error, 'Lỗi khi gửi lời mời');
      res.status(status).json({ success: false, message });
    }
  }

  // Chấp nhận lời mời kết bạn
  async acceptFriendRequest(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const friend = await friendService.acceptFriendRequest(userId, friendId);

      res.json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logger.error('Accept friend request error:', error);
      const { status, message } = errorToStatus(error, error.message);
      res.status(status).json({ success: false, message });
    }
  }

  // Từ chối lời mời kết bạn
  async rejectFriendRequest(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const friend = await friendService.rejectFriendRequest(userId, friendId);

      res.json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logger.error('Reject friend request error:', error);
      const { status, message } = errorToStatus(error, error.message);
      res.status(status).json({ success: false, message });
    }
  }

  // Lấy danh sách bạn bè
  async getFriends(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId || req.params.userId;
      const { status, page, limit } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      const result = await friendService.getFriends(userId, {
        status: status || 'accepted',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get friends error:', error);
      const { status, message } = errorToStatus(error, error.message, 500);
      res.status(status).json({ success: false, message });
    }
  }

  // Lấy danh sách lời mời kết bạn
  async getFriendRequests(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { type = 'received' } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const requests = await friendService.getFriendRequests(userId, type);

      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      logger.error('Get friend requests error:', error);
      const { status, message } = errorToStatus(error, error.message, 500);
      res.status(status).json({ success: false, message });
    }
  }

  // Xóa bạn bè
  async removeFriend(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      await friendService.removeFriend(userId, friendId);

      res.json({
        success: true,
        message: 'Friend removed successfully',
      });
    } catch (error) {
      logger.error('Remove friend error:', error);
      const { status, message } = errorToStatus(error, error.message);
      res.status(status).json({ success: false, message });
    }
  }

  // Chặn user
  async blockUser(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const block = await friendService.blockUser(userId, friendId);

      res.json({
        success: true,
        data: block,
      });
    } catch (error) {
      logger.error('Block user error:', error);
      const { status, message } = errorToStatus(error, error.message);
      res.status(status).json({ success: false, message });
    }
  }

  // Bỏ chặn user
  async unblockUser(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const block = await friendService.unblockUser(userId, friendId);

      res.json({
        success: true,
        data: block,
      });
    } catch (error) {
      logger.error('Unblock user error:', error);
      const { status, message } = errorToStatus(error, error.message);
      res.status(status).json({ success: false, message });
    }
  }

  // Kiểm tra relationship
  async getRelationship(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const relationship = await friendService.getRelationship(userId, friendId);

      res.json({
        success: true,
        data: relationship,
      });
    } catch (error) {
      logger.error('Get relationship error:', error);
      const { status, message } = errorToStatus(error, error.message, 500);
      res.status(status).json({
        success: false,
        message,
      });
    }
  }
}

module.exports = new FriendController();

