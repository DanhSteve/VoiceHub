import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Bold,
  Code,
  Italic,
  Link2,
  Sparkles,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

function UnifiedChatComposer({
  value = '',
  onChange,
  onSend,
  placeholder = 'Nhập tin nhắn...',
  disabled = false,
  sendDisabled = false,
  sendLabel = 'Gửi',
  plusItems = [],
  onOpenGift,
  onOpenGif,
  onOpenSticker,
  onOpenEmoji,
  onOpenApps,
  actionItems,
  /** Tuỳ chỉnh lớp vỏ ngoài (ví dụ nền khớp trang chat bạn bè) */
  wrapperClassName,
  /** Ví dụ: thanh “Đang phản hồi …” phía trên ô nhập */
  topSlot = null,
  /** Thanh định dạng phía trên ô nhập (chat 1-1 kiểu Discord/Teams) */
  richToolbar = false,
  onRichAction,
  /** Nút AI trợ lý (chỉ UI; bật/tắt tùy parent) */
  showAiToggle = false,
  aiEnabled = false,
  onAiToggle,
}) {
  const { isDarkMode } = useTheme();
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const plusButtonRef = useRef(null);
  const plusMenuRef = useRef(null);
  const inputRef = useRef(null);

  const safePlusItems = useMemo(
    () => (Array.isArray(plusItems) ? plusItems.filter((item) => item && item.label) : []),
    [plusItems]
  );
  const resolvedActionItems = useMemo(() => {
    if (Array.isArray(actionItems)) {
      return actionItems.filter((item) => item && item.key);
    }
    return [
      { key: 'gift', title: 'Quà tặng', content: '🎁', onClick: onOpenGift, className: 'text-lg' },
      { key: 'gif', title: 'GIF', content: 'GIF', onClick: onOpenGif, className: 'px-1 text-[11px] font-bold min-w-8' },
      { key: 'sticker', title: 'Sticker', content: '😶‍🌫️', onClick: onOpenSticker, className: 'text-base' },
      { key: 'emoji', title: 'Emoji', content: '🙂', onClick: onOpenEmoji, className: 'text-lg' },
      { key: 'apps', title: 'Ứng dụng', content: '✳️', onClick: onOpenApps, className: 'text-base' },
    ];
  }, [actionItems, onOpenGift, onOpenGif, onOpenSticker, onOpenEmoji, onOpenApps]);

  useEffect(() => {
    if (!showPlusMenu) return undefined;

    const handleOutsideClick = (event) => {
      if (
        plusMenuRef.current &&
        !plusMenuRef.current.contains(event.target) &&
        plusButtonRef.current &&
        !plusButtonRef.current.contains(event.target)
      ) {
        setShowPlusMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showPlusMenu]);

  const handleSend = () => {
    if (disabled || sendDisabled) return;
    onSend?.();
  };

  const insertWrap = (before, after = before) => {
    if (disabled) return;
    const el = inputRef.current;
    const cur = value ?? '';
    if (el && typeof el.selectionStart === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      const sel = cur.slice(start, end);
      const next = `${cur.slice(0, start)}${before}${sel}${after}${cur.slice(end)}`;
      onChange?.(next);
      requestAnimationFrame(() => {
        try {
          el.focus();
          const pos = start + before.length + sel.length + after.length;
          el.setSelectionRange(pos, pos);
        } catch {
          /* ignore */
        }
      });
      return;
    }
    onChange?.(`${cur}${before}${after}`);
  };

  const fmt = (kind) => {
    onRichAction?.(kind);
    if (kind === 'bold') insertWrap('**', '**');
    else if (kind === 'italic') insertWrap('*', '*');
    else if (kind === 'code') insertWrap('`', '`');
    else if (kind === 'mention') insertWrap('@');
    else if (kind === 'link') insertWrap('[', '](url)');
  };

  const defaultWrapper = isDarkMode
    ? 'shrink-0 border-t border-slate-800 bg-slate-900/60 p-3.5'
    : 'shrink-0 border-t border-slate-200 bg-white p-3.5';
  const richToolbarDivider = isDarkMode ? 'border-b border-white/[0.06]' : 'border-b border-slate-200';
  const fmtBtn = isDarkMode
    ? 'rounded-md p-2 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40'
    : 'rounded-md p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40';
  const composerInner = isDarkMode
    ? 'relative flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#12141c] px-2 py-2 shadow-inner'
    : 'relative flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 shadow-inner';
  const plusBtnClass = isDarkMode
    ? 'h-9 w-9 shrink-0 rounded-lg text-2xl leading-none text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50'
    : 'h-9 w-9 shrink-0 rounded-lg text-2xl leading-none text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50';
  const plusMenuClass = isDarkMode
    ? 'absolute bottom-[52px] left-0 z-30 w-56 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl'
    : 'absolute bottom-[52px] left-0 z-30 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl';
  const plusMenuRow = isDarkMode
    ? 'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white transition hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-40'
    : 'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';
  const textareaClass = isDarkMode
    ? 'max-h-40 min-h-[44px] flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-gray-500 disabled:opacity-60'
    : 'max-h-40 min-h-[44px] flex-1 resize-y bg-transparent px-2 py-2 text-sm leading-relaxed text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60';
  const actionBtn = isDarkMode
    ? 'h-9 rounded-md text-gray-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50'
    : 'h-9 rounded-md text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-50';

  return (
    <div className={wrapperClassName ?? defaultWrapper}>
      {topSlot}
      {richToolbar && (
        <div className={`mb-2 flex flex-wrap items-center gap-0.5 pb-2 ${richToolbarDivider}`}>
          {[
            { k: 'bold', Icon: Bold, title: 'Đậm' },
            { k: 'italic', Icon: Italic, title: 'Nghiêng' },
            { k: 'link', Icon: Link2, title: 'Liên kết' },
            { k: 'mention', Icon: AtSign, title: 'Nhắc tên' },
            { k: 'code', Icon: Code, title: 'Mã' },
          ].map(({ k, Icon, title }) => (
            <button
              key={k}
              type="button"
              disabled={disabled}
              title={title}
              onClick={() => fmt(k)}
              className={fmtBtn}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
      <div className={composerInner}>
        <div className="flex items-end gap-2">
        {safePlusItems.length > 0 && (
          <>
            <button
              ref={plusButtonRef}
              type="button"
              disabled={disabled}
              onClick={() => setShowPlusMenu((prev) => !prev)}
              className={plusBtnClass}
              title="Thêm tiện ích"
            >
              +
            </button>

            {showPlusMenu && (
              <div ref={plusMenuRef} className={plusMenuClass}>
                {safePlusItems.map((item) => (
                  <button
                    key={item.key || item.label}
                    type="button"
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick?.();
                      setShowPlusMenu(false);
                    }}
                    className={plusMenuRow}
                  >
                    <span className="text-base">{item.icon || '•'}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <textarea
          ref={inputRef}
          value={value}
          rows={richToolbar ? 3 : 1}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className={textareaClass}
        />

        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1">
            {resolvedActionItems.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={disabled || item.disabled}
                onClick={item.onClick}
                className={`${actionBtn} ${item.className || 'w-9 text-base'}`}
                title={item.title || item.label || item.key}
              >
                {item.content}
              </button>
            ))}
            {showAiToggle && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAiToggle?.(!aiEnabled)}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
                  aiEnabled
                    ? isDarkMode
                      ? 'bg-cyan-600/35 text-cyan-50 ring-1 ring-cyan-500/45'
                      : 'bg-cyan-100 text-cyan-900 ring-1 ring-cyan-400/50'
                    : isDarkMode
                      ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
                }`}
                title="Gợi ý AI (beta)"
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || sendDisabled}
            className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-900/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sendLabel}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

export default UnifiedChatComposer;
