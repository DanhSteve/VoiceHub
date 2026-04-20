import { Bell } from 'lucide-react';

/**
 * Chuông thông báo trong ô bo góc + badge đỏ — đồng bộ Lucide + theme.
 */
function NotificationBellBadge({
  count = 0,
  className = '',
  sizeClass = 'h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12',
  isDark = true,
  textSizeClass: _legacy,
}) {
  void _legacy;
  const show = count > 0;
  const label = count > 99 ? '99+' : String(count);

  const surface = isDark
    ? 'bg-slate-800/95 border border-white/10 shadow-inner text-cyan-200'
    : 'bg-slate-100 border border-slate-200/90 shadow-inner text-cyan-700';

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-xl ${sizeClass} ${surface} ${className}`}
      aria-hidden={!show}
    >
      <Bell className="h-[1.15rem] w-[1.15rem] sm:h-5 sm:w-5 md:h-6 md:w-6" strokeWidth={1.75} aria-hidden />
      {show && (
        <span className="absolute -right-0.5 -top-0.5 z-10 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border border-red-600/60 bg-red-500 px-1 text-[10px] font-bold text-white shadow-md">
          {label}
        </span>
      )}
    </div>
  );
}

export default NotificationBellBadge;
