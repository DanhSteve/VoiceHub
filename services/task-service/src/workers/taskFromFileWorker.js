const amqp = require('amqplib');
const axios = require('axios');
const Task = require('../models/Task');
const taskService = require('../services/task.service');
const { firebaseStorage, emitRealtimeEvent, logger } = require('/shared');

const QUEUE = process.env.RABBITMQ_TASK_FROM_FILE_QUEUE || 'voicehub.task.from_file';

const CHAT_SERVICE_URL = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
const CHAT_INTERNAL_TOKEN = process.env.CHAT_INTERNAL_TOKEN || '';

async function promoteChatMessage(messageId, taskId) {
  if (!CHAT_INTERNAL_TOKEN) {
    throw new Error('CHAT_INTERNAL_TOKEN is not set');
  }
  const url = `${CHAT_SERVICE_URL}/api/messages/internal/messages/${messageId}/file-promoted`;
  const res = await axios.patch(
    url,
    { taskId: String(taskId) },
    {
      headers: {
        'x-internal-token': CHAT_INTERNAL_TOKEN,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`promote message failed: HTTP ${res.status}`);
  }
}

async function processJob(payload) {
  const {
    messageId,
    userId,
    organizationId,
    title,
    storagePath,
    originalName,
  } = payload;

  if (!firebaseStorage.isEnabled()) {
    throw new Error('Firebase Storage not configured');
  }

  let task = null;
  try {
    task = await taskService.createTask({
      title: title || 'Task từ file',
      description: 'Tạo từ file đính kèm trong chat',
      createdBy: userId,
      organizationId,
    });

    const safeName = firebaseStorage.sanitizeFileName(originalName || 'file');
    const destPath = `tasks/${String(organizationId)}/${String(task._id)}/${safeName}`;

    await firebaseStorage.copyObject(storagePath, destPath);

    const { url } = await firebaseStorage.getSignedReadUrl(destPath);

    await Task.findByIdAndUpdate(task._id, {
      $set: {
        attachments: [{ name: originalName || safeName, url }],
      },
    });

    await promoteChatMessage(messageId, task._id);

    try {
      await firebaseStorage.deleteObject(storagePath);
    } catch (e) {
      logger.warn(`[taskFromFileWorker] temp delete ${storagePath}: ${e.message}`);
    }

    await emitRealtimeEvent({
      event: 'task:created_from_file',
      userId: String(userId),
      payload: {
        taskId: String(task._id),
        messageId: String(messageId),
        organizationId: String(organizationId),
      },
    });
  } catch (err) {
    if (task?._id) {
      try {
        await Task.findByIdAndUpdate(task._id, { isActive: false });
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

async function startTaskFromFileWorker() {
  const url = process.env.RABBITMQ_URL;
  if (!url || process.env.TASK_FROM_FILE_WORKER === 'false') {
    console.log('[taskFromFileWorker] skipped');
    return;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });

  await ch.consume(
    QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString('utf8'));
        await processJob(payload);
        ch.ack(msg);
      } catch (err) {
        logger.error('[taskFromFileWorker]', err.message);
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) => logger.error('[taskFromFileWorker] conn', err.message));
  console.log(`[taskFromFileWorker] listening on ${QUEUE}`);
  return { conn, ch };
}

module.exports = { startTaskFromFileWorker };
