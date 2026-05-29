import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { taskAPI } from '../../services/api/taskAPI';

export default function TaskBoardCardActionsMenu({
  isOpen,
  anchorRect,
  isDarkMode,
  card,
  lists = [],
  currentBoardId = '',
  workspaceSlug = '',
  onClose,
  onOpenCard,
  onRefresh,
}) {
  const boardApiOpts = workspaceSlug ? { workspaceSlug } : {};
  const [view, setView] = useState('menu');
  const [moveListId, setMoveListId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cardId = card?._id ? String(card._id) : '';
  const otherLists = useMemo(
    () => lists.filter((l) => String(l._id) !== String(card?.listId || '')),
    [lists, card?.listId]
  );

  useEffect(() => {
    if (!isOpen) return;
    setView('menu');
    setMoveListId(otherLists[0]?._id ? String(otherLists[0]._id) : '');
  }, [isOpen, cardId, otherLists]);

  if (!isOpen || !anchorRect || !cardId) return null;

  const shell = isDarkMode
    ? 'border-white/10 bg-[#2b2f38] text-slate-100 shadow-2xl'
    : 'border-slate-200 bg-white text-slate-900 shadow-xl';
  const itemBtn = isDarkMode
    ? 'w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/10'
    : 'w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-100';

  const run = async (fn) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fn();
      await onRefresh?.();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Thao tác thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  const menuStyle = {
    position: 'fixed',
    top: Math.min(anchorRect.bottom + 6, window.innerHeight - 380),
    left: Math.min(anchorRect.left, window.innerWidth - 280),
    zIndex: 10060,
    width: 260,
  };

  const header = (title, onBack) => (
    <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
      <button
        type="button"
        onClick={onBack}
        className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
        aria-label="Quay lại"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{title}</div>
      <button
        type="button"
        onClick={onClose}
        className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
        aria-label="Đóng"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const body =
    view === 'move' ? (
      <>
        {header('Di chuyển', () => setView('menu'))}
        <select
          value={moveListId}
          onChange={(e) => setMoveListId(e.target.value)}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        >
          {otherLists.map((l) => (
            <option key={l._id} value={String(l._id)}>
              {l.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!moveListId || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.moveBoardCard(cardId, { toListId: moveListId }, boardApiOpts);
              toast.success('Đã di chuyển thẻ');
            })
          }
          className="w-full rounded-lg bg-[#0c66e4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Di chuyển
        </button>
      </>
    ) : (
      <>
        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-sm font-semibold">Thao tác thẻ</span>
          <button
            type="button"
            onClick={onClose}
            className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            className={itemBtn}
            onClick={() => {
              onOpenCard?.(card, 'detail');
              onClose?.();
            }}
          >
            Mở thẻ
          </button>
          <button
            type="button"
            className={itemBtn}
            onClick={() => {
              onOpenCard?.(card, 'labels');
              onClose?.();
            }}
          >
            Chỉnh sửa nhãn
          </button>
          <button
            type="button"
            className={itemBtn}
            onClick={() => {
              onOpenCard?.(card, 'members');
              onClose?.();
            }}
          >
            Thay đổi thành viên
          </button>
          <button
            type="button"
            className={itemBtn}
            onClick={() => {
              onOpenCard?.(card, 'dates');
              onClose?.();
            }}
          >
            Chỉnh sửa ngày
          </button>
          <button
            type="button"
            className={itemBtn}
            disabled={otherLists.length === 0}
            onClick={() => setView('move')}
          >
            Di chuyển
          </button>
          <button
            type="button"
            className={itemBtn}
            disabled={submitting}
            onClick={() =>
              run(async () => {
                await taskAPI.copyBoardCard(
                  cardId,
                  { toListId: String(card.listId || '') },
                  boardApiOpts
                );
                toast.success('Đã sao chép thẻ');
              })
            }
          >
            Sao chép thẻ
          </button>
          <div className={`my-2 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`} />
          <button
            type="button"
            className={`${itemBtn} text-red-400`}
            disabled={submitting}
            onClick={() =>
              run(async () => {
                await taskAPI.archiveBoardCard(cardId, boardApiOpts);
                toast.success('Đã lưu trữ thẻ');
              })
            }
          >
            Lưu trữ
          </button>
        </div>
      </>
    );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10055]" onClick={onClose} aria-hidden />
      <div className={`rounded-xl border p-3 ${shell}`} style={menuStyle} role="dialog">
        {body}
      </div>
    </>,
    document.body
  );
}
