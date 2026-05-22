/** Chuẩn avatar toàn app: bo góc (squircle), nền màu + chữ trắng (JA = initials). */

function resolveMediaUrlLocal(path) {
  if (!path) return '';
  const p = String(path).trim();
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${p.startsWith('/') ? p : `/${p}`}`;
  }
  return p;
}

export const AVATAR_RADIUS_CLASS = 'rounded-xl';

export const AVATAR_TEXT_CLASS = 'font-bold text-white uppercase tracking-tight select-none';

const SIZE_CLASS = {
  xs: 'h-7 w-7 text-[10px]',
  chip: 'h-8 w-8 text-[10px]',
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-10 w-10 text-xs',
  lg: 'h-14 w-14 text-sm',
  profile: 'h-16 w-16 text-xl',
  xl: 'h-20 w-20 text-2xl',
  '2xl': 'h-24 w-24 text-3xl',
  hero: 'h-28 w-28 text-3xl',
};

export function voiceSpeakingRingClass(active) {
  return active
    ? 'ring-2 ring-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.45)]'
    : 'ring-2 ring-transparent';
}

const AVATAR_BG_COLORS = [
  'bg-violet-500',
  'bg-indigo-500',
  'bg-blue-500',
  'bg-cyan-500',
  'bg-teal-500',
  'bg-purple-500',
  'bg-fuchsia-500',
];

export function isAvatarImageUrl(value) {
  if (value == null || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (v.startsWith('/uploads/') || v.startsWith('/api/')) return true;
  if (v.startsWith('data:image/')) return true;
  return false;
}

/** Hai chữ cái viết tắt (Họ + Tên → chữ đầu mỗi từ, hoặc 2 ký tự đầu nếu một từ). */
export function displayInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  const one = parts[0] || '';
  if (one.length >= 2) return one.slice(0, 2).toUpperCase();
  return (one[0] || '?').toUpperCase();
}

export function getAvatarBgClass(name) {
  const key = String(name || '?').trim();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_BG_COLORS.length;
  return AVATAR_BG_COLORS[index];
}

export function getAvatarSizeClass(size = 'md') {
  return SIZE_CLASS[size] || SIZE_CLASS.md;
}

/** Class cho placeholder initials (không có ảnh). */
export function avatarPlaceholderClassName(name, size = 'md', extra = '') {
  return [
    'inline-flex shrink-0 items-center justify-center overflow-hidden',
    AVATAR_RADIUS_CLASS,
    getAvatarSizeClass(size),
    getAvatarBgClass(name),
    AVATAR_TEXT_CLASS,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Class shell khi có ảnh (cùng shape/size). */
export function avatarImageShellClassName(size = 'md', extra = '') {
  return [
    'inline-flex shrink-0 items-center justify-center overflow-hidden',
    AVATAR_RADIUS_CLASS,
    getAvatarSizeClass(size),
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export function resolveAvatarSrc(avatar, cacheBust) {
  if (!isAvatarImageUrl(avatar)) return null;
  let url = resolveMediaUrlLocal(String(avatar).trim());
  if (!url) return null;
  if (cacheBust) {
    const sep = url.includes('?') ? '&' : '?';
    url = `${url}${sep}v=${encodeURIComponent(String(cacheBust))}`;
  }
  return url;
}

export const AVATAR_FILE_ACCEPT =
  'image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/svg+xml,image/x-icon,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.ico,.avif,.heic,.heif';
