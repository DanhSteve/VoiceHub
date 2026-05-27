import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { shellNavRailBackdrop } from '../../theme/shellTheme';

/**
 * Chỉnh sửa tin nhắn trực tiếp trên dòng (Discord-like).
 */
export default function OrgMessageInlineEditor({
  value,
  onChange,
  onSave,
  onCancel,
  isDarkMode = true,
  saving = false,
  escapeHint = 'nhấn escape để',
  enterHint = 'nhấn enter để',
  cancelLabel = 'hủy',
  saveLabel = 'lưu',
}) {
  const inputRef = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const len = String(value || '').length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }, []);

  const linkCls = isDarkMode
    ? 'font-medium text-[#8BA3F5] hover:text-[#A8B8F8] hover:underline'
    : 'font-medium text-[#4F6BED] hover:text-[#3D58D4] hover:underline';

  const boxCls = isDarkMode
    ? 'border border-white/[0.08] bg-[#2b2d31]'
    : 'border border-slate-200 bg-slate-100';

  const inputCls = isDarkMode
    ? 'text-[#dcddde] placeholder:text-[#6d7380]'
    : 'text-slate-900 placeholder:text-slate-400';

  const hintCls = isDarkMode ? 'text-[#949ba4]' : 'text-slate-500';

  const iconBtnCls = isDarkMode
    ? 'text-[#b5bac1] hover:bg-white/10 hover:text-white'
    : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800';

  const emojiPanelCls = isDarkMode
    ? 'border border-white/10 bg-[#1e1f22] shadow-xl'
    : 'border border-slate-200 bg-white shadow-lg';

  return (
    <div className="w-full min-w-0 space-y-1">
      <div className={`relative flex items-end gap-1 rounded-lg px-2 py-1 ${boxCls}`}>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!saving) onSave?.();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel?.();
            }
          }}
          rows={1}
          disabled={saving}
          className={`max-h-40 min-h-[34px] flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed outline-none ${inputCls}`}
          aria-label="Chỉnh sửa tin nhắn"
        />
        <div className="relative shrink-0 self-end pb-1">
          <button
            type="button"
            title="Emoji"
            disabled={saving}
            onClick={() => setEmojiOpen((v) => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition ${iconBtnCls} disabled:opacity-40`}
          >
            <Smile className="h-4 w-4" strokeWidth={2} />
          </button>
          {emojiOpen && (
            <>
              <button
                type="button"
                aria-label="Đóng emoji"
                className={`${shellNavRailBackdrop} z-[60] cursor-default bg-transparent`}
                onClick={() => setEmojiOpen(false)}
              />
              <div
                className={`absolute bottom-full right-0 z-[70] mb-1 grid max-h-36 w-52 grid-cols-8 gap-0.5 overflow-y-auto rounded-lg p-1.5 ${emojiPanelCls}`}
              >
                {COMPOSER_EMOJI_LIST.slice(0, 48).map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`flex h-8 items-center justify-center rounded text-lg ${
                      isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                    }`}
                    onClick={() => {
                      onChange(`${value || ''}${em}`);
                      setEmojiOpen(false);
                      inputRef.current?.focus();
                    }}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className={`text-[11px] leading-snug ${hintCls}`}>
        {escapeHint}{' '}
        <button type="button" className={linkCls} onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </button>
        <span className="mx-1 opacity-60">·</span>
        {enterHint}{' '}
        <button type="button" className={linkCls} onClick={onSave} disabled={saving}>
          {saving ? '…' : saveLabel}
        </button>
      </p>
    </div>
  );
}
