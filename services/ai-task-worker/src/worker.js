const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const amqp = require('amqplib');
const axios = require('axios');
const { connectDB, disconnectDB } = require('/shared');
const AiTaskExtraction = require('./models/AiTaskExtraction');
const SyncSuggestion = require('./models/SyncSuggestion');
const {
  parseMentionLabelsFromText,
  fetchAiTaskContext,
  buildEnrichedPrompt,
  pickAssigneeFromContext,
  applyPlacementFromContext,
  safeParseJsonFromOllama,
} = require('./taskExtractEnrichment');

const EXTRACT_QUEUE = process.env.RABBITMQ_TASK_AI_EXTRACT_QUEUE || 'task-ai.extract';
const SYNC_QUEUE = process.env.RABBITMQ_TASK_AI_SYNC_QUEUE || 'task-ai.sync';
const DLQ_QUEUE = process.env.RABBITMQ_TASK_AI_DLQ_QUEUE || 'task-ai.dlq';
const MAX_AI_JOB_RETRIES = Math.max(0, parseInt(process.env.AI_TASK_JOB_MAX_RETRIES || '8', 10) || 8);
const WORKER_MODE = String(process.env.AI_TASK_WORKER_MODE || 'both').toLowerCase();

async function fetchChatMessage(messageId) {
  const chatUrl = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
  const token = process.env.CHAT_INTERNAL_TOKEN || '';
  if (!token) throw new Error('CHAT_INTERNAL_TOKEN is not set');

  const res = await axios.get(`${chatUrl}/api/messages/internal/messages/${messageId}`, {
    headers: { 'x-internal-token': token },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.data) throw new Error('Chat message not found');
  return res.data.data;
}

async function getSignedReadUrl(storagePath) {
  const chatUrl = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
  const token = process.env.CHAT_INTERNAL_TOKEN || '';
  if (!token) throw new Error('CHAT_INTERNAL_TOKEN is not set');

  const res = await axios.get(`${chatUrl}/api/messages/internal/storage/signed-read`, {
    headers: { 'x-internal-token': token },
    params: { storagePath },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.success || !res.data?.data?.url) {
    throw new Error('Signed read url failed');
  }
  return res.data.data.url;
}

async function runOcrByUrl(imageUrl) {
  const base = (process.env.PADDLEOCR_BASE_URL || '').replace(/\/$/, '');
  if (!base) return { text: '', raw: null };

  const res = await axios.get(`${base}/ocr/predict-by-url`, {
    params: { imageUrl },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || res.data?.resultcode !== 200) {
    throw new Error(`OCR failed HTTP ${res.status}`);
  }
  const items = res.data?.data || [];
  const texts = [];
  for (const it of items) {
    const rec = it?.rec_texts || [];
    if (Array.isArray(rec)) texts.push(...rec.map((x) => String(x || '').trim()).filter(Boolean));
  }
  return { text: texts.join('\n'), raw: res.data };
}

async function callOllama(prompt) {
  if (String(process.env.LLM_PROVIDER || 'ollama').toLowerCase() === 'mock') {
    return {
      response: JSON.stringify({
        title: 'Mock task',
        summary: 'Tóm tắt mock',
        description: prompt.slice(0, 400),
        priority: 'medium',
        dueDate: null,
        tags: ['mock'],
        assigneeUserId: null,
      }),
    };
  }
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';

  const res = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    },
    { timeout: 120000, validateStatus: () => true }
  );
  if (res.status < 200 || res.status >= 300) {
    let detail = '';
    if (res.data && typeof res.data === 'object' && typeof res.data.error === 'string') {
      detail = res.data.error;
    } else if (typeof res.data === 'string' && res.data.trim()) {
      detail = res.data.trim();
    }
    const pullHint =
      res.status === 404
        ? ` Gợi ý: chạy docker exec enterprise-ollama ollama pull ${model} (hoặc đặt OLLAMA_MODEL trùng một model đã có — xem ollama list trong container).`
        : '';
    throw new Error(
      detail ? `Ollama HTTP ${res.status}: ${detail}.${pullHint}` : `Ollama HTTP ${res.status}.${pullHint}`
    );
  }
  return res.data;
}

function computeConfidence(draft) {
  let score = 0.15;
  if (draft?.title && String(draft.title).trim().length >= 4) score += 0.25;
  if (draft?.summary && String(draft.summary).trim().length >= 8) score += 0.15;
  if (draft?.description && String(draft.description).trim().length >= 20) score += 0.15;
  if (draft?.priority) score += 0.05;
  if (draft?.dueDate) score += 0.1;
  if (draft?.assigneeId) score += 0.15;
  return Math.max(0, Math.min(1, score));
}

function validateDraft(draft) {
  const title = String(draft?.title || '').trim();
  if (!title) return { ok: false, message: 'Missing title' };
  if (title.length > 200) return { ok: false, message: 'Title too long' };
  return { ok: true };
}

async function resolveAssigneeId(assigneeName) {
  const q = String(assigneeName || '').trim();
  if (!q) return { assigneeId: null, note: '' };

  const userUrl = (process.env.USER_SERVICE_URL || 'http://user-service:3004').replace(/\/$/, '');
  const internalToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  if (!internalToken) {
    return { assigneeId: null, note: 'user_search_no_internal_token' };
  }

  const res = await axios.get(`${userUrl}/api/users/internal/search`, {
    params: { q, limit: 5 },
    headers: { 'x-internal-token': internalToken },
    timeout: 10000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.success) return { assigneeId: null, note: 'user_search_failed' };

  const users = res.data?.data?.users || [];
  if (!Array.isArray(users) || users.length === 0) return { assigneeId: null, note: 'no_match' };

  const exact = users.find(
    (u) => String(u.displayName || '').toLowerCase() === q.toLowerCase() || String(u.username || '').toLowerCase() === q.toLowerCase()
  );
  const picked = exact || users[0];
  return { assigneeId: picked.userId || picked._id || null, note: exact ? 'exact' : 'first' };
}

function buildPatchFromDraft(nextDraft) {
  const patch = {};
  if (nextDraft.title) patch.title = nextDraft.title;
  if (nextDraft.summary != null) patch.summary = nextDraft.summary;
  if (nextDraft.description != null) patch.description = nextDraft.description;
  if (nextDraft.priority) patch.priority = nextDraft.priority;
  if (nextDraft.dueDate !== undefined) patch.dueDate = nextDraft.dueDate;
  if (Array.isArray(nextDraft.tags)) patch.tags = nextDraft.tags;
  if (nextDraft.assigneeId) patch.assigneeId = nextDraft.assigneeId;
  if (nextDraft.departmentId) patch.departmentId = nextDraft.departmentId;
  if (nextDraft.teamId) patch.teamId = nextDraft.teamId;
  if (nextDraft.departmentName) patch.departmentName = nextDraft.departmentName;
  return patch;
}

async function buildDraftFromMessage({ messageText, organizationId, generatedBy, payload, extraction }) {
  const hintMentions = payload?.mentions?.length
    ? payload.mentions
    : extraction?.contextHints?.mentions || [];
  const userIds = hintMentions.map((m) => String(m.userId || m.id)).filter((id) => /^[a-f0-9]{24}$/i.test(id));
  const hintLabels = hintMentions.flatMap((m) => [m.displayName, m.mentionLabel].filter(Boolean));
  const mentionLabels = [
    ...new Set([...hintLabels, ...parseMentionLabelsFromText(messageText, hintLabels)]),
  ];
  const channelId =
    payload?.channelId || extraction?.contextHints?.channelId || '';

  const systemContext = await fetchAiTaskContext({
    organizationId,
    userIds,
    mentionLabels,
    channelId: channelId || undefined,
  });

  const nowIso = new Date().toISOString();
  const prompt = buildEnrichedPrompt({
    messageText,
    systemContext: systemContext || {
      organization: { id: String(organizationId), name: '' },
      mentionedUsers: [],
      channel: null,
    },
    nowIso,
  });

  const modelData = await callOllama(prompt);
  const parsed = safeParseJsonFromOllama(modelData);

  let draft = {
    title: parsed.title || '',
    summary: parsed.summary || '',
    description: parsed.description || parsed.detailedDescription || '',
    priority: parsed.priority || 'medium',
    dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
  };

  if (!draft.description && draft.summary) {
    draft.description = draft.summary;
  }

  const assignee = pickAssigneeFromContext(systemContext, parsed.assigneeUserId, userIds);
  draft = applyPlacementFromContext(draft, assignee, systemContext?.channel);

  if (!draft.assigneeId && userIds.length) {
    const primaryId = userIds[0];
    draft.assigneeId = primaryId;
    const hint = hintMentions.find((m) => String(m.userId || m.id) === String(primaryId));
    if (hint?.displayName) draft.assigneeName = hint.displayName;
    else {
      const fromCtx = (systemContext?.mentionedUsers || []).find(
        (u) => String(u.userId) === String(primaryId)
      );
      if (fromCtx) {
        draft.assigneeName = fromCtx.displayName || fromCtx.username || '';
        if (fromCtx.departmentId && !draft.departmentId) draft.departmentId = fromCtx.departmentId;
        if (fromCtx.teamId && !draft.teamId) draft.teamId = fromCtx.teamId;
        if (fromCtx.departmentName && !draft.departmentName) draft.departmentName = fromCtx.departmentName;
      }
    }
  }

  if (!draft.assigneeId && !userIds.length && parsed.assigneeName) {
    const fallback = await resolveAssigneeId(parsed.assigneeName);
    if (fallback.assigneeId) {
      draft.assigneeId = fallback.assigneeId;
      draft.assigneeName = parsed.assigneeName;
    }
  }

  return { draft, modelData, systemContext };
}

async function createSyncSuggestion({ extraction, messageId, changeType, proposedPatch }) {
  const exists = await SyncSuggestion.findOne({
    taskId: extraction.taskId,
    messageId: String(messageId),
    changeType,
    status: 'pending',
  }).lean();
  if (exists) return;

  await SyncSuggestion.create({
    taskId: extraction.taskId,
    extractionId: extraction._id,
    organizationId: extraction.organizationId,
    messageId: String(messageId),
    changeType,
    status: 'pending',
    proposedPatch: proposedPatch || {},
    createdBy: extraction.generatedBy,
  });
}

async function fetchTask(taskId, userId) {
  const taskUrl = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
  const res = await axios.get(`${taskUrl}/api/tasks/${taskId}`, {
    headers: userId ? { 'x-user-id': String(userId) } : undefined,
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.success || !res.data?.data) return null;
  return res.data.data;
}

async function processExtractJob(payload) {
  const { extractionId } = payload || {};
  // payload còn mentions, channelId từ queue
  if (!extractionId) throw new Error('Missing extractionId');

  const extraction = await AiTaskExtraction.findById(extractionId);
  if (!extraction) throw new Error('Extraction not found');

  try {
    extraction.status = 'processing';
    extraction.error = '';
    await extraction.save();

    const msg = await fetchChatMessage(extraction.sourceRef?.messageId);
    const messageText = String(msg?.content || '').trim();
    const attachmentHint = msg?.fileMeta?.originalName ? `\nĐính kèm: ${msg.fileMeta.originalName}` : '';

    let ocrText = '';
    if (String(msg?.messageType) === 'image' && msg?.fileMeta?.storagePath && process.env.PADDLEOCR_BASE_URL) {
      const signedUrl = await getSignedReadUrl(String(msg.fileMeta.storagePath));
      const ocr = await runOcrByUrl(signedUrl);
      ocrText = ocr.text ? `\nOCR:\n${ocr.text}` : '';
    }

    const { draft, modelData } = await buildDraftFromMessage({
      messageText: `${messageText}${attachmentHint}${ocrText}`,
      organizationId: extraction.organizationId,
      generatedBy: extraction.generatedBy,
      payload,
      extraction,
    });

    if (!draft.title && extraction.draft?.title) {
      draft.title = extraction.draft.title;
    }

    const validation = validateDraft(draft);
    if (!validation.ok) throw new Error(`Invalid draft: ${validation.message}`);

    extraction.status = 'ready';
    extraction.rawModelOutput = modelData;
    extraction.draft = draft;
    extraction.confidence = computeConfidence(draft);
    await extraction.save();
  } catch (err) {
    extraction.status = 'failed';
    extraction.error = err.message || String(err);
    await extraction.save();
    throw err;
  }
}

async function processSyncJob(payload) {
  const messageId = payload?.messageId;
  const changeType = payload?.changeType;
  if (!messageId || !changeType) throw new Error('Missing messageId/changeType');

  const extractions = await AiTaskExtraction.find({
    'sourceRef.messageId': String(messageId),
    status: 'confirmed',
    taskId: { $ne: null },
    'sync.isDetached': { $ne: true },
  });

  for (const extraction of extractions) {
    if (extraction?.sync?.isLocked) continue;

    const task = await fetchTask(extraction.taskId, extraction.generatedBy);
    if (!task) continue;
    const lockedStatuses = new Set(['in_progress', 'review', 'done']);
    if (lockedStatuses.has(String(task.status))) {
      extraction.sync = { ...(extraction.sync || {}), isLocked: true };
      await extraction.save();
      continue;
    }

    if (changeType === 'deleted' || changeType === 'recalled') {
      await createSyncSuggestion({ extraction, messageId, changeType, proposedPatch: {} });
      continue;
    }

    // edited: re-analyze -> suggestion patch
    const msg = await fetchChatMessage(String(messageId));
    const messageText = String(msg?.content || '').trim();
    const attachmentHint = msg?.fileMeta?.originalName ? `\nĐính kèm: ${msg.fileMeta.originalName}` : '';

    let ocrText = '';
    if (String(msg?.messageType) === 'image' && msg?.fileMeta?.storagePath && process.env.PADDLEOCR_BASE_URL) {
      const signedUrl = await getSignedReadUrl(String(msg.fileMeta.storagePath));
      const ocr = await runOcrByUrl(signedUrl);
      ocrText = ocr.text ? `\nOCR:\n${ocr.text}` : '';
    }

    const { draft } = await buildDraftFromMessage({
      messageText: `${messageText}${attachmentHint}${ocrText}`,
      organizationId: extraction.organizationId,
      generatedBy: extraction.generatedBy,
      payload: {
        mentions: extraction?.contextHints?.mentions,
        channelId: extraction?.contextHints?.channelId,
      },
      extraction,
    });

    const validation = validateDraft(draft);
    if (!validation.ok) continue;

    const patch = buildPatchFromDraft(draft);
    await createSyncSuggestion({ extraction, messageId, changeType, proposedPatch: patch });
  }
}

function getRetryCount(msg) {
  const h = (msg && msg.properties && msg.properties.headers) || {};
  const n = h['x-retry-count'];
  if (n === undefined || n === null) return 0;
  const parsed = parseInt(String(n), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function publishToDlq(ch, sourceQueue, msg, err) {
  const original = msg.content.toString('utf8');
  const body = {
    sourceQueue,
    error: String(err && err.message ? err.message : err),
    transient: isTransientJobError(err),
    original,
  };
  await ch.assertQueue(DLQ_QUEUE, { durable: true });
  ch.sendToQueue(DLQ_QUEUE, Buffer.from(JSON.stringify(body)), {
    persistent: true,
    contentType: 'application/json',
  });
}

function isTransientJobError(err) {
  const code = err && err.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return true;
  const status = err && err.response && err.response.status;
  if (status >= 500) return true;
  const msg = String(err && err.message ? err.message : err);
  if (/timeout|ETIMEDOUT|MongoNetworkError/i.test(msg)) return true;
  return false;
}

async function start() {
  const mongoUri = (process.env.AI_TASK_MONGODB_URI || '').trim() || process.env.MONGODB_URI;
  await connectDB(mongoUri);

  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(EXTRACT_QUEUE, { durable: true });
  await ch.assertQueue(SYNC_QUEUE, { durable: true });
  await ch.assertQueue(DLQ_QUEUE, { durable: true });
  await ch.prefetch(1);

  let extractConsumerTag = null;
  let syncConsumerTag = null;

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (extractConsumerTag) await ch.cancel(extractConsumerTag);
    } catch (e) {
      /* ignore */
    }
    try {
      if (syncConsumerTag) await ch.cancel(syncConsumerTag);
    } catch (e) {
      /* ignore */
    }
    try {
      await ch.close();
    } catch (e) {
      /* ignore */
    }
    try {
      await conn.close();
    } catch (e) {
      /* ignore */
    }
    try {
      await disconnectDB();
    } catch (e) {
      /* ignore */
    }
    process.exit(0);
  };

  const shouldConsumeExtract = WORKER_MODE === 'extract' || WORKER_MODE === 'both';
  const shouldConsumeSync = WORKER_MODE === 'sync' || WORKER_MODE === 'both';
  if (!shouldConsumeExtract && !shouldConsumeSync) {
    throw new Error(`Invalid AI_TASK_WORKER_MODE=${WORKER_MODE}. Expected extract|sync|both`);
  }

  if (shouldConsumeExtract) {
    console.log(`[ai-task-worker] listening queue=${EXTRACT_QUEUE} mode=${WORKER_MODE}`);
    const extractConsume = await ch.consume(
      EXTRACT_QUEUE,
      async (msg) => {
        if (!msg) return;
        const retryCount = getRetryCount(msg);
        try {
          const payload = JSON.parse(msg.content.toString('utf8'));
          await processExtractJob(payload);
          ch.ack(msg);
        } catch (err) {
          console.error('[ai-task-worker] extract job failed:', err.message);
          const transient = isTransientJobError(err);
          if (transient && retryCount < MAX_AI_JOB_RETRIES) {
            ch.sendToQueue(EXTRACT_QUEUE, msg.content, {
              persistent: true,
              contentType: 'application/json',
              headers: { 'x-retry-count': retryCount + 1 },
            });
            ch.ack(msg);
            return;
          }
          try {
            await publishToDlq(ch, EXTRACT_QUEUE, msg, err);
          } catch (dlqErr) {
            console.error('[ai-task-worker] extract DLQ publish failed:', dlqErr.message);
          }
          ch.ack(msg);
        }
      },
      { noAck: false }
    );
    extractConsumerTag = extractConsume.consumerTag;
  }

  if (shouldConsumeSync) {
    console.log(`[ai-task-worker] listening queue=${SYNC_QUEUE} mode=${WORKER_MODE}`);
    const syncConsume = await ch.consume(
      SYNC_QUEUE,
      async (msg) => {
        if (!msg) return;
        const retryCount = getRetryCount(msg);
        try {
          const payload = JSON.parse(msg.content.toString('utf8'));
          await processSyncJob(payload);
          ch.ack(msg);
        } catch (err) {
          console.error('[ai-task-worker] sync job failed:', err.message);
          const transient = isTransientJobError(err);
          if (transient && retryCount < MAX_AI_JOB_RETRIES) {
            ch.sendToQueue(SYNC_QUEUE, msg.content, {
              persistent: true,
              contentType: 'application/json',
              headers: { 'x-retry-count': retryCount + 1 },
            });
            ch.ack(msg);
            return;
          }
          try {
            await publishToDlq(ch, SYNC_QUEUE, msg, err);
          } catch (dlqErr) {
            console.error('[ai-task-worker] sync DLQ publish failed:', dlqErr.message);
          }
          ch.ack(msg);
        }
      },
      { noAck: false }
    );
    syncConsumerTag = syncConsume.consumerTag;
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  conn.on('error', (err) => console.error('[ai-task-worker] conn error:', err.message));
  conn.on('close', () => console.error('[ai-task-worker] conn closed'));
}

start().catch((err) => {
  console.error('[ai-task-worker] fatal:', err);
  process.exit(1);
});

