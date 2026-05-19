/**
 * Design tokens — enterprise workspace (Slack / Teams inspired).
 */
/** Bo góc đồng bộ — enterprise, không quá tròn */
export const entRadius = {
  panel: 'rounded-xl',
  card: 'rounded-lg',
  control: 'rounded-lg',
  sm: 'rounded-md',
  pill: 'rounded-full',
};

export const ent = {
  bg: {
    main: '#0F1117',
    sidebar: '#11141C',
    elevated: '#171B24',
    hover: '#1D2330',
    input: '#141820',
  },
  border: {
    subtle: 'border-white/[0.06]',
    default: 'border-white/10',
    strong: 'border-white/[0.12]',
  },
  text: {
    primary: '#F3F4F6',
    secondary: '#A1A8B3',
    muted: '#6B7280',
  },
  accent: {
    DEFAULT: '#4F6BED',
    soft: 'bg-[#4F6BED]/12',
    text: 'text-[#8BA3F5]',
    border: 'border-[#4F6BED]/35',
  },
  status: {
    success: 'text-emerald-400/90',
    warning: 'text-amber-400/90',
    danger: 'text-red-400/90',
  },
};

export function entShell(isDarkMode) {
  const r = entRadius;
  if (!isDarkMode) {
    return {
      shell: 'flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 p-2',
      shellInner: 'flex h-full min-h-0 flex-1 gap-2 overflow-hidden',
      sidebar: `flex shrink-0 flex-col ${r.panel} border border-slate-200/90 bg-white shadow-sm`,
      main: `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${r.panel} border border-slate-200/90 bg-white shadow-sm`,
      header: `shrink-0 border-b border-slate-200/80 bg-white px-4 py-2.5 ${r.panel}`,
      elevated: `bg-slate-50 border border-slate-200 ${r.card}`,
      hover: 'hover:bg-slate-50',
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-600',
      textMuted: 'text-slate-500',
    };
  }
  return {
    shell: 'flex h-full min-h-0 flex-col overflow-hidden bg-[#0F1117] p-2',
    shellInner: 'flex h-full min-h-0 flex-1 gap-2 overflow-hidden',
    sidebar: `flex shrink-0 flex-col ${r.panel} border border-white/[0.08] bg-[#11141C] shadow-[0_1px_0_rgba(255,255,255,0.04)]`,
    main: `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${r.panel} border border-white/[0.08] bg-[#13161f] shadow-[0_1px_0_rgba(255,255,255,0.04)]`,
    header: 'shrink-0 border-b border-white/[0.06] bg-[#11141C]/95 px-4 py-2.5',
    elevated: `bg-[#171B24] border border-white/10 ${r.card}`,
    hover: 'hover:bg-[#1D2330]',
    textPrimary: 'text-[#F3F4F6]',
    textSecondary: 'text-[#A1A8B3]',
    textMuted: 'text-[#6B7280]',
  };
}

export function roleBadgeClass(role, isDarkMode) {
  const r = String(role || 'member').toLowerCase();
  if (r === 'owner') {
    return isDarkMode
      ? 'bg-amber-500/15 text-amber-200/90 border border-amber-500/25'
      : 'bg-amber-50 text-amber-800 border border-amber-200';
  }
  if (r === 'admin' || r === 'hr') {
    return isDarkMode
      ? 'bg-[#4F6BED]/15 text-[#A8B8F8] border border-[#4F6BED]/25'
      : 'bg-indigo-50 text-indigo-700 border border-indigo-200';
  }
  if (r === 'system') {
    return isDarkMode
      ? 'bg-white/5 text-[#9CA3AF] border border-white/10'
      : 'bg-slate-100 text-slate-600 border border-slate-200';
  }
  return isDarkMode
    ? 'bg-white/[0.06] text-[#C5CAD3] border border-white/10'
    : 'bg-slate-100 text-slate-600 border border-slate-200';
}

export function roleBadgeLabel(role, t) {
  const r = String(role || 'member').toLowerCase();
  if (r === 'owner') return 'OWNER';
  if (r === 'admin') return 'ADMIN';
  if (r === 'hr') return 'HR';
  if (r === 'system') return 'BOT';
  return 'MEMBER';
}
