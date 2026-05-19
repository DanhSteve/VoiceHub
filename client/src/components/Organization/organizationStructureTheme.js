/** Accent khối Division — enterprise, không neon */
export const DIVISION_ACCENTS = [
  {
    bar: 'bg-[#4F6BED]',
    glow: 'shadow-[inset_3px_0_0_0_rgb(79,107,237)]',
    badge: 'bg-[#4F6BED]/15 text-[#A8B8F8]',
  },
  {
    bar: 'bg-emerald-500/80',
    glow: 'shadow-[inset_3px_0_0_0_rgb(52,211,153)]',
    badge: 'bg-emerald-500/15 text-emerald-300/90',
  },
  {
    bar: 'bg-slate-500/80',
    glow: 'shadow-[inset_3px_0_0_0_rgb(100,116,139)]',
    badge: 'bg-white/10 text-[#A1A8B3]',
  },
  {
    bar: 'bg-sky-500/80',
    glow: 'shadow-[inset_3px_0_0_0_rgb(56,189,248)]',
    badge: 'bg-sky-500/15 text-sky-300/90',
  },
];

export function divisionAccent(index) {
  return DIVISION_ACCENTS[index % DIVISION_ACCENTS.length];
}

/** Màu chỉ báo phòng ban — muted */
export function departmentSquareClass(seed = '') {
  const palette = [
    'bg-[#4F6BED]/90',
    'bg-emerald-500/80',
    'bg-slate-500/80',
    'bg-sky-500/80',
    'bg-amber-500/80',
    'bg-indigo-400/80',
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
