import { useEffect, useMemo, useState } from 'react';
import { Modal } from '../Shared';

const BACKGROUND_PRESETS = [
  'linear-gradient(135deg,#1f2937,#111827)',
  'linear-gradient(135deg,#7c2d12,#1f2937)',
  'linear-gradient(135deg,#0f766e,#1e293b)',
  'linear-gradient(135deg,#312e81,#1e1b4b)',
  'linear-gradient(135deg,#7e22ce,#1f2937)',
];

export default function CreateTaskBoardModal({
  isOpen,
  onClose,
  onSubmit,
  creating = false,
  defaultTeamName = '',
  defaultScopeLabel = '',
}) {
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [background, setBackground] = useState(BACKGROUND_PRESETS[0]);
  const [customBackground, setCustomBackground] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setVisibility('private');
    setBackground(BACKGROUND_PRESETS[0]);
    setCustomBackground('');
  }, [isOpen]);

  const backgroundValue = useMemo(() => {
    const custom = String(customBackground || '').trim();
    return custom || background;
  }, [background, customBackground]);

  const canSubmit = String(title || '').trim().length > 0 && !creating;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Tạo Task Board" size="md">
      <div className="space-y-4">
        <div className="text-xs text-slate-400">
          Phạm vi: <span className="text-slate-200">{defaultScopeLabel || defaultTeamName || '—'}</span>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">Tiêu đề board *</div>
          <input
            value={title}
            maxLength={180}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            placeholder="Nhập tiêu đề board"
          />
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-white">Phông nền</div>
          <div className="grid grid-cols-5 gap-2">
            {BACKGROUND_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setBackground(preset);
                  setCustomBackground('');
                }}
                className={`h-10 rounded-md border ${
                  background === preset && !customBackground ? 'border-indigo-400' : 'border-white/10'
                }`}
                style={{ background: preset }}
              />
            ))}
          </div>
          <input
            value={customBackground}
            onChange={(e) => setCustomBackground(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white outline-none"
            placeholder="Nhập CSS background (tùy chọn)"
          />
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold text-white">Quyền xem</div>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="private">Riêng tư</option>
            <option value="workspace">Không gian làm việc</option>
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={creating}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit?.({
                title: String(title || '').trim(),
                background: backgroundValue,
                visibility,
              })
            }
            className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {creating ? 'Đang tạo...' : 'Tạo Task Board'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
