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
import UserAvatar from '../Shared/UserAvatar';

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
  /** Hiện nút Gửi (Enter vẫn gửi được khi tắt) */
  showSendButton = true,
  /** Ô nhập phẳng, không viền/nền bọc trong */
  flatInner = false,
  /** Một dòng (input text) thay vì textarea */
  singleLine = false,
  mentionItems = [],
  onPaste,
}) {
  const { isDarkMode } = useTheme();
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const plusButtonRef = useRef(null);
  const plusMenuRef = useRef(null);
  const mentionButtonRef = useRef(null);
  const mentionMenuRef = useRef(null);
  const inputRef = useRef(null);
  const selectionRef = useRef({ start: 0, end: 0 });

  const safePlusItems = useMemo(
    () => (Array.isArray(plusItems) ? plusItems.filter((item) => item && item.label) : []),
    [plusItems]
  );
  const safeMentionItems = useMemo(
    () => (Array.isArray(mentionItems) ? mentionItems.filter((item) => item && item.label) : []),
    [mentionItems]
  );
  const filteredMentionItems = useMemo(() => {
    const q = mentionQuery.trim().toLowerCase();
    if (!q) return safeMentionItems;
    return safeMentionItems.filter((item) => String(item.label || '').toLowerCase().includes(q));
  }, [safeMentionItems, mentionQuery]);
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
    if (!showPlusMenu && !showMentionMenu) return undefined;

    const handleOutsideClick = (event) => {
      const clickedPlusMenu = plusMenuRef.current?.contains(event.target);
      const clickedPlusButton = plusButtonRef.current?.contains(event.target);
      const clickedMentionMenu = mentionMenuRef.current?.contains(event.target);
      const clickedMentionButton = mentionButtonRef.current?.contains(event.target);
      if (clickedPlusMenu || clickedPlusButton || clickedMentionMenu || clickedMentionButton) return;
      setShowPlusMenu(false);
      setShowMentionMenu(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showPlusMenu, showMentionMenu]);

  const handleSend = () => {
    if (disabled || sendDisabled) return;
    onSend?.();
  };

  const syncSelection = () => {
    const el = inputRef.current;
    if (!el || typeof el.selectionStart !== 'number') return;
    selectionRef.current = {
      start: el.selectionStart,
      end: el.selectionEnd ?? el.selectionStart,
    };
  };

  const insertWrap = (before, after = before, selectRange) => {
    if (disabled) return;
    const el = inputRef.current;
    const cur = value ?? '';
    const saved = selectionRef.current;
    const start =
      el && typeof el.selectionStart === 'number' ? el.selectionStart : saved.start;
    const end = el && typeof el.selectionEnd === 'number' ? el.selectionEnd ?? start : saved.end;
    const sel = cur.slice(start, end);
    const next = `${cur.slice(0, start)}${before}${sel}${after}${cur.slice(end)}`;
    onChange?.(next);
    requestAnimationFrame(() => {
      try {
        el?.focus();
        if (!el) return;
        if (typeof selectRange === 'function') {
          const range = selectRange({ start, end, sel, before, after, next });
          if (range) {
            el.setSelectionRange(range.start, range.end);
            return;
          }
        }
        const pos = start + before.length + sel.length + after.length;
        el.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  };

  const insertMention = (label) => {
    if (disabled) return;
    const el = inputRef.current;
    const cur = value ?? '';
    if (el && typeof el.selectionStart === 'number') {
      const cursor = el.selectionStart;
      const head = cur.slice(0, cursor);
      const tail = cur.slice(cursor);
      const match = head.match(/(^|\s)@([^\s@]*)$/);
      if (match) {
        const token = match[0];
        const prefix = head.slice(0, head.length - token.length);
        const spacer = token.startsWith(' ') ? ' ' : '';
        const next = `${prefix}${spacer}@${label} ${tail}`;
        onChange?.(next);
      } else {
        const next = `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}@${label} `;
        onChange?.(next);
      }
    } else {
      const next = `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}@${label} `;
      onChange?.(next);
    }
    setShowMentionMenu(false);
    setMentionQuery('');
    requestAnimationFrame(() => {
      try {
        inputRef.current?.focus();
      } catch {
        /* ignore */
      }
    });
  };

  const fmt = (kind) => {
    onRichAction?.(kind);
    if (kind === 'bold') insertWrap('**', '**');
    else if (kind === 'italic') insertWrap('*', '*');
    else if (kind === 'code') insertWrap('`', '`');
    else if (kind === 'mention') {
      if (safeMentionItems.length > 0) {
        setShowPlusMenu(false);
        setMentionQuery('');
        setShowMentionMenu((prev) => !prev);
      } else {
        insertWrap('@');
      }
    }     else if (kind === 'link') {
      insertWrap('[', '](url)', ({ start, sel, before }) => {
        const urlStart = start + before.length + sel.length + 2;
        return { start: urlStart, end: urlStart + 3 };
      });
    }
  };

  const defaultWrapper = isDarkMode
    ? 'shrink-0 border-t border-slate-800 bg-slate-900/60 p-3.5'
    : 'shrink-0 border-t border-slate-200 bg-white p-3.5';
  const richToolbarDivider = isDarkMode ? 'border-b border-white/[0.06]' : 'border-b border-slate-200';
  const fmtBtn = isDarkMode
    ? 'rounded-md p-2 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-40'
    : 'rounded-md p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40';
  const composerInner = flatInner
    ? 'relative flex flex-col gap-1.5'
    : isDarkMode
      ? 'relative flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-[#171B24] px-2.5 py-2 shadow-inner'
      : 'relative flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-inner';
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
    ? `scrollbar-composer max-h-40 flex-1 resize-none overflow-y-auto overflow-x-hidden bg-transparent px-2 pr-1 text-sm text-white outline-none placeholder:text-gray-500 disabled:opacity-60 ${
        richToolbar
          ? 'min-h-[36px] py-1.5 leading-normal'
          : 'min-h-[44px] py-2 leading-relaxed'
      }`
    : `scrollbar-composer max-h-40 flex-1 resize-none overflow-y-auto overflow-x-hidden bg-transparent px-2 pr-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 ${
        richToolbar
          ? 'min-h-[36px] py-1.5 leading-normal'
          : 'min-h-[44px] py-2 leading-relaxed'
      }`;
  const inputClass = isDarkMode
    ? 'h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-gray-500 disabled:opacity-60'
    : 'h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60';

  const handleInputChange = (nextRaw) => {
    const nextValue = singleLine ? String(nextRaw).replace(/[\r\n]+/g, ' ') : nextRaw;
    onChange?.(nextValue);
    if (!safeMentionItems.length) return;
    const el = inputRef.current;
    const cursor =
      el && typeof el.selectionStart === 'number' ? el.selectionStart : nextValue.length;
    const head = nextValue.slice(0, cursor);
    const match = head.match(/(?:^|\s)@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[1] || '');
      setShowPlusMenu(false);
      setShowMentionMenu(true);
    } else if (showMentionMenu) {
      setShowMentionMenu(false);
      setMentionQuery('');
    }
  };

  const handleInputKeyDown = (event) => {
    if (showMentionMenu && filteredMentionItems.length > 0 && event.key === 'Enter') {
      event.preventDefault();
      insertMention(filteredMentionItems[0].label);
      return;
    }
    if (event.key === 'Enter' && (!singleLine ? !event.shiftKey : true)) {
      event.preventDefault();
      handleSend();
    }
  };
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
              ref={k === 'mention' ? mentionButtonRef : undefined}
              onMouseDown={(event) => {
                event.preventDefault();
                syncSelection();
              }}
              onClick={() => fmt(k)}
              className={fmtBtn}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </button>
          ))}
        </div>
      )}
      <div className={composerInner}>
        {showMentionMenu && safeMentionItems.length > 0 && (
          <div
            ref={mentionMenuRef}
            className={isDarkMode
              ? 'absolute bottom-[52px] right-0 z-30 w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl'
              : 'absolute bottom-[52px] right-0 z-30 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl'}
          >
            <div className={`border-b px-3 py-2 text-xs font-semibold uppercase ${isDarkMode ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
              Gợi ý thành viên
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredMentionItems.map((item) => (
                <button
                  key={String(item.value || item.label)}
                  type="button"
                  onClick={() => insertMention(item.label)}
                  className={isDarkMode
                    ? 'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white transition hover:bg-slate-800/80'
                    : 'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-800 transition hover:bg-slate-100'}
                >
                  <UserAvatar avatar={item.avatar} name={item.label} size="chip" />
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={`flex gap-2 ${singleLine || richToolbar ? 'items-center' : 'items-end'}`}>
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


        {singleLine ? (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={inputClass}
            autoComplete="off"
          />
        ) : (
          <textarea
            ref={inputRef}
            value={value}
            rows={1}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className={textareaClass}
          />
        )}


        <div
          className={`flex shrink-0 ${
            showSendButton ? 'flex-col items-end gap-2' : 'items-center'
          }`}
        >
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
          {showSendButton && (
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled || sendDisabled}
              className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-cyan-900/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendLabel}
            </button>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

export default UnifiedChatComposer;
