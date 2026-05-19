/** Định nghĩa quyền kênh theo vai trò — mỗi kênh lưu riêng (ChannelRoleAccess). */

export const CHANNEL_PERM_KEYS = {
  see: 'canSee',
  read: 'canRead',
  write: 'canWrite',
  delete: 'canDelete',
  voice: 'canVoice',
};

export function emptyChannelRolePermissions() {
  return {
    canSee: false,
    canRead: false,
    canWrite: false,
    canDelete: false,
    canVoice: false,
  };
}

/** Mặc định khi thêm vai trò vào kênh: xem kênh + (đọc chat / kết nối voice). */
export function defaultChannelRolePermissions(isVoiceChannel) {
  if (isVoiceChannel) {
    return {
      canSee: true,
      canRead: true,
      canWrite: false,
      canDelete: false,
      canVoice: true,
    };
  }
  return {
    canSee: true,
    canRead: true,
    canWrite: false,
    canDelete: false,
    canVoice: false,
  };
}

export function hasAnyChannelRolePermission(permissions) {
  const p = permissions || {};
  return Boolean(p.canSee || p.canRead || p.canWrite || p.canDelete || p.canVoice);
}

function permRow(id, title, description, key) {
  return { id, title, description, key };
}

export function channelPermissionGroups({ isVoiceChannel }) {
  const general = [
    permRow(
      'view',
      'Xem kênh',
      'Cho phép thành viên có vai trò này nhìn thấy kênh trong danh sách và mở kênh.',
      CHANNEL_PERM_KEYS.see
    ),
  ];

  const text = [
    permRow(
      'history',
      'Xem lịch sử tin nhắn',
      'Cho phép đọc tin nhắn đã gửi trong kênh này (kể cả khi không trực tuyến lúc gửi).',
      CHANNEL_PERM_KEYS.read
    ),
    permRow(
      'send',
      'Gửi tin nhắn',
      'Cho phép gửi tin nhắn và tương tác trong kênh chat này.',
      CHANNEL_PERM_KEYS.write
    ),
    permRow(
      'manage',
      'Quản lý tin nhắn',
      'Cho phép xóa hoặc gỡ nội dung tin nhắn của thành viên khác trong kênh.',
      CHANNEL_PERM_KEYS.delete
    ),
  ];

  const voice = [
    permRow(
      'connect',
      'Kết nối',
      'Cho phép tham gia kênh voice và nghe người khác nói.',
      CHANNEL_PERM_KEYS.voice
    ),
  ];

  const groups = [{ id: 'general', title: 'Quyền tổng quát kênh', items: general }];

  if (isVoiceChannel) {
    groups.push({ id: 'voice', title: 'Quyền kênh thoại', items: voice });
    groups.push({ id: 'text-in-voice', title: 'Chat kênh voice', items: text });
  } else {
    groups.push({ id: 'text', title: 'Quyền tin nhắn', items: text });
  }

  return groups;
}

/** Quyền mặc định khi thêm vai trò vào khối / phòng ban (áp dụng kế thừa xuống kênh). */
export function defaultScopeRolePermissions() {
  return {
    canSee: true,
    canRead: true,
    canWrite: false,
    canDelete: false,
    canVoice: false,
  };
}

/** Nhóm quyền cho cài đặt khối / phòng ban (mọi loại kênh con). */
export function scopePermissionGroups() {
  const general = [
    permRow(
      'view',
      'Xem kênh',
      'Cho phép nhìn thấy các kênh thuộc phạm vi này trong danh sách.',
      CHANNEL_PERM_KEYS.see
    ),
  ];
  const text = [
    permRow(
      'history',
      'Xem lịch sử tin nhắn',
      'Cho phép đọc tin nhắn trong các kênh chat thuộc phạm vi.',
      CHANNEL_PERM_KEYS.read
    ),
    permRow(
      'send',
      'Gửi tin nhắn',
      'Cho phép gửi tin nhắn trong các kênh chat thuộc phạm vi.',
      CHANNEL_PERM_KEYS.write
    ),
    permRow(
      'manage',
      'Quản lý tin nhắn',
      'Cho phép xóa hoặc gỡ tin nhắn trong các kênh chat thuộc phạm vi.',
      CHANNEL_PERM_KEYS.delete
    ),
  ];
  const voice = [
    permRow(
      'connect',
      'Kết nối voice',
      'Cho phép tham gia các kênh voice thuộc phạm vi.',
      CHANNEL_PERM_KEYS.voice
    ),
  ];
  return [
    { id: 'general', title: 'Quyền tổng quát', items: general },
    { id: 'text', title: 'Quyền kênh chat', items: text },
    { id: 'voice', title: 'Quyền kênh voice', items: voice },
  ];
}

/** Bật quyền phụ thuộc (xem kênh → đọc; viết/xóa → đọc). */
export function applyChannelPermissionToggle(prev, key, allowed) {
  const next = { ...prev, [key]: allowed };
  if (key === CHANNEL_PERM_KEYS.see && allowed) {
    next.canRead = true;
  }
  if (key === CHANNEL_PERM_KEYS.see && !allowed) {
    next.canRead = false;
    next.canWrite = false;
    next.canDelete = false;
    next.canVoice = false;
  }
  if (key === CHANNEL_PERM_KEYS.read && !allowed) {
    next.canWrite = false;
    next.canDelete = false;
  }
  if ((key === CHANNEL_PERM_KEYS.write || key === CHANNEL_PERM_KEYS.delete) && allowed) {
    next.canSee = true;
    next.canRead = true;
  }
  if (key === CHANNEL_PERM_KEYS.voice && allowed) {
    next.canSee = true;
  }
  return next;
}

/** Màu nhãn vai trò (sidebar). */
const ROLE_COLORS = [
  '#f23f43',
  '#f0b232',
  '#3ba55d',
  '#5865f2',
  '#eb459e',
  '#57f287',
  '#ed4245',
  '#fee75c',
];

export function roleAccentColor(roleId, index = 0) {
  const s = String(roleId || '');
  let hash = index;
  for (let i = 0; i < s.length; i += 1) hash = (hash + s.charCodeAt(i) * 17) % ROLE_COLORS.length;
  return ROLE_COLORS[hash % ROLE_COLORS.length];
}
