/** Màu accent cho khối (Division) — xoay vòng theo thứ tự */
export const DIVISION_ACCENTS = [
  { bar: 'bg-violet-500', glow: 'shadow-[inset_3px_0_0_0_rgb(139,92,246)]', badge: 'bg-violet-500/20 text-violet-300' },
  { bar: 'bg-emerald-500', glow: 'shadow-[inset_3px_0_0_0_rgb(16,185,129)]', badge: 'bg-emerald-500/20 text-emerald-300' },
  { bar: 'bg-amber-500', glow: 'shadow-[inset_3px_0_0_0_rgb(245,158,11)]', badge: 'bg-amber-500/20 text-amber-300' },
  { bar: 'bg-sky-500', glow: 'shadow-[inset_3px_0_0_0_rgb(14,165,233)]', badge: 'bg-sky-500/20 text-sky-300' },
];

export function divisionAccent(index) {
  return DIVISION_ACCENTS[index % DIVISION_ACCENTS.length];
}

/** Màu ô vuông phòng ban — ổn định theo tên/id */
export function departmentSquareClass(seed = '') {
  const palette = [
    'bg-violet-500',
    'bg-emerald-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-amber-500',
    'bg-indigo-500',
  ];
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function channelUnreadCount(channel) {
  const n = Number(channel?.unreadCount ?? channel?.unread ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function voicePresenceLabel(channel) {
  const active = Number(channel?.voiceActiveCount ?? channel?.activeVoiceCount ?? 0);
  const max = Number(channel?.voiceCapacity ?? channel?.voiceMax ?? 0);
  if (max > 0) return `${Math.max(0, active)}/${max}`;
  if (active > 0) return String(active);
  return '';
}
