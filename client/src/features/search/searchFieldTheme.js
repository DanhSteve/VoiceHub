/** Class names dùng chung cho AppSearchField và OrgWorkspaceSearch. */

const SIZE = {
  sm: {
    shell: 'h-8 rounded-lg',
    icon: 'left-2.5 h-3.5 w-3.5',
    input: 'text-xs pl-8 pr-8',
    clear: 'right-2 h-3.5 w-3.5',
  },
  md: {
    shell: 'h-10 rounded-xl',
    icon: 'left-3 h-4 w-4',
    input: 'text-sm pl-10 pr-10',
    clear: 'right-2.5 h-4 w-4',
  },
  lg: {
    shell: 'h-11 rounded-xl',
    icon: 'left-3.5 h-[18px] w-[18px]',
    input: 'text-sm pl-11 pr-11',
    clear: 'right-3 h-4 w-4',
  },
};

export function getSearchFieldClasses({
  isDarkMode,
  size = 'md',
  variant = 'default',
  fullWidth = true,
}) {
  const s = SIZE[size] || SIZE.md;

  const surface =
    variant === 'subtle'
      ? isDarkMode
        ? 'border-white/[0.06] bg-white/[0.03]'
        : 'border-slate-100 bg-slate-50/80'
      : isDarkMode
        ? 'border-white/10 bg-white/[0.06]'
        : 'border-slate-200 bg-white';

  const focus = isDarkMode
    ? 'focus-within:border-cyan-500/50 focus-within:shadow-[0_0_0_3px_rgba(6,182,212,0.15)]'
    : 'focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20';

  const text = isDarkMode
    ? 'text-white placeholder:text-[#6B6B80]'
    : 'text-slate-900 placeholder:text-slate-400';

  return {
    wrapper: `${fullWidth ? 'w-full' : ''} min-w-0`,
    shell: `relative flex items-center border transition ${s.shell} ${surface} ${focus}`,
    icon: `pointer-events-none absolute top-1/2 -translate-y-1/2 opacity-50 ${s.icon}`,
    input: `w-full min-w-0 bg-transparent outline-none ${s.input} ${text}`,
    clearBtn: `absolute top-1/2 -translate-y-1/2 rounded-md p-0.5 opacity-60 transition hover:opacity-100 ${s.clear} ${
      isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100'
    }`,
    orgSurface: isDarkMode
      ? 'border-white/10 bg-white/[0.06]'
      : 'border-slate-200 bg-white shadow-sm',
  };
}
