/** Chuẩn hiển thị avatar — URL ảnh hoặc initials từ tên. */

export function isAvatarImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function displayInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  const one = parts[0] || '';
  return one.slice(0, 2).toUpperCase() || '?';
}
