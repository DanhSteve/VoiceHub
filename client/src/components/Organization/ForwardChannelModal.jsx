import { useEffect, useMemo, useState } from 'react';
import { useLocale } from '../../context/LocaleContext';
import { channelNameToDisplaySlug, displayDepartmentName } from '../../utils/orgEntityDisplay';
import { Modal } from '../Shared';

/**
 * Chuyển tiếp tin tới một hoặc nhiều kênh chat (theo phòng ban).
 * `targets`: mỗi phòng ban có danh sách kênh chat (không voice).
 */
export default function ForwardChannelModal({
  isOpen,
  onClose,
  organizationName = '',
  targets = [],
  /** { channelId: true } */
  initialSelected = {},
  previewText = '',
  loading = false,
  onConfirm,
}) {
  const { locale } = useLocale();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => ({ ...initialSelected }));
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setNote('');
    setSelected({});
  }, [isOpen]);

  const flatRows = useMemo(() => {
    const rows = [];
    for (const dept of targets) {
      const chans = Array.isArray(dept.channels) ? dept.channels : [];
      for (const ch of chans) {
        if (ch.type === 'voice') continue;
        rows.push({
          key: `${dept.departmentId}:${ch._id}`,
          departmentId: dept.departmentId,
          departmentName: displayDepartmentName(dept.departmentName, locale),
          channelId: String(ch._id),
          channelName: channelNameToDisplaySlug(ch.name || 'chat', locale),
        });
      }
    }
    return rows;
  }, [targets, locale]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flatRows;
    return flatRows.filter(
      (r) =>
        r.channelName.toLowerCase().includes(q) ||
        r.departmentName.toLowerCase().includes(q)
    );
  }, [flatRows, search]);

  const toggle = (channelId) => {
    const id = String(channelId);
    setSelected((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const handleSend = () => {
    if (!selectedIds.length) return;
    onConfirm?.({ channelIds: selectedIds, note: note.trim() });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Chuyển tiếp tới" size="md">
      <p className="mb-3 text-sm text-gray-400">
        Chọn nơi bạn muốn chia sẻ tin nhắn này
        {organizationName ? ` trong ${organizationName}` : ''}.
      </p>

      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm"
          className="w-full rounded-xl border border-indigo-500/40 bg-[#040f2a] py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-gray-500"
        />
      </div>

      <div className="mb-3 max-h-52 overflow-y-auto rounded-xl border border-white/10 bg-black/20">
        {loading && (
          <div className="p-4 text-center text-sm text-gray-400">Đang tải kênh…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">Không có kênh phù hợp.</div>
        )}
        {!loading &&
          filtered.map((row) => (
            <label
              key={row.key}
              className="flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0 hover:bg-white/5"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-lg">
                #
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-white"># {row.channelName}</div>
                <div className="truncate text-xs text-gray-500">{row.departmentName}</div>
              </div>
              <input
                type="checkbox"
                checked={!!selected[row.channelId]}
                onChange={() => toggle(row.channelId)}
                className="h-4 w-4 rounded border-gray-500"
              />
            </label>
          ))}
      </div>

      <div className="mb-3 rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-sm text-gray-300">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Xem trước</div>
        <p className="line-clamp-4 whitespace-pre-wrap break-words">{previewText || '—'}</p>
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs text-gray-500">Thêm một tin nhắn không bắt buộc…</label>
        <div className="relative">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Thêm một tin nhắn không bắt buộc…"
            className="w-full rounded-xl border border-white/10 bg-[#040f2a] px-3 py-2.5 pr-10 text-sm text-white outline-none placeholder:text-gray-600"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">🙂</span>
        </div>
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
          disabled={!selectedIds.length || loading}
          onClick={handleSend}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✈️ Gửi
        </button>
      </div>
    </Modal>
  );
}
