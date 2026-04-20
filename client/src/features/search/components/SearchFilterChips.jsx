/**
 * Nhóm nút lọc một hàng (tab / segment), dùng kèm ô tìm kiếm trên từng trang.
 */
export default function SearchFilterChips({
  options,
  value,
  onChange,
  isDarkMode,
  className = '',
  size = 'md',
  'aria-label': ariaLabel,
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs sm:text-sm';
  const inactive = isDarkMode
    ? 'border border-slate-700/80 bg-[#0a1322]/90 text-gray-300 hover:bg-slate-800/80'
    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
  const active =
    'border border-transparent bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-sm';

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-overlay ${className}`}
    >
      {options.map((opt) => {
        const id = opt.id;
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`shrink-0 whitespace-nowrap rounded-xl font-semibold transition-all ${pad} ${
              selected ? active : inactive
            }`}
          >
            {opt.icon ? <span className="mr-1 opacity-90">{opt.icon}</span> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
