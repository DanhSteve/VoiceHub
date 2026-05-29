const express = require('express');
const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('../../../../shared/middleware/gatewayTrust');
const AiTaskExtraction = require('../models/AiTaskExtraction');
const SyncSuggestion = require('../models/SyncSuggestion');
const { publishJson } = require('../messaging/rabbit');

const router = express.Router();

function fail(res, status, message, errorCode) {
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    messageUser: message,
  });
}

/**
 * MVP async extract:
 * - tạo extraction status=queued
 * - publish job vào queue task-ai.extract
 */
router.post('/extract', async (req, res) => {
  const { messageId, organizationId, titleHint, mentions, channelId } = req.body || {};

  // Phase 2: auth sẽ đi qua API Gateway; tạm lấy userId từ header để test nội bộ
  const generatedBy = req.user?.id || req.headers['x-user-id'] || req.headers['x-generated-by'];

  if (!generatedBy) return res.status(401).json({ success: false, message: 'Missing user context' });
  if (!messageId || !organizationId) {
    return res.status(400).json({ success: false, message: 'messageId and organizationId are required' });
  }

  const safeMentions = Array.isArray(mentions)
    ? mentions
        .filter((m) => m && (m.userId || m.id) && /^[a-f0-9]{24}$/i.test(String(m.userId || m.id)))
        .map((m) => ({
          userId: String(m.userId || m.id),
          username: String(m.username || '').slice(0, 64),
          displayName: String(m.displayName || m.name || '').slice(0, 120),
        }))
    : [];

  const extraction = await AiTaskExtraction.create({
    generatedBy,
    organizationId,
    status: 'queued',
    sourceRef: { messageId: String(messageId), messageType: 'chat_message' },
    draft: { title: titleHint || '' },
    contextHints: {
      mentions: safeMentions,
      channelId: channelId ? String(channelId) : '',
    },
  });

  const queue = process.env.RABBITMQ_TASK_AI_EXTRACT_QUEUE || 'task-ai.extract';
  await publishJson(queue, {
    extractionId: String(extraction._id),
    messageId: String(messageId),
    organizationId: String(organizationId),
    generatedBy: String(generatedBy),
    mentions: safeMentions,
    channelId: channelId ? String(channelId) : '',
  });

  return res.status(202).json({ success: true, data: { extractionId: String(extraction._id), status: 'queued' } });
});

router.get('/extractions/:id', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');
  const extraction = await AiTaskExtraction.findById(req.params.id).lean();
  if (!extraction) return fail(res, 404, 'Không tìm thấy dữ liệu trích xuất', 'AI_EXTRACTION_NOT_FOUND');
  if (String(extraction.generatedBy) !== String(userId)) {
    return fail(res, 403, 'Bạn không có quyền truy cập dữ liệu này', 'AI_EXTRACTION_FORBIDDEN');
  }
  return res.json({ success: true, data: extraction });
});

/**
 * Confirm draft -> tạo Task thật ở task-service.
 * Lưu ý: Task.sourceRef sẽ bổ sung ở Phase 3 (schema Task mở rộng).
 */
function resolveTrustedAssigneeId(extraction, bodyAssigneeId) {
  const candidates = new Set();
  const draftId = extraction?.draft?.assigneeId;
  if (draftId && /^[a-f0-9]{24}$/i.test(String(draftId))) candidates.add(String(draftId));
  for (const m of extraction?.contextHints?.mentions || []) {
    const id = m?.userId || m?.id;
    if (id && /^[a-f0-9]{24}$/i.test(String(id))) candidates.add(String(id));
  }
  if (!candidates.size) return undefined;
  if (bodyAssigneeId && candidates.has(String(bodyAssigneeId))) return String(bodyAssigneeId);
  return [...candidates][0];
}

router.post('/confirm', async (req, res) => {
  const { extractionId, assigneeId: bodyAssigneeId, boardId, listId } = req.body || {};
  const userId = req.user?.id || req.headers['x-user-id'];
  const idemKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim();

  if (!userId) return res.status(401).json({ success: false, message: 'Missing user context' });
  if (!extractionId) return res.status(400).json({ success: false, message: 'extractionId is required' });

  const extraction = await AiTaskExtraction.findById(extractionId);
  if (!extraction) return res.status(404).json({ success: false, message: 'Extraction not found' });
  if (String(extraction.generatedBy) !== String(userId)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  if (!['ready', 'confirmed'].includes(extraction.status)) {
    return fail(res, 409, 'Nội dung AI chưa sẵn sàng để xác nhận', 'AI_EXTRACTION_NOT_READY');
  }

  if (extraction.status === 'confirmed' && extraction.taskId) {
    if (
      idemKey &&
      extraction.confirmIdempotencyKey &&
      idemKey !== extraction.confirmIdempotencyKey
    ) {
      return fail(res, 409, 'Yêu cầu bị trùng hoặc không hợp lệ', 'AI_CONFIRM_IDEMPOTENCY_CONFLICT');
    }
    return res.json({ success: true, data: { taskId: String(extraction.taskId), extractionId: String(extraction._id) } });
  }

  const taskServiceUrl = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
  const draft = extraction.draft || {};
  if (!draft.dueDate) {
    return fail(res, 422, 'Tin nhắn chưa có deadline rõ ngày/giờ nên chưa thể tạo task tự động', 'AI_DUE_DATE_REQUIRED');
  }
  const assigneeId = resolveTrustedAssigneeId(extraction, bodyAssigneeId);
  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];

  let createRes;
  if (boardId && listId) {
    createRes = await axios.post(
      `${taskServiceUrl}/api/tasks/boards/${encodeURIComponent(String(boardId))}/cards`,
      {
        listId: String(listId),
        title: draft.title || 'Task từ AI',
        summary: draft.summary || '',
        description: draft.description || '',
        priority: draft.priority || 'medium',
        dueDate: draft.dueDate || null,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        attachments,
        assigneeId: assigneeId || undefined,
        aiGenerated: true,
        sourceMessageId: extraction.sourceRef?.messageId || undefined,
      },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  } else {
    createRes = await axios.post(
      `${taskServiceUrl}/api/tasks`,
      {
        title: draft.title || 'Task từ AI',
        summary: draft.summary || '',
        description: draft.description || '',
        organizationId: String(extraction.organizationId),
        priority: draft.priority || 'medium',
        dueDate: draft.dueDate || null,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        attachments,
        assigneeId: assigneeId || undefined,
        departmentId: draft.departmentId || undefined,
        teamId: draft.teamId || undefined,
        departmentName: draft.departmentName || undefined,
        aiGenerated: true,
        sourceMessageId: extraction.sourceRef?.messageId || undefined,
      },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  }

  if (createRes.status !== 201 || !createRes.data?.success || !createRes.data?.data?._id) {
    const taskMsg =
      typeof createRes.data?.message === 'string' && createRes.data.message.trim()
        ? createRes.data.message.trim()
        : 'Create task failed';
    return fail(res, 400, taskMsg, 'AI_CONFIRM_CREATE_TASK_FAILED');
  }

  extraction.status = 'confirmed';
  extraction.taskId = createRes.data.data._id;
  if (idemKey) {
    extraction.confirmIdempotencyKey = idemKey;
  }
  await extraction.save();

  return res.json({ success: true, data: { taskId: String(extraction.taskId), extractionId: String(extraction._id) } });
});

router.get('/:taskId/sync-suggestions', async (req, res) => {
  const { taskId } = req.params;
  const items = await SyncSuggestion.find({ taskId, status: 'pending' }).sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: items });
});

router.post('/:taskId/sync-suggestions/:id/approve', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: 'Missing user context' });

  const suggestion = await SyncSuggestion.findById(req.params.id);
  if (!suggestion || String(suggestion.taskId) !== String(req.params.taskId)) {
    return res.status(404).json({ success: false, message: 'Suggestion not found' });
  }
  if (suggestion.status !== 'pending') {
    return res.status(409).json({ success: false, message: `Suggestion already ${suggestion.status}` });
  }

  const taskServiceUrl = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
  const taskRes = await axios.get(`${taskServiceUrl}/api/tasks/${suggestion.taskId}`, {
    headers: buildTrustedGatewayHeaders(userId),
    timeout: 15000,
    validateStatus: () => true,
  });
  const task = taskRes.data?.data;
  if (taskRes.status !== 200 || !taskRes.data?.success || !task) {
    return fail(res, 400, 'Không tìm thấy task cần đồng bộ', 'AI_SYNC_TASK_NOT_FOUND');
  }

  const lockedStatuses = new Set(['in_progress', 'review', 'done']);
  if (lockedStatuses.has(String(task.status))) {
    return res.status(409).json({ success: false, message: 'Task is locked for sync (status >= in_progress)' });
  }

  if (suggestion.changeType === 'deleted' || suggestion.changeType === 'recalled') {
    // approve -> detach source (không xóa task)
    await AiTaskExtraction.findByIdAndUpdate(suggestion.extractionId, { $set: { 'sync.isDetached': true } });
  } else {
    const patch = suggestion.proposedPatch || {};
    const updateRes = await axios.put(`${taskServiceUrl}/api/tasks/${suggestion.taskId}`, patch, {
      headers: buildTrustedGatewayHeaders(userId),
      timeout: 15000,
      validateStatus: () => true,
    });
    if (updateRes.status !== 200 || !updateRes.data?.success) {
      return fail(res, 400, 'Không thể cập nhật task từ đề xuất', 'AI_SYNC_UPDATE_FAILED');
    }
    await AiTaskExtraction.findByIdAndUpdate(suggestion.extractionId, { $set: { 'sync.lastSyncedAt': new Date() } });
  }

  suggestion.status = 'approved';
  suggestion.approvedBy = userId;
  await suggestion.save();
  return res.json({ success: true, data: suggestion });
});

module.exports = router;

