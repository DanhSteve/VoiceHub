const mongoose = require('../db');
const meetingService = require('../services/meeting.service');
const Meeting = require('../models/Meeting');
const { logger } = require('/shared');

class MeetingController {
  // Tạo meeting mới
  async createMeeting(req, res) {
    try {
      const { title, description, serverId, organizationId, startTime } = req.body;
      const hostId = req.user?.id || req.userContext?.userId;

      if (!title || !hostId) {
        return res.status(400).json({
          success: false,
          message: 'title and hostId are required',
        });
      }

      const meeting = await meetingService.createMeeting({
        title,
        description,
        hostId,
        serverId,
        organizationId,
        startTime,
      });

      res.status(201).json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Create meeting error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Bắt đầu meeting
  async startMeeting(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.startMeeting(meetingId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Start meeting error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Kết thúc meeting
  async endMeeting(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.endMeeting(meetingId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('End meeting error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thêm participant
  async addParticipant(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const meeting = await meetingService.addParticipant(meetingId, userId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Add participant error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa participant
  async removeParticipant(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const meeting = await meetingService.removeParticipant(meetingId, userId);

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Remove participant error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy meeting theo ID
  async getMeetingById(req, res) {
    try {
      const { meetingId } = req.params;
      const meeting = await meetingService.getMeetingById(meetingId);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found',
        });
      }

      res.json({
        success: true,
        data: meeting,
      });
    } catch (error) {
      logger.error('Get meeting error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách meetings
  async getMeetings(req, res) {
    try {
      const { serverId, organizationId, status, page, limit, startFrom, startTo } = req.query;
      const pageNum = Number.parseInt(page, 10) || 1;

      // Dashboard gọi /api/meetings khi load trang. Nếu Mongo chưa ready (Atlas reconnect),
      // trả danh sách rỗng thay vì để Gateway nhận ECONNREFUSED/500.
      if (mongoose.connection.readyState !== 1) {
        logger.warn('getMeetings requested while MongoDB is not ready, returning empty meetings list');
        return res.json({
          success: true,
          data: {
            meetings: [],
            totalPages: 0,
            currentPage: pageNum,
            total: 0,
            degraded: true,
          },
        });
      }

      const filter = {};
      // Tránh CastError → 500 khi client gửi id không phải ObjectId hợp lệ
      if (serverId) {
        const sid = String(serverId).trim();
        if (!mongoose.isValidObjectId(sid)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid serverId',
          });
        }
        filter.serverId = new mongoose.Types.ObjectId(sid);
      }
      if (organizationId) {
        const org = String(organizationId).trim();
        if (!mongoose.isValidObjectId(org)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid organizationId',
          });
        }
        filter.organizationId = new mongoose.Types.ObjectId(org);
      }

      let sort = { startTime: -1 };

      if (startFrom || startTo) {
        if (!startFrom || !startTo) {
          return res.status(400).json({
            success: false,
            message: 'startFrom and startTo are both required when filtering by time range',
          });
        }
        const from = new Date(startFrom);
        const to = new Date(startTo);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid startFrom or startTo',
          });
        }
        if (from > to) {
          return res.status(400).json({
            success: false,
            message: 'startFrom must be before or equal to startTo',
          });
        }
        const maxMs = 180 * 24 * 60 * 60 * 1000;
        if (to.getTime() - from.getTime() > maxMs) {
          return res.status(400).json({
            success: false,
            message: 'startTime range cannot exceed 180 days',
          });
        }

        const userId = req.user?.id || req.user?.userId || req.user?._id;
        if (!userId) {
          return res.status(401).json({
            success: false,
            message: 'Unauthorized',
          });
        }

        const uidStr = String(userId).trim();
        if (!mongoose.isValidObjectId(uidStr)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid user id',
          });
        }
        const userOid = new mongoose.Types.ObjectId(uidStr);

        filter.$or = [{ hostId: userOid }, { 'participants.userId': userOid }];
        filter.startTime = { $gte: from, $lte: to };
        if (status) {
          filter.status = status;
        } else {
          filter.status = { $ne: 'cancelled' };
        }
        sort = { startTime: 1 };
      } else if (status) {
        filter.status = status;
      }

      const result = await meetingService.getMeetings(filter, {
        page: pageNum,
        limit: parseInt(limit) || 50,
        sort,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get meetings error:', error);
      if (error.name === 'CastError' || error.name === 'BSONError') {
        return res.status(400).json({
          success: false,
          message: error.message || 'Invalid query',
        });
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async bootstrapMeetingRoom(req, res) {
    try {
      const { meetingId } = req.params;
      const userId = req.user?.id || req.user?.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const payload = await meetingService.bootstrapMeetingRoom(meetingId, userId);
      res.json({
        success: true,
        data: payload,
      });
    } catch (error) {
      logger.error('Bootstrap meeting room error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async bootstrapRoom(req, res) {
    try {
      const userId = req.user?.id || req.user?.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { roomId } = req.params;
      if (!roomId) {
        return res.status(400).json({
          success: false,
          message: 'roomId is required',
        });
      }

      res.json({
        success: true,
        data: {
          roomId,
          role: 'participant',
          status: 'active',
        },
      });
    } catch (error) {
      logger.error('Bootstrap room error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /** Gọi nội bộ — xóa mọi meeting liên quan tổ chức */
  async purgeOrganizationMeetings(req, res) {
    try {
      const { organizationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(String(organizationId))) {
        return res.status(400).json({ success: false, message: 'Invalid organizationId' });
      }
      const oid = new mongoose.Types.ObjectId(String(organizationId));
      const result = await Meeting.deleteMany({ organizationId: oid });
      return res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      logger.error('purgeOrganizationMeetings error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new MeetingController();

