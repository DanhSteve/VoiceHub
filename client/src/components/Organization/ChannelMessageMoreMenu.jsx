import { createPortal } from 'react-dom';

const MENU_WIDTH = 256;
const EST_MENU_HEIGHT = 380;

function computeMenuPosition(anchorRect) {
  const pad = 8;
  let left = Math.min(anchorRect.left, window.innerWidth - MENU_WIDTH - pad);
  if (left < pad) left = pad;

  let top = anchorRect.bottom + 6;
  if (top + EST_MENU_HEIGHT > window.innerHeight - pad) {
    top = anchorRect.top - EST_MENU_HEIGHT - 6;
  }
  if (top < pad) top = pad;
  if (top + EST_MENU_HEIGHT > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - EST_MENU_HEIGHT - pad);
  }
  return { left, top };
}

/**
 * Menu ngữ cảnh tin nhắn (mục "⋯" / chuột phải).
 */
export default function ChannelMessageMoreMenu({
  open,
  anchorRect,
  onClose,
  isMine,
  onCopyText,
  onReply,
  onForward,
  onEdit,
  onDelete,
  /** Tin nhắn văn bản — cho phép sao chép */
  canCopy,
  /** Tạo task bằng AI */
  onCreateTask,
  createTaskDisabled = false,
  /** Hiển thị khi hover (đặc biệt khi disabled) */
  createTaskHoverTitle = '',
}) {
  if (!open || !anchorRect) return null;

  const { left, top } = computeMenuPosition(anchorRect);

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Đóng menu"
        className="fixed inset-0 z-[80] cursor-default bg-black/20"
        onClick={onClose}
      />
      <div
        className="fixed z-[90] w-64 overflow-hidden rounded-xl border border-white/12 bg-[#2b2d31] py-1 text-sm shadow-2xl"
        style={{ left, top, maxHeight: 'min(70vh, 420px)' }}
        role="menu"
      >
        {canCopy && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-slate-100 hover:bg-white/8"
            onClick={() => {
              onCopyText?.();
              onClose();
            }}
          >
            Sao chép tin nhắn
            <span className="text-slate-400">📋</span>
          </button>
        )}
        {!isMine && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-slate-100 hover:bg-white/8"
            onClick={() => {
              onReply?.();
              onClose();
            }}
          >
            Trả lời
            <span className="text-slate-400">↩️</span>
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-slate-100 hover:bg-white/8"
          onClick={() => {
            onForward?.();
            onClose();
          }}
        >
          Chuyển tiếp
          <span className="text-slate-400">↪️</span>
        </button>
        {typeof onCreateTask === 'function' && (
          <button
            type="button"
            role="menuitem"
            disabled={createTaskDisabled}
            title={createTaskHoverTitle || 'Phân tích tin nhắn và gợi ý task (AI)'}
            className={`flex w-full items-center justify-between px-3 py-2.5 text-left ${
              createTaskDisabled
                ? 'cursor-not-allowed text-slate-500'
                : 'text-slate-100 hover:bg-white/8'
            }`}
            onClick={() => {
              if (createTaskDisabled) return;
              onCreateTask();
              onClose();
            }}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0">✅</span>
              <span className="truncate">Tạo task (AI)</span>
            </span>
            <span className="text-slate-400">🤖</span>
          </button>
        )}
        {isMine && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-slate-100 hover:bg-white/8"
            onClick={() => {
              onEdit?.();
              onClose();
            }}
          >
            Chỉnh sửa tin nhắn
            <span className="text-slate-400">✏️</span>
          </button>
        )}
        <div className="my-1 h-px bg-white/10" />
        {isMine && (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-rose-300 hover:bg-rose-500/15"
            onClick={() => {
              onDelete?.();
              onClose();
            }}
          >
            Xoá tin nhắn
            <span>🗑️</span>
          </button>
        )}
      </div>
    </>,
    document.body
  );
}
