const axios = require('axios');
const logger = require('./logger');

const WEBHOOK_SERVICE_URL = process.env.WEBHOOK_SERVICE_URL || 'http://webhook-service:3016';
const WEBHOOK_SECRET = String(process.env.WEBHOOK_SECRET || '').trim();
let hasWarnedMissingSecret = false;

/**
 * Gửi webhook event đến webhook service
 * @param {string} eventType - Loại event (friend, task, meeting, document, chat, role, organization)
 * @param {string} eventName - Tên event cụ thể (ví dụ: friend_request_accepted, task_created)
 * @param {object} data - Dữ liệu event
 */
async function sendWebhook(eventType, eventName, data) {
  try {
    const payload = {
      event_type: eventName,
      ...data,
    };

    await axios.post(
      `${WEBHOOK_SERVICE_URL}/webhook/${eventType}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(WEBHOOK_SECRET ? { 'X-Webhook-Secret': WEBHOOK_SECRET } : {}),
        },
        timeout: 5000, // 5 seconds timeout
      }
    );

    if (!WEBHOOK_SECRET && !hasWarnedMissingSecret) {
      hasWarnedMissingSecret = true;
      logger.warn('WEBHOOK_SECRET is not configured; outbound webhook requests are unsigned');
    }

    logger.info(`Webhook sent: ${eventType}/${eventName}`);
  } catch (error) {
    // Log error nhưng không throw để không ảnh hưởng đến flow chính
    const status = error.response?.status;
    const detail = error.response?.data?.detail || error.response?.data?.message;
    logger.error(
      `Error sending webhook ${eventType}/${eventName}: ${error.message}${status ? ` [HTTP ${status}]` : ''}${detail ? ` — ${detail}` : ''}`
    );
  }
}

/**
 * Gửi friend webhook
 */
const friendWebhook = {
  async requestAccepted(userId, friendId, friendName) {
    await sendWebhook('friend', 'friend_request_accepted', {
      userId,
      friendId,
      friendName,
    });
  },

  async requestSent(userId, friendId, userName) {
    await sendWebhook('friend', 'friend_request_sent', {
      userId,
      friendId,
      userName,
    });
  },

  async removed(userId, friendId, friendName) {
    await sendWebhook('friend', 'friend_removed', {
      userId,
      friendId,
      friendName,
    });
  },
};

/**
 * Gửi task webhook
 */
const taskWebhook = {
  async created(taskId, taskTitle, createdBy, assigneeId, organizationId) {
    await sendWebhook('task', 'task_created', {
      taskId,
      taskTitle,
      createdBy,
      assigneeId,
      organizationId,
    });
  },

  async assigned(taskId, taskTitle, assigneeId, assignedBy, organizationId) {
    await sendWebhook('task', 'task_assigned', {
      taskId,
      taskTitle,
      assigneeId,
      assignedBy,
      organizationId,
    });
  },

  async completed(taskId, taskTitle, completedBy, createdBy, organizationId) {
    await sendWebhook('task', 'task_completed', {
      taskId,
      taskTitle,
      completedBy,
      createdBy,
      organizationId,
    });
  },

  async updated(taskId, taskTitle, assigneeId, updatedBy, changes, organizationId) {
    await sendWebhook('task', 'task_updated', {
      taskId,
      taskTitle,
      assigneeId,
      updatedBy,
      changes,
      organizationId,
    });
  },
};

/**
 * Gửi meeting webhook
 */
const meetingWebhook = {
  async created(meetingId, meetingTitle, hostId, participantIds, serverId, organizationId, startTime) {
    await sendWebhook('meeting', 'meeting_created', {
      meetingId,
      meetingTitle,
      hostId,
      participantIds,
      serverId,
      organizationId,
      startTime,
    });
  },

  async started(meetingId, meetingTitle, participantIds, serverId) {
    await sendWebhook('meeting', 'meeting_started', {
      meetingId,
      meetingTitle,
      participantIds,
      serverId,
    });
  },

  async ended(meetingId, meetingTitle, participantIds) {
    await sendWebhook('meeting', 'meeting_ended', {
      meetingId,
      meetingTitle,
      participantIds,
    });
  },

  async participantJoined(meetingId, meetingTitle, participantId, participantName, otherParticipantIds) {
    await sendWebhook('meeting', 'participant_joined', {
      meetingId,
      meetingTitle,
      participantId,
      participantName,
      otherParticipantIds,
    });
  },
};

/**
 * Gửi document webhook
 */
const documentWebhook = {
  async uploaded(documentId, documentName, uploadedBy, organizationId, serverId, sharedWith) {
    await sendWebhook('document', 'document_uploaded', {
      documentId,
      documentName,
      uploadedBy,
      organizationId,
      serverId,
      sharedWith,
    });
  },

  async updated(documentId, documentName, updatedBy, organizationId, serverId, sharedWith) {
    await sendWebhook('document', 'document_updated', {
      documentId,
      documentName,
      updatedBy,
      organizationId,
      serverId,
      sharedWith,
    });
  },

  async shared(documentId, documentName, sharedBy, sharedWith, organizationId, serverId) {
    await sendWebhook('document', 'document_shared', {
      documentId,
      documentName,
      sharedBy,
      sharedWith,
      organizationId,
      serverId,
    });
  },
};

/**
 * Gửi chat webhook
 */
const chatWebhook = {
  async messageCreated(messageId, senderId, senderName, roomId, roomName, content, mentionedUserIds, recipientIds) {
    await sendWebhook('chat', 'message_created', {
      messageId,
      senderId,
      senderName,
      roomId,
      roomName,
      content,
      mentionedUserIds,
      recipientIds,
    });
  },

  async messageMentioned(messageId, senderId, senderName, roomId, roomName, content, mentionedUserIds) {
    await sendWebhook('chat', 'message_mentioned', {
      messageId,
      senderId,
      senderName,
      roomId,
      roomName,
      content,
      mentionedUserIds,
    });
  },
};

/**
 * Gửi role webhook
 */
const roleWebhook = {
  async assigned(userId, roleName, serverId, serverName, assignedBy, organizationId) {
    await sendWebhook('role', 'role_assigned', {
      userId,
      roleName,
      serverId,
      serverName,
      assignedBy,
      organizationId,
    });
  },

  async removed(userId, roleName, serverId, serverName, removedBy, organizationId) {
    await sendWebhook('role', 'role_removed', {
      userId,
      roleName,
      serverId,
      serverName,
      removedBy,
      organizationId,
    });
  },
};

/**
 * Gửi organization webhook
 */
const organizationWebhook = {
  async serverMemberAdded(userId, serverId, serverName, addedBy, organizationId) {
    await sendWebhook('organization', 'server_member_added', {
      userId,
      serverId,
      serverName,
      addedBy,
      organizationId,
    });
  },

  async serverMemberRemoved(userId, serverId, serverName, removedBy, organizationId) {
    await sendWebhook('organization', 'server_member_removed', {
      userId,
      serverId,
      serverName,
      removedBy,
      organizationId,
    });
  },

  async organizationCreated(organizationId, organizationName, ownerId) {
    await sendWebhook('organization', 'organization_created', {
      organizationId,
      organizationName,
      ownerId,
    });
  },
};

module.exports = {
  sendWebhook,
  friendWebhook,
  taskWebhook,
  meetingWebhook,
  documentWebhook,
  chatWebhook,
  roleWebhook,
  organizationWebhook,
};



