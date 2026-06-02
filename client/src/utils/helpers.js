export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ');
};

export const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/** Ngày sinh / dữ liệu cũ có thể null — không throw khi parse lỗi */
export const formatBirthDateSafe = (date, placeholder = 'Chưa cập nhật') => {
  if (date == null || date === '') return placeholder;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return placeholder;
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return `${formatDate(date)} ${formatTime(date)}`;
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const truncateText = (text, length = 50) => {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export { displayInitials as getInitials } from './avatarDisplay';

/** URL media same-origin. Không dùng cho /uploads/ trong <img> — dùng UserAvatar (JWT blob). */
export const resolveMediaUrl = (path) => {
  if (!path) return '';
  const p = String(path).trim();
  if (!p) return '';
  if (/\/uploads\//i.test(p)) return '';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${p.startsWith('/') ? p : `/${p}`}`;
  }
  return p;
};

/** Bóc payload API sau interceptor (success/data hoặc lồng data). */
export const unwrapApiData = (payload) => {
  if (payload == null) return null;
  let cur = payload;
  for (let i = 0; i < 2; i += 1) {
    if (cur && typeof cur === 'object' && cur.data !== undefined) {
      cur = cur.data;
    } else {
      break;
    }
  }
  return cur;
};

/** Gộp profile user-service vào session user (sidebar / Avatar). */
export const mergeAuthUserFromProfile = (prev, profilePayload, { avatarBust } = {}) => {
  const p = unwrapApiData(profilePayload) || profilePayload;
  if (!p || typeof p !== 'object') return prev;
  const avatar = p.avatar || p.avatarUrl || prev?.avatar || null;
  const bust =
    avatarBust !== undefined
      ? avatarBust
      : avatar && avatar !== prev?.avatar
        ? Date.now()
        : prev?.avatarCacheKey;
  return {
    ...(prev || {}),
    ...p,
    id: p.userId || p.id || prev?.id,
    avatar,
    avatarCacheKey: bust,
    displayName: p.displayName ?? prev?.displayName,
    email: p.email ?? prev?.email,
  };
};

export const getUserDisplayName = (user) => {
  if (!user) return 'Người dùng';
  const fromParts = [user.lastName, user.firstName].filter(Boolean).join(' ').trim();
  if (fromParts) return fromParts;
  if (user.displayName) return user.displayName;
  if (user.fullName) return user.fullName;
  if (user.name) return user.name;
  if (user.username) return user.username;
  if (user.email) return user.email.split('@')[0];
  return 'Người dùng';
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return re.test(password);
};

export { getAvatarBgClass as getAvatarColor } from './avatarDisplay';
