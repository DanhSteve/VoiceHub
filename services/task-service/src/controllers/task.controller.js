const axios = require('axios');
const taskService = require('../services/task.service');
const Task = require('../models/Task');
const mongoose = require('../db');
const { logger } = require('/shared');
const { publishTaskFromFileJob } = require('../messaging/taskFromFilePublisher');

const CHAT_SERVICE_URL = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
const CHAT_INTERNAL_TOKEN = process.env.CHAT_INTERNAL_TOKEN || '';

class TaskController {
  // Tạo task mới
  async createTask(req, res) {
    try {
      const {
        title,
        description,
        assigneeId,
        serverId,
        organizationId,
        priority,
        dueDate,
        tags,
      } = req.body;
      const createdBy = req.user?.id || req.userContext?.userId;

      if (!title || !createdBy) {
        return res.status(400).json({
          success: false,
          message: 'title and createdBy are required',
        });
      }

      const task = await taskService.createTask({
        title,
        description,
        assigneeId,
        createdBy,
        serverId,
        organizationId,
        priority,
        dueDate,
        tags,
      });

      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Create task error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy task theo ID
  async getTaskById(req, res) {
    try {
      const { taskId } = req.params;
      const task = await taskService.getTaskById(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          message: 'Task not found',
        });
      }

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Get task error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách tasks
  async getTasks(req, res) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          success: false,
          message: 'Database unavailable',
        });
      }

      const q = req.query || {};
      const first = (v) => (Array.isArray(v) ? v[0] : v);
      const {
        assigneeId: assigneeIdRaw,
        organizationId: organizationIdRaw,
        serverId: serverIdRaw,
        status,
        priority,
        page,
        limit,
        dueFrom,
        dueTo,
        q: qRaw,
      } = q;
      const assigneeId = first(assigneeIdRaw);
      const organizationId = first(organizationIdRaw);
      const serverId = first(serverIdRaw);
      const rawUserId = req.user?.id || req.userContext?.userId || req.headers['x-user-id'];
      const userId =
        rawUserId != null && String(rawUserId).trim() !== '' ? String(rawUserId).trim() : '';

      const filter = { isActive: true };

      const parseOid = (raw, label) => {
        if (raw == null || raw === '') return null;
        const s = String(raw).trim();
        if (!mongoose.isValidObjectId(s)) {
          return { error: `${label} must be a valid id` };
        }
        return { value: s };
      };

      if (assigneeId) {
        const p = parseOid(assigneeId, 'assigneeId');
        if (p.error) {
          return res.status(400).json({ success: false, message: p.error });
        }
        filter.assigneeId = p.value;
      } else if (userId) {
        const p = parseOid(userId, 'user');
        if (p.error) {
          return res.status(400).json({ success: false, message: p.error });
        }
        filter.$or = [{ assigneeId: p.value }, { createdBy: p.value }];
      }

      if (organizationId) {
        const p = parseOid(organizationId, 'organizationId');
        if (p.error) {
          return res.status(400).json({ success: false, message: p.error });
        }
        filter.organizationId = p.value;
      }
      if (serverId) {
        const p = parseOid(serverId, 'serverId');
        if (p.error) {
          return res.status(400).json({ success: false, message: p.error });
        }
        filter.serverId = p.value;
      }
      if (status) filter.status = status;
      if (priority) filter.priority = priority;

      const searchQ = first(qRaw);
      if (searchQ != null && String(searchQ).trim() !== '') {
        const esc = String(searchQ)
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const textSearch = {
          $or: [
            { title: { $regex: esc, $options: 'i' } },
            { description: { $regex: esc, $options: 'i' } },
          ],
        };
        const existing = { ...filter };
        Object.keys(filter).forEach((k) => delete filter[k]);
        filter.$and = [existing, textSearch];
      }

      let sort = { createdAt: -1 };
      if (dueFrom || dueTo) {
        if (!dueFrom || !dueTo) {
          return res.status(400).json({
            success: false,
            message: 'dueFrom and dueTo are both required when filtering by due date',
          });
        }
        const from = new Date(dueFrom);
        const to = new Date(dueTo);
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Invalid dueFrom or dueTo',
          });
        }
        if (from > to) {
          return res.status(400).json({
            success: false,
            message: 'dueFrom must be before or equal to dueTo',
          });
        }
        const maxMs = 180 * 24 * 60 * 60 * 1000;
        if (to.getTime() - from.getTime() > maxMs) {
          return res.status(400).json({
            success: false,
            message: 'dueDate range cannot exceed 180 days',
          });
        }
        filter.dueDate = { $gte: from, $lte: to };
        sort = { dueDate: 1 };
      }

      const result = await taskService.getTasks(filter, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        sort,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get tasks error:', error);
      if (error.name === 'CastError' || error.name === 'BSONError') {
        return res.status(400).json({
          success: false,
          message: error.message || 'Invalid query parameter',
        });
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Thống kê task theo organizationId (phải khai báo route GET /statistics trước GET /:taskId).
   */
  async getStatistics(req, res) {
    try {
      const { organizationId } = req.query;
      const oid =
        organizationId != null && organizationId !== ''
          ? String(organizationId).trim()
          : '';
      if (!oid || !mongoose.isValidObjectId(oid)) {
        return res.status(400).json({
          success: false,
          message: 'organizationId query parameter is required and must be a valid ObjectId',
        });
      }

      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          success: false,
          message: 'Database unavailable',
        });
      }

      const orgOid = new mongoose.Types.ObjectId(oid);
      const stats = await Task.aggregate([
        { $match: { organizationId: orgOid, isActive: true } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const formatted = {
        total: 0,
        todo: 0,
        in_progress: 0,
        review: 0,
        done: 0,
        cancelled: 0,
      };

      stats.forEach((s) => {
        if (s._id && Object.prototype.hasOwnProperty.call(formatted, s._id)) {
          formatted[s._id] = s.count;
          formatted.total += s.count;
        }
      });

      res.json({
        success: true,
        status: 'success',
        data: formatted,
      });
    } catch (error) {
      logger.error('Get task statistics error:', error);
      if (error.name === 'CastError' || error.name === 'BSONError') {
        return res.status(400).json({
          success: false,
          message: error.message || 'Invalid organizationId',
        });
      }
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật task
  async updateTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const task = await taskService.updateTask(taskId, req.body, userId);

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Update task error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa task
  async deleteTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const task = await taskService.deleteTask(taskId, userId);

      res.json({
        success: true,
        message: 'Task deleted successfully',
        data: task,
      });
    } catch (error) {
      logger.error('Delete task error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Hàng đợi: tạo task từ file trong tin nhắn (worker copy Storage temp → tasks/).
   */
  async createTaskFromChatFile(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { messageId, title, organizationId } = req.body || {};

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!messageId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: 'messageId and organizationId are required',
        });
      }
      if (!CHAT_INTERNAL_TOKEN) {
        return res.status(503).json({
          success: false,
          message: 'CHAT_INTERNAL_TOKEN is not configured',
        });
      }

      const msgRes = await axios.get(
        `${CHAT_SERVICE_URL}/api/messages/internal/messages/${messageId}`,
        {
          headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
          timeout: 15000,
          validateStatus: () => true,
        }
      );

      if (msgRes.status !== 200 || !msgRes.data?.data) {
        return res.status(400).json({
          success: false,
          message: 'Message not found',
        });
      }

      const msg = msgRes.data.data;
      const sender = msg.senderId?._id || msg.senderId;
      if (String(sender) !== String(userId)) {
        return res.status(403).json({
          success: false,
          message: 'Not your message',
        });
      }
      if (!msg.fileMeta?.storagePath) {
        return res.status(400).json({
          success: false,
          message: 'Message has no file attachment',
        });
      }

      await publishTaskFromFileJob({
        messageId: String(messageId),
        userId: String(userId),
        organizationId: String(organizationId),
        title: title || 'Task từ file',
        storagePath: msg.fileMeta.storagePath,
        originalName: msg.fileMeta.originalName,
        mimeType: msg.fileMeta.mimeType,
      });

      return res.status(202).json({
        success: true,
        message: 'Queued for processing',
      });
    } catch (error) {
      logger.error('createTaskFromChatFile error:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thêm comment
  async addComment(req, res) {
    try {
      const { taskId } = req.params;
      const { content } = req.body;
      const userId = req.user?.id || req.userContext?.userId;

      if (!content || !userId) {
        return res.status(400).json({
          success: false,
          message: 'content and userId are required',
        });
      }

      const task = await taskService.addComment(taskId, userId, content);

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.error('Add comment error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new TaskController();

