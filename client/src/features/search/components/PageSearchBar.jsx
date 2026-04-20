import { Search } from 'lucide-react';

/**
 * Ô tìm kiếm gọn cho lọc cục bộ (tin nhắn, thông báo, lịch, v.v.).
 */
export default function PageSearchBar({
  value,
  onChange,
  placeholder,
  isDarkMode,
  className = '',
  id,
  'aria-label': ariaLabel,
}) {
  const inputClass = isDarkMode
    ? 'border-white/10 bg-white/[0.06] text-white placeholder:text-[#6B6B80] focus:border-cyan-500/45 focus:shadow-[0_0_12px_rgba(6,182,212,0.2)]'
    : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25';

  return (
    <div className={`relative min-w-0 ${className}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-45"
        aria-hidden
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className={`h-9 w-full min-w-0 rounded-lg border py-2 pl-9 pr-3 text-sm outline-none transition ${inputClass}`}
      />
    </div>
  );
}
