import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowLeft, Eye, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { taskAPI, unwrapTaskBoardDetailPayload } from '../../services/api/taskAPI';

export default function TaskBoardListActionsMenu({
  isOpen,
  anchorRect,
  isDarkMode,
  workspaceSlug = '',
  list,
  lists = [],
  boards = [],
  currentBoardId = '',
  onClose,
  onOpenAddCard,
  onRefresh,
}) {
  const boardApiOpts = workspaceSlug ? { workspaceSlug } : {};
  const [view, setView] = useState('menu');
  const [copyTitle, setCopyTitle] = useState('');
  const [moveBoardId, setMoveBoardId] = useState('');
  const [movePosition, setMovePosition] = useState(1);
  const [targetListCount, setTargetListCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState('');

  const listId = list?._id ? String(list._id) : '';
  const listTitle = String(list?.title || '').trim();
  const cardCount =
    typeof list?.cardCount === 'number'
      ? list.cardCount
      : Array.isArray(list?.cards)
        ? list.cards.length
        : 0;
  const hasCards = cardCount > 0;
  const activeListCount = lists.length;
  const rawBlockReason = String(list?.archiveBlockReason || '');
  const isLegacyDefaultBlock =
    rawBlockReason.includes('hệ thống mặc định') || rawBlockReason.includes('chỉ đổi tên');
  const canArchive = isLegacyDefaultBlock
    ? activeListCount > 1 && cardCount === 0
    : Boolean(list?.canArchive);
  const archiveBlockReason = isLegacyDefaultBlock
    ? activeListCount <= 1
      ? 'Board phải giữ ít nhất một danh sách'
      : cardCount > 0
        ? `Danh sách còn ${cardCount} thẻ — hãy chuyển hoặc xóa thẻ trước`
        : ''
    : rawBlockReason;
  const archiveNameOk = archiveConfirmText.trim() === listTitle && listTitle.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    setView('menu');
    setCopyTitle(String(list?.title || ''));
    setMoveBoardId(String(currentBoardId || ''));
    const idx = lists.findIndex((l) => String(l._id) === listId);
    setMovePosition(idx >= 0 ? idx + 1 : lists.length || 1);
    setArchiveConfirmText('');
  }, [isOpen, list, listId, lists, currentBoardId]);

  useEffect(() => {
    if (view !== 'move' || !moveBoardId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoardDetail(String(moveBoardId), boardApiOpts);
        const detail = unwrapTaskBoardDetailPayload(res);
        const n = Array.isArray(detail?.lists) ? detail.lists.length : 0;
        const onCurrent = String(moveBoardId) === String(currentBoardId);
        const maxPos = onCurrent ? Math.max(1, n) : Math.max(1, n + 1);
        if (!cancelled) {
          setTargetListCount(maxPos);
          setMovePosition((p) => Math.min(p, maxPos));
        }
      } catch {
        if (!cancelled) setTargetListCount(Math.max(1, lists.length));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, moveBoardId, currentBoardId, lists.length]);

  const positionOptions = useMemo(
    () => Array.from({ length: Math.max(1, targetListCount) }, (_, i) => i + 1),
    [targetListCount]
  );

  const otherLists = useMemo(
    () => lists.filter((l) => String(l._id) !== listId),
    [lists, listId]
  );

  if (!isOpen || !anchorRect || !listId) return null;

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
    top: Math.min(anchorRect.bottom + 6, window.innerHeight - 420),
    left: Math.min(anchorRect.left, window.innerWidth - 300),
    zIndex: 10050,
    width: 280,
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
    view === 'copy' ? (
      <>
        {header('Sao chép danh sách', () => setView('menu'))}
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Tên</label>
        <input
          value={copyTitle}
          onChange={(e) => setCopyTitle(e.target.value)}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        />
        <button
          type="button"
          disabled={!copyTitle.trim() || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.copyBoardList(
                currentBoardId,
                listId,
                { title: copyTitle.trim(), toBoardId: currentBoardId },
                boardApiOpts
              );
              toast.success('Đã sao chép danh sách');
            })
          }
          className="rounded-lg bg-[#0c66e4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Tạo danh sách
        </button>
      </>
    ) : view === 'move' ? (
      <>
        {header('Di chuyển danh sách', () => setView('menu'))}
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Bảng thông tin
        </label>
        <select
          value={moveBoardId}
          onChange={(e) => {
            setMoveBoardId(e.target.value);
            setMovePosition(1);
          }}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        >
          {boards.map((b) => (
            <option key={b._id} value={String(b._id)}>
              {b.title}
              {String(b._id) === String(currentBoardId) ? ' (hiện tại)' : ''}
            </option>
          ))}
        </select>
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Vị trí</label>
        <select
          value={movePosition}
          onChange={(e) => setMovePosition(Number(e.target.value))}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        >
          {positionOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!moveBoardId || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.moveBoardList(
                currentBoardId,
                listId,
                { toBoardId: moveBoardId, position: movePosition },
                boardApiOpts
              );
              toast.success('Đã di chuyển danh sách');
            })
          }
          className="rounded-lg bg-[#0c66e4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Di chuyển
        </button>
      </>
    ) : view === 'archive' ? (
      <>
        {header('Lưu trữ danh sách', () => setView('menu'))}
        <p className={`mb-3 text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Danh sách sẽ được lưu trữ (ẩn khỏi board). Chỉ lưu trữ được khi danh sách không còn thẻ.
        </p>
        <p className={`mb-2 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          Nhập đúng tên danh sách để xác nhận: <strong>{listTitle}</strong>
        </p>
        <input
          value={archiveConfirmText}
          onChange={(e) => setArchiveConfirmText(e.target.value)}
          placeholder={listTitle}
          autoFocus
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        />
        <button
          type="button"
          disabled={!archiveNameOk || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.archiveBoardList(currentBoardId, listId, boardApiOpts);
              toast.success('Đã lưu trữ danh sách');
            })
          }
          className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Lưu trữ danh sách
        </button>
      </>
    ) : view === 'moveAll' ? (
      <>
        {header('Di chuyển toàn bộ thẻ', () => setView('menu'))}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {otherLists.map((l) => (
            <button
              key={l._id}
              type="button"
              disabled={submitting}
              onClick={() =>
                run(async () => {
                  await taskAPI.moveAllBoardListCards(
                    currentBoardId,
                    listId,
                    { toListId: String(l._id) },
                    boardApiOpts
                  );
                  toast.success('Đã chuyển tất cả thẻ');
                })
              }
              className={`${itemBtn} disabled:opacity-50`}
            >
              {l.title}
            </button>
          ))}
        </div>
      </>
    ) : (
      <>
        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-sm font-semibold">Thao tác</span>
          <button type="button" onClick={onClose} className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            className={itemBtn}
            onClick={() => {
              onOpenAddCard?.();
              onClose?.();
            }}
          >
            Thêm thẻ
          </button>
          <button type="button" className={itemBtn} onClick={() => setView('copy')}>
            Sao chép danh sách
          </button>
          <button type="button" className={itemBtn} onClick={() => setView('move')}>
            Di chuyển danh sách
          </button>
          {hasCards ? (
            <button type="button" className={itemBtn} onClick={() => setView('moveAll')}>
              Di chuyển tất cả thẻ trong danh sách này
            </button>
          ) : null}
          <button
            type="button"
            className={`${itemBtn} flex items-center gap-2`}
            onClick={() =>
              run(async () => {
                if (list?.isWatching) {
                  await taskAPI.unwatchBoardList(currentBoardId, listId, boardApiOpts);
                  toast.success('Đã bỏ theo dõi danh sách');
                } else {
                  await taskAPI.watchBoardList(currentBoardId, listId, boardApiOpts);
                  toast.success('Đang theo dõi danh sách — bạn sẽ nhận thông báo khi có thẻ mới');
                }
              })
            }
          >
            <Eye className="h-4 w-4" />
            {list?.isWatching ? 'Bỏ theo dõi' : 'Theo dõi'}
            {list?.watcherCount > 0 ? (
              <span className={`ml-auto text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {list.watcherCount}
              </span>
            ) : null}
          </button>
          <div className={`my-2 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`} />
          <button
            type="button"
            disabled={!canArchive || submitting}
            title={!canArchive ? archiveBlockReason : 'Lưu trữ danh sách'}
            onClick={() => {
              if (!canArchive) return;
              setArchiveConfirmText('');
              setView('archive');
            }}
            className={`${itemBtn} flex items-center gap-2 text-red-500 disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <Archive className="h-4 w-4 shrink-0" />
            Lưu trữ danh sách
          </button>
          {!canArchive && archiveBlockReason ? (
            <p className={`px-3 pb-1 text-[11px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {archiveBlockReason}
            </p>
          ) : null}
        </div>
      </>
    );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10040]" onClick={onClose} aria-hidden />
      <div className={`rounded-xl border p-3 ${shell}`} style={menuStyle} role="dialog">
        {body}
      </div>
    </>,
    document.body
  );
}
