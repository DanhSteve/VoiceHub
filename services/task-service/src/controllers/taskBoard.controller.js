const mongoose = require('../db');
const { logger } = require('/shared');
const boardService = require('../services/taskBoard.service');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  const status = Number(err?.statusCode) || fallbackStatus;
  const isServerError = status >= 500;
  const safeMessage = isServerError
    ? 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.'
    : String(err?.message || fallbackMessage);
  return res.status(status).json({
    success: false,
    message: safeMessage,
    errorCode: String(err?.errorCode || fallbackCode || (isServerError ? 'TASK_BOARD_INTERNAL_ERROR' : '')).trim(),
    messageUser: safeMessage,
  });
}

class TaskBoardController {
  async createBoard(req, res) {
    try {
      const userId = asUserId(req);
      const { organizationId, teamId, scopeType, scopeId, title, background, visibility } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      const nextScopeType = String(scopeType || (teamId ? 'team' : '')).toLowerCase();
      const requiresScope = ['team', 'department', 'division'].includes(nextScopeType);
      const finalScopeId = scopeId || teamId || null;
      if (!validOid(organizationId) || (requiresScope && !validOid(finalScopeId))) {
        return res
          .status(400)
          .json({ success: false, message: 'organizationId/scopeId (hoặc teamId) không hợp lệ' });
      }
      if (!String(title || '').trim()) {
        return res.status(400).json({ success: false, message: 'title là bắt buộc' });
      }
      const board = await boardService.createBoard({
        userId,
        organizationId,
        teamId,
        scopeType: requiresScope ? nextScopeType : null,
        scopeId: finalScopeId,
        title,
        background,
        visibility,
      });
      return res.status(201).json({ success: true, data: board });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể tạo board', 'TASK_BOARD_CREATE_FAILED');
    }
  }

  async listBoards(req, res) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, message: 'Database unavailable' });
      }
      const userId = asUserId(req);
      const { organizationId, teamId, scopeType, scopeId } = req.query || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(organizationId)) {
        return res.status(400).json({ success: false, message: 'organizationId không hợp lệ' });
      }
      if (teamId && !validOid(teamId)) {
        return res.status(400).json({ success: false, message: 'teamId không hợp lệ' });
      }
      if (scopeId && !validOid(scopeId)) {
        return res.status(400).json({ success: false, message: 'scopeId không hợp lệ' });
      }
      const boards = await boardService.listBoards({ userId, organizationId, teamId, scopeType, scopeId });
      return res.json({ success: true, data: boards });
    } catch (err) {
      logger.error('[task-board] listBoards failed: %s', err?.message || err);
      const status = err?.name === 'CastError' ? 400 : 500;
      return sendError(res, err, status, 'Không thể tải danh sách board', 'TASK_BOARD_LIST_FAILED');
    }
  }

  async getBoardDetail(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(boardId)) return res.status(400).json({ success: false, message: 'boardId không hợp lệ' });
      const data = await boardService.getBoardDetail({ userId, boardId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 403, 'Không thể tải chi tiết board', 'TASK_BOARD_DETAIL_FAILED');
    }
  }

  async listAssignableMembers(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(boardId)) return res.status(400).json({ success: false, message: 'boardId không hợp lệ' });
      const data = await boardService.listBoardAssignableMembers({ userId, boardId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 403, 'Không thể tải danh sách thành viên', 'TASK_BOARD_MEMBERS_FAILED');
    }
  }

  async createList(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      const { title } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(boardId)) return res.status(400).json({ success: false, message: 'boardId không hợp lệ' });
      if (!String(title || '').trim()) {
        return res.status(400).json({ success: false, message: 'title là bắt buộc' });
      }
      const data = await boardService.createList({ userId, boardId, title });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể tạo danh sách', 'TASK_BOARD_LIST_CREATE_FAILED');
    }
  }

  async createCard(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId } = req.params;
      const { listId, title } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(boardId) || !validOid(listId)) {
        return res.status(400).json({ success: false, message: 'boardId/listId không hợp lệ' });
      }
      if (!String(title || '').trim()) {
        return res.status(400).json({ success: false, message: 'title là bắt buộc' });
      }
      const data = await boardService.createCard({ userId, boardId, ...req.body });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể tạo card', 'TASK_BOARD_CARD_CREATE_FAILED');
    }
  }

  async moveCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { toListId, position, index } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(cardId) || !validOid(toListId)) {
        return res.status(400).json({ success: false, message: 'cardId/toListId không hợp lệ' });
      }
      const data = await boardService.moveCard({ userId, cardId, toListId, position, index });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể di chuyển card', 'TASK_BOARD_CARD_MOVE_FAILED');
    }
  }

  async copyCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { toListId } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      if (toListId && !validOid(toListId)) {
        return res.status(400).json({ success: false, message: 'toListId không hợp lệ' });
      }
      const data = await boardService.copyCard({ userId, cardId, toListId });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể sao chép card', 'TASK_BOARD_CARD_COPY_FAILED');
    }
  }

  async archiveCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      const data = await boardService.archiveCard({ userId, cardId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể lưu trữ card', 'TASK_BOARD_CARD_ARCHIVE_FAILED');
    }
  }

  async reorderList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId, boardId: boardIdParam } = req.params;
      const { boardId: boardIdBody, position } = req.body || {};
      const boardId = boardIdParam || boardIdBody;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(listId) || !validOid(boardId)) {
        return res.status(400).json({ success: false, message: 'listId/boardId không hợp lệ' });
      }
      const lists = await boardService.reorderList({ userId, boardId, listId, position });
      return res.json({ success: true, data: lists });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể sắp xếp danh sách', 'TASK_BOARD_LIST_REORDER_FAILED');
    }
  }

  async copyList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      const { title, toBoardId } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(listId)) return res.status(400).json({ success: false, message: 'listId không hợp lệ' });
      if (toBoardId && !validOid(toBoardId)) {
        return res.status(400).json({ success: false, message: 'toBoardId không hợp lệ' });
      }
      const data = await boardService.copyList({ userId, listId, title, toBoardId });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể sao chép danh sách', 'TASK_BOARD_LIST_COPY_FAILED');
    }
  }

  async moveList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      const { toBoardId, position } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(listId) || !validOid(toBoardId)) {
        return res.status(400).json({ success: false, message: 'listId/toBoardId không hợp lệ' });
      }
      const data = await boardService.moveList({ userId, listId, toBoardId, position });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể di chuyển danh sách', 'TASK_BOARD_LIST_MOVE_FAILED');
    }
  }

  async moveAllCardsInList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      const { toListId } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(listId) || !validOid(toListId)) {
        return res.status(400).json({ success: false, message: 'listId/toListId không hợp lệ' });
      }
      const data = await boardService.moveAllCardsInList({ userId, listId, toListId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể di chuyển toàn bộ card', 'TASK_BOARD_LIST_MOVE_ALL_FAILED');
    }
  }

  async watchList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(listId)) return res.status(400).json({ success: false, message: 'listId không hợp lệ' });
      const data = await boardService.setListWatch({ userId, listId, watching: true });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể theo dõi danh sách', 'TASK_BOARD_LIST_WATCH_FAILED');
    }
  }

  async unwatchList(req, res) {
    try {
      const userId = asUserId(req);
      const { listId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(listId)) return res.status(400).json({ success: false, message: 'listId không hợp lệ' });
      const data = await boardService.setListWatch({ userId, listId, watching: false });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể hủy theo dõi danh sách', 'TASK_BOARD_LIST_UNWATCH_FAILED');
    }
  }

  async archiveList(req, res) {
    try {
      const userId = asUserId(req);
      const { boardId, listId } = req.params;
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(boardId) || !validOid(listId)) {
        return res.status(400).json({ success: false, message: 'boardId/listId không hợp lệ' });
      }
      const data = await boardService.archiveList({ userId, boardId, listId });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể lưu trữ danh sách', 'TASK_BOARD_LIST_ARCHIVE_FAILED');
    }
  }

  async updateCard(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { title, description, summary, priority, dueDate, tags, assigneeId, attachments, status } =
        req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      const data = await boardService.updateCard({
        userId,
        cardId,
        title,
        description,
        summary,
        priority,
        dueDate,
        tags,
        assigneeId,
        attachments,
        status,
      });
      return res.json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể cập nhật card', 'TASK_BOARD_CARD_UPDATE_FAILED');
    }
  }

  async addCardComment(req, res) {
    try {
      const userId = asUserId(req);
      const { cardId } = req.params;
      const { content } = req.body || {};
      if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
      if (!validOid(cardId)) return res.status(400).json({ success: false, message: 'cardId không hợp lệ' });
      const data = await boardService.addCardComment({ userId, cardId, content });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return sendError(res, err, 400, 'Không thể thêm bình luận card', 'TASK_BOARD_CARD_COMMENT_FAILED');
    }
  }
}

module.exports = new TaskBoardController();
