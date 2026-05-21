import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Menu ngữ cảnh Zalo-style cho ảnh/tệp trong sidebar DM.
 */
export default function ChatAttachmentContextMenu({
  open,
  x = 0,
  y = 0,
  items = [],
  onClose,
  isDarkMode = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !items.length) return null;

  const panel = isDarkMode
    ? 'border-white/10 bg-[#1a1d26] text-gray-100 shadow-2xl'
    : 'border-slate-200 bg-white text-slate-800 shadow-xl';

  return createPortal(
    <div
      ref={ref}
      className={`fixed z-[350] min-w-[220px] overflow-hidden rounded-xl border py-1 ${panel}`}
      style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 320) }}
      role="menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) item.onClick?.();
            onClose?.();
          }}
          className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition ${
            item.danger
              ? 'text-red-500 hover:bg-red-500/10 disabled:opacity-40'
              : isDarkMode
                ? 'hover:bg-white/[0.06] disabled:opacity-40'
                : 'hover:bg-slate-50 disabled:opacity-40'
          }`}
        >
          {item.icon && <span className="w-5 shrink-0 text-center text-base">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
