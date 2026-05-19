import { Check, X } from 'lucide-react';

/**
 * Bật / tắt quyền (không có inherit — chỉ vai trò đã gán vào kênh mới hiện ở đây).
 */
export default function ChannelPermissionTriToggle({ allowed, onChange, isDarkMode, disabled = false }) {
  const shell = isDarkMode ? 'bg-[#1e1f22]' : 'bg-slate-100';
  const btn = (active, tone) =>
    `flex h-8 w-9 items-center justify-center transition ${
      active
        ? tone === 'deny'
          ? 'bg-rose-600/90 text-white'
          : 'bg-emerald-600/90 text-white'
        : isDarkMode
          ? 'text-[#949ba4] hover:bg-white/[0.06]'
          : 'text-slate-500 hover:bg-slate-200/80'
    } ${disabled ? 'pointer-events-none opacity-40' : ''}`;

  return (
    <div
      className={`inline-flex overflow-hidden rounded-md border ${
        isDarkMode ? 'border-[#3f4147]' : 'border-slate-200'
      } ${shell}`}
      role="group"
      aria-label={allowed ? 'Cho phép' : 'Từ chối'}
    >
      <button
        type="button"
        className={btn(!allowed, 'deny')}
        onClick={() => onChange?.(false)}
        aria-pressed={!allowed}
        title="Từ chối"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={btn(allowed, 'allow')}
        onClick={() => onChange?.(true)}
        aria-pressed={allowed}
        title="Cho phép"
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
