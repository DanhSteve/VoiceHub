const Meeting = require('../models/Meeting');
const { getRedisClient, logger, fetchUserProfileByIdInternal } = require('/shared');
const axios = require('axios');
const ORGANIZATION_SERVICE_URL = process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013';

class MeetingService {
  // Tạo meeting mới
  async createMeeting(meetingData) {
    try {
      const { title, description, hostId, serverId, organizationId, startTime } = meetingData;

      // Kiểm tra hostId có tồn tại không
      try {
        await fetchUserProfileByIdInternal(hostId);
      } catch (error) {
        throw new Error('Host user not found');
      }

      // Kiểm tra serverId nếu có
      if (serverId) {
        try {
          await axios.get(`${ORGANIZATION_SERVICE_URL}/api/servers/${serverId}`);
        } catch (error) {
          throw new Error('Server not found');
        }
      }

      const meeting = new Meeting({
        title,
        description,
        hostId,
        serverId,
        organizationId,
        startTime: startTime || new Date(),
        status: 'scheduled',
        participants: [
          {
            userId: hostId,
            joinedAt: new Date(),
          },
        ],
      });

      await meeting.save();

      logger.info(`Meeting created: ${meeting._id}`);
      return meeting;
    } catch (error) {
      logger.error('Error creating meeting:', error);
      throw new Error(`Error creating meeting: ${error.message}`);
    }
  }

  // Bắt đầu meeting
  async startMeeting(meetingId) {
    try {
      const meeting = await Meeting.findByIdAndUpdate(
        meetingId,
        {
          $set: {
            status: 'active',
            startTime: new Date(),
          },
        },
        { new: true }
      );

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      logger.info(`Meeting started: ${meetingId}`);
      return meeting;
    } catch (error) {
      logger.error('Error starting meeting:', error);
      throw new Error(`Error starting meeting: ${error.message}`);
    }
  }

  // Kết thúc meeting
  async endMeeting(meetingId) {
    try {
      const meeting = await Meeting.findByIdAndUpdate(
        meetingId,
        {
          $set: {
            status: 'ended',
            endTime: new Date(),
          },
        },
        { new: true }
      );

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      logger.info(`Meeting ended: ${meetingId}`);
      return meeting;
    } catch (error) {
      logger.error('Error ending meeting:', error);
      throw new Error(`Error ending meeting: ${error.message}`);
    }
  }

  // Thêm participant vào meeting
  async addParticipant(meetingId, userId) {
    try {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      if (meeting.status !== 'active') {
        throw new Error('Meeting is not active');
      }

      // Kiểm tra đã tham gia chưa
      const existing = meeting.participants.find(
        (p) => p.userId.toString() === userId.toString() && !p.leftAt
      );

      if (existing) {
        return meeting;
      }

      meeting.participants.push({
        userId,
        joinedAt: new Date(),
      });

      await meeting.save();

      logger.info(`Participant added to meeting: ${meetingId}, user: ${userId}`);
      return meeting;
    } catch (error) {
      logger.error('Error adding participant:', error);
      throw new Error(`Error adding participant: ${error.message}`);
    }
  }

  // Xóa participant khỏi meeting
  async removeParticipant(meetingId, userId) {
    try {
      const meeting = await Meeting.findById(meetingId);

      if (!meeting) {
        throw new Error('Meeting not found');
      }

      const participant = meeting.participants.find(
        (p) => p.userId.toString() === userId.toString() && !p.leftAt
      );

      if (participant) {
        participant.leftAt = new Date();
        await meeting.save();
      }

      logger.info(`Participant removed from meeting: ${meetingId}, user: ${userId}`);
      return meeting;
    } catch (error) {
      logger.error('Error removing participant:', error);
      throw new Error(`Error removing participant: ${error.message}`);
    }
  }

  // Lấy meeting theo ID
  async getMeetingById(meetingId) {
    try {
      const meeting = await Meeting.findById(meetingId)
        .populate('hostId', 'username displayName avatar')
        .populate('participants.userId', 'username displayName avatar');

      return meeting;
    } catch (error) {
      logger.error('Error getting meeting:', error);
      throw new Error(`Error getting meeting: ${error.message}`);
    }
  }

  async bootstrapMeetingRoom(meetingId, userId) {
    const meeting = await Meeting.findById(meetingId).populate('hostId', 'username displayName avatar');
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const isHost = String(meeting.hostId?._id || meeting.hostId) === String(userId);
    const participant = meeting.participants.find(
      (item) => String(item.userId) === String(userId) && !item.leftAt
    );

    if (!isHost && !participant) {
      // Auto append participant for MVP join flow.
      meeting.participants.push({
        userId,
        joinedAt: new Date(),
      });
    }

    if (meeting.status === 'scheduled') {
      meeting.status = 'active';
      meeting.startTime = meeting.startTime || new Date();
    }

    await meeting.save();

    return {
      meetingId: meeting._id,
      roomId: String(meeting._id),
      title: meeting.title,
      status: meeting.status,
      organizationId: meeting.organizationId || null,
      role: isHost ? 'host' : 'participant',
      participants: meeting.participants
        .filter((item) => !item.leftAt)
        .map((item) => ({
          userId: item.userId,
          joinedAt: item.joinedAt,
          isMuted: item.isMuted,
          isVideoOn: item.isVideoOn,
        })),
    };
  }

  // Lấy danh sách meetings
  async getMeetings(filter, options = {}) {
    try {
      const { page = 1, limit = 50, sort: sortOption } = options;
      const sort = sortOption || { startTime: -1 };

      // Không populate hostId: voice-service không đăng ký model User — populate gây MissingSchemaError/500.
      const meetings = await Meeting.find(filter)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sort);

      const total = await Meeting.countDocuments(filter);

      return {
        meetings,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error getting meetings:', error);
      throw new Error(`Error getting meetings: ${error.message}`);
    }
  }
}

module.exports = new MeetingService();

