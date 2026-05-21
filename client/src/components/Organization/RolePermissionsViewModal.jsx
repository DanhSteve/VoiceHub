import { Modal } from '../Shared';
import {
  normalizeRoleDisplayName,
  resolveRoleTier,
  TIER_META,
} from './roleRbacUtils';

function tierLabel(role) {
  const meta = TIER_META.find((t) => t.id === resolveRoleTier(role));
  return meta?.title || 'Team';
}

function tierHint(role) {
  const meta = TIER_META.find((t) => t.id === resolveRoleTier(role));
  return meta?.hint || '';
}

function scopeTagsFromRoleName(name) {
  const raw = String(name || '').toLowerCase();
  const tags = [];
  if (/div_[a-f0-9]{6}/.test(raw)) tags.push('Khối (division)');
  if (/dep_[a-f0-9]{6}/.test(raw)) tags.push('Phòng ban (department)');
  if (/team_[a-f0-9]{6}/.test(raw)) tags.push('Team');
  return tags;
}

export default function RolePermissionsViewModal({ role, isOpen, onClose, onEdit }) {
  if (!role) return null;

  const displayName = normalizeRoleDisplayName(role.name);
  const scopeTags = scopeTagsFromRoleName(role.name);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Vai trò: ${displayName}`} size="md">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 font-medium text-violet-200">
            {tierLabel(role)}
          </span>
          {tierHint(role) ? <span className="text-gray-400">{tierHint(role)}</span> : null}
        </div>

        {scopeTags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {scopeTags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-4 text-sm leading-relaxed text-cyan-100/90">
          Quyền chat và voice được cấu hình <strong className="font-semibold text-white">riêng từng kênh</strong>,
          không gán tại đây. Ví dụ: gán vai trò cho kênh chat chung của Phòng Dev — thành viên sẽ thấy kênh đó
          và mục Phòng Dev trên sidebar. Mở bánh răng trên kênh → thêm vai trò này và bật quyền (Xem, Đọc, Gửi,
          Voice…).
        </p>

        <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-600 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-white/5"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={() => {
              onClose?.();
              onEdit?.(role);
            }}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
          >
            Chỉnh sửa vai trò
          </button>
        </div>
      </div>
    </Modal>
  );
}
