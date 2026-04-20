import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

const DEFAULT_STORAGE_KEY = 'vh_org_recent_reactions';

const DEFAULT_RECENT = ['👍', '❤️', '😂'];

function loadRecent(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [...DEFAULT_RECENT];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_RECENT];
    const emojis = parsed.filter((e) => typeof e === 'string' && e.length <= 8).slice(0, 3);
    return emojis.length ? emojis : [...DEFAULT_RECENT];
  } catch {
    return [...DEFAULT_RECENT];
  }
}

function saveRecent(storageKey, list) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 3)));
  } catch {
    /* ignore */
  }
}

const QUICK_PICK = ['😀', '😂', '❤️', '👍', '🔥', '✨', '🎉', '🙏', '👀', '💀'];

/**
 * Thanh công cụ khi hover tin nhắn kênh (Discord-like).
 */
export default function ChannelMessageToolbar({
  isMine,
  /** true = nút giữa là chỉnh sửa; false = trả lời */
  showEdit,
  onQuickReact,
  onOpenEmojiPicker,
  onMiddleAction,
  onForward,
  onMore,
  disabled = false,
  /** Tách lịch sử emoji kênh vs DM */
  recentReactionsStorageKey = DEFAULT_STORAGE_KEY,
}) {
  const { isDarkMode } = useTheme();
  const [recent, setRecent] = useState(() => loadRecent(recentReactionsStorageKey));
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    setRecent(loadRecent(recentReactionsStorageKey));
  }, [recentReactionsStorageKey]);

  const pushRecent = useCallback(
    (emoji) => {
      setRecent((prev) => {
        const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 3);
        saveRecent(recentReactionsStorageKey, next);
        return next;
      });
    },
    [recentReactionsStorageKey]
  );

  const recentSlots = useMemo(() => {
    const r = [...recent];
    while (r.length < 3) r.push(DEFAULT_RECENT[r.length % DEFAULT_RECENT.length]);
    return r.slice(0, 3);
  }, [recent]);

  const bar = isDarkMode
    ? 'pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/15 bg-[#2b2d31] px-1.5 py-1 shadow-lg'
    : 'pointer-events-auto flex items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-md';
  const sep = isDarkMode ? 'border-r border-white/10' : 'border-r border-slate-200';
  const iconBtn = isDarkMode
    ? 'flex h-8 w-8 items-center justify-center rounded-md text-slate-200 transition hover:bg-white/10'
    : 'flex h-8 w-8 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100';
  const emojiPanel = isDarkMode
    ? 'absolute bottom-full right-0 z-[70] mb-1 grid max-h-48 w-44 grid-cols-5 gap-1 rounded-xl border border-white/15 bg-[#1e1f22] p-2 shadow-xl'
    : 'absolute bottom-full right-0 z-[70] mb-1 grid max-h-48 w-44 grid-cols-5 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl';

  return (
    <div className={bar} onClick={(e) => e.stopPropagation()}>
      <div className={`flex items-center gap-0.5 pr-1.5 ${sep}`}>
        {recentSlots.map((em) => (
          <button
            key={em}
            type="button"
            title={em}
            disabled={disabled}
            onClick={() => {
              pushRecent(em);
              onQuickReact?.(em);
            }}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-lg transition disabled:opacity-40 ${
              isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'
            }`}
          >
            {em}
          </button>
        ))}
      </div>

      <div className="relative flex items-center gap-0.5 pl-0.5">
        <button
          type="button"
          title="Thêm biểu cảm"
          disabled={disabled}
          onClick={() => setEmojiOpen((v) => !v)}
          className={iconBtn}
        >
          🙂
        </button>
        {emojiOpen && (
          <>
            <button
              type="button"
              aria-label="Đóng"
              className="fixed inset-0 z-[60] cursor-default bg-transparent"
              onClick={() => setEmojiOpen(false)}
            />
            <div className={emojiPanel}>
              {QUICK_PICK.map((em) => (
                <button
                  key={em}
                  type="button"
                  className={`flex h-9 items-center justify-center rounded-lg text-lg ${
                    isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    pushRecent(em);
                    onQuickReact?.(em);
                    onOpenEmojiPicker?.(em);
                    setEmojiOpen(false);
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          title={showEdit ? 'Chỉnh sửa' : 'Trả lời'}
          disabled={disabled}
          onClick={() => onMiddleAction?.()}
          className={iconBtn}
        >
          {showEdit ? '✏️' : '↩️'}
        </button>

        <button
          type="button"
          title="Chuyển tiếp"
          disabled={disabled}
          onClick={() => onForward?.()}
          className={iconBtn}
        >
          ↪️
        </button>

        <button
          type="button"
          title="Những mục khác"
          disabled={disabled}
          onClick={(e) => onMore?.(e)}
          className={iconBtn}
        >
          ⋯
        </button>
      </div>
    </div>
  );
}
