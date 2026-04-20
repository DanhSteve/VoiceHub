/**
 * Chuỗi class shell — đồng bộ tông auth (navy + teal / light slate + cyan).
 * Chỉ export chuỗi Tailwind, không logic.
 */

export function appShellBg(isDark) {
  return isDark
    ? 'bg-[#050810]'
    : 'bg-gradient-to-b from-sky-100 via-cyan-50/70 to-slate-200';
}

/** Dải header trang con trong khung giữa ThreeFrame — cùng tông Dashboard (dashHeader). */
export function threeFramePageHeader(isDark) {
  return isDark
    ? 'border-b border-white/[0.06] bg-[#0D0D0F]/95 backdrop-blur-md'
    : 'border-b border-sky-200/90 bg-sky-50/95 backdrop-blur-md';
}

/** Nút mở dropdown bộ lọc (thay native select) — khớp inputSurface Dashboard dark. */
export function tasksFilterTrigger(isDark) {
  return isDark
    ? 'w-full min-h-[42px] rounded-xl border border-white/[0.08] bg-[#1A1A1C] px-3 py-2 text-sm text-white shadow-sm transition-colors hover:bg-[#222] focus:outline-none focus:ring-2 focus:ring-cyan-500/25 flex items-center justify-between gap-2'
    : 'w-full min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 flex items-center justify-between gap-2';
}

export function navSidebarRail(isDark) {
  return isDark
    ? 'bg-[#101827]/96 backdrop-blur-xl border-r border-slate-700/55'
    : 'bg-sky-50/98 backdrop-blur-xl border-r border-sky-200/90 shadow-[inset_-1px_0_0_rgba(14,165,233,0.06)]';
}

export function navOuterStrip(isDark) {
  return isDark ? 'border-slate-800/80' : 'border-slate-200/90';
}

export function navLogoTile() {
  return 'bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-900/25';
}

export function navItemActive() {
  return 'bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-lg shadow-cyan-900/30';
}

export function navItemInactiveHover(isDark) {
  return isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-100';
}

export function navTimeText(isDark) {
  return isDark ? 'text-slate-500' : 'text-slate-500';
}

export function navDivider(isDark) {
  return isDark ? 'bg-white/10' : 'bg-slate-200';
}

export function threeFrameRightPanel(isDark) {
  return isDark
    ? 'bg-[#101827]/92 backdrop-blur-xl border-l border-slate-700/50'
    : 'bg-sky-50/95 backdrop-blur-xl border-l border-sky-200/90';
}

export function tooltipBubble(isDark) {
  return isDark
    ? 'bg-slate-800 border border-slate-600/80 text-white shadow-xl'
    : 'bg-white border border-slate-200 text-slate-900 shadow-xl';
}

export function profileDropdownCard(isDark) {
  return isDark
    ? 'bg-[#151c2c]/98 border border-slate-600/50 shadow-2xl'
    : 'bg-white border border-slate-200/90 shadow-2xl';
}

export function profileDropdownHeader() {
  return 'bg-gradient-to-br from-cyan-600/90 to-teal-700/85';
}

export function profileDropdownBody(isDark) {
  return isDark ? 'bg-[#151c2c] px-4 py-3' : 'bg-slate-50 px-4 py-3';
}

export function profileMenuRow(isDark) {
  return isDark
    ? 'rounded-lg hover:bg-white/5 text-sm text-slate-100'
    : 'rounded-lg hover:bg-slate-100 text-sm text-slate-800';
}
