/**
 * Wave 3A — Org domain events (RabbitMQ topic `voicehub.topic`).
 * Routing key = event `type` (ví dụ `org.member.joined`).
 */

const EXCHANGE = process.env.RABBITMQ_EXCHANGE || 'voicehub.topic';

/** @readonly */
const ORG_EVENT_TYPES = {
  MEMBER_JOINED: 'org.member.joined',
  MEMBER_REMOVED: 'org.member.removed',
  ROLE_UPDATED: 'org.role.updated',
  CHANNEL_PROVISIONED: 'org.channel.provisioned',
  ORG_DELETED: 'org.deleted',
  /** Legacy / bulk ACL invalidation (wave-2c) */
  ACL_UPDATED: 'org.acl.updated',
};

const CATALOG = [
  {
    type: ORG_EVENT_TYPES.MEMBER_JOINED,
    publisher: 'organization-service',
    consumers: ['chat-service', 'notification-service'],
    description: 'Thành viên gia nhập org (invite, duyệt đơn).',
  },
  {
    type: ORG_EVENT_TYPES.MEMBER_REMOVED,
    publisher: 'organization-service',
    consumers: ['chat-service', 'notification-service'],
    description: 'Thành viên bị xóa hoặc tự rời org.',
  },
  {
    type: ORG_EVENT_TYPES.ROLE_UPDATED,
    publisher: 'organization-service',
    consumers: ['chat-service', 'notification-service'],
    description: 'Đổi membership role hoặc gán role RBAC.',
  },
  {
    type: ORG_EVENT_TYPES.CHANNEL_PROVISIONED,
    publisher: 'organization-service',
    consumers: ['chat-service'],
    description: 'Cấu trúc/kênh org provision xong hoặc thay đổi lớn.',
  },
  {
    type: ORG_EVENT_TYPES.ORG_DELETED,
    publisher: 'organization-service',
    consumers: ['chat-service', 'notification-service'],
    description: 'Xóa organization — purge read models.',
  },
  {
    type: ORG_EVENT_TYPES.ACL_UPDATED,
    publisher: 'organization-service',
    consumers: ['chat-service'],
    description: 'Invalidate ACL cache (grant/revoke kênh, matrix role).',
  },
];

const CHAT_QUEUE = process.env.RABBITMQ_ORG_EVENTS_CHAT_QUEUE || 'voicehub.org.events.chat';
const NOTIFICATION_QUEUE =
  process.env.RABBITMQ_ORG_EVENTS_NOTIFICATION_QUEUE || 'voicehub.org.events.notification';
const CHAT_DLQ = process.env.RABBITMQ_ORG_EVENTS_CHAT_DLQ || `${CHAT_QUEUE}.dlq`;
const NOTIFICATION_DLQ =
  process.env.RABBITMQ_ORG_EVENTS_NOTIFICATION_DLQ || `${NOTIFICATION_QUEUE}.dlq`;

/** Bind pattern cho topic exchange */
const BINDING_KEYS = [
  'org.member.joined',
  'org.member.removed',
  'org.role.updated',
  'org.channel.provisioned',
  'org.deleted',
  'org.acl.updated',
];

function routingKeyForType(type) {
  const t = String(type || '').trim();
  if (BINDING_KEYS.includes(t)) return t;
  return ORG_EVENT_TYPES.ACL_UPDATED;
}

function isKnownOrgEventType(type) {
  return Object.values(ORG_EVENT_TYPES).includes(String(type || '').trim());
}

module.exports = {
  ORG_EVENT_EXCHANGE: EXCHANGE,
  ORG_EVENT_TYPES,
  ORG_EVENT_CATALOG: CATALOG,
  ORG_EVENTS_CHAT_QUEUE: CHAT_QUEUE,
  ORG_EVENTS_NOTIFICATION_QUEUE: NOTIFICATION_QUEUE,
  ORG_EVENTS_CHAT_DLQ: CHAT_DLQ,
  ORG_EVENTS_NOTIFICATION_DLQ: NOTIFICATION_DLQ,
  ORG_EVENT_BINDING_KEYS: BINDING_KEYS,
  routingKeyForType,
  isKnownOrgEventType,
  /** @deprecated — dùng ORG_EVENT_TYPES.ACL_UPDATED */
  ORG_ACL_EXCHANGE: EXCHANGE,
  ORG_ACL_ROUTING_KEY: ORG_EVENT_TYPES.ACL_UPDATED,
  ORG_ACL_QUEUE: CHAT_QUEUE,
};
