import { useEffect, useMemo, useState } from 'react';
import ForwardMessagePreview from '../Chat/ForwardMessagePreview';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchBar } from '../../features/search';

/**
 * Chuyển tiếp tin DM tới một hoặc nhiều bạn bè.
 */
export default function ForwardToFriendModal({
  isOpen,
  onClose,
  friends = [],
  /** Ẩn bạn đang chat (tránh chuyển trùng cuộc hiện tại) */
  excludeFriendId = null,
  previewText = '',
  /** Tin gốc — render xem trước ảnh/tệp thay vì URL thô */
  previewMessage = null,
  loading = false,
  /** Chỉ khóa nút Gửi (không ẩn danh sách) */
  submitting = false,
  onConfirm,
}) {
  const { t } = useAppStrings();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [note, setNote] = useState('');

  const rows = useMemo(() => {
    const ex = excludeFriendId != null ? String(excludeFriendId) : null;
    return friends.filter((f) => {
      const id = String(f.id ?? f._id ?? '');
      if (ex && id === ex) return false;
      return true;
    });
  }, [friends, excludeFriendId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((f) => String(f.name || '').toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setNote('');
    setSelected({});
  }, [isOpen]);

  const toggle = (id) => {
    const key = String(id);
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const handleSend = () => {
    if (!selectedIds.length) return;
    onConfirm?.({ friendIds: selectedIds, note: note.trim() });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('friendChat.forwardModalTitle')}
      size="md"
      layerClassName="z-[320]"
    >
      <p className="mb-3 text-sm text-gray-400">
        Chọn người nhận tin chuyển tiếp (có thể chọn nhiều người).
      </p>

      <PageSearchBar
        className="mb-3"
        value={search}
        onChange={setSearch}
        placeholder={t('friendChat.searchFriendsPlaceholder')}
        isDarkMode
        size="sm"
        id="forward-friend-search"
      />

      <div className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-black/20">
        {loading && (
          <div className="p-4 text-center text-sm text-gray-400">Đang tải…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">Không có bạn phù hợp.</div>
        )}
        {!loading &&
          filtered.map((f, idx) => {
            const rawId = f.id ?? f._id;
            const idStr = rawId != null && rawId !== '' ? String(rawId) : '';
            const rowKey = f.listKey ?? (idStr || `fwd-friend-${idx}`);
            return (
              <label
                key={rowKey}
                className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0 hover:bg-white/5"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
                  {f.avatar || '👤'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-white">{f.name || 'Bạn bè'}</div>
                </div>
                <input
                  type="checkbox"
                  checked={idStr ? !!selected[idStr] : false}
                  onChange={() => idStr && toggle(idStr)}
                  disabled={!idStr}
                  className="h-4 w-4 rounded border-gray-500 disabled:opacity-40"
                />
              </label>
            );
          })}
      </div>

      <div className="mb-3 rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-sm text-gray-300">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Xem trước</div>
        {previewMessage ? (
          <ForwardMessagePreview message={previewMessage} t={t} />
        ) : (
          <p className="line-clamp-4 whitespace-pre-wrap break-words">{previewText || '—'}</p>
        )}
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-gray-500">Thêm lời nhắn (không bắt buộc)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Thêm lời nhắn…"
          className="w-full rounded-xl border border-white/10 bg-[#040f2a] px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600"
        />
      </div>

      <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/5"
        >
          Huỷ
        </button>
        <button
          type="button"
          disabled={!selectedIds.length || loading || submitting}
          onClick={handleSend}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Đang gửi…' : '✈️ Gửi'}
        </button>
      </div>
    </Modal>
  );
}
