import { Modal } from '../Shared';
import {
  ACTION_LABEL,
  PERMISSION_EDITOR_OPTIONS,
  normalizePermissionEntries,
  normalizeRoleDisplayName,
  summarizePermissions,
  resolveRoleTier,
  TIER_META,
} from './roleRbacUtils';

function tierLabel(role) {
  const meta = TIER_META.find((t) => t.id === resolveRoleTier(role));
  return meta?.title || 'Team';
}

export default function RolePermissionsViewModal({ role, isOpen, onClose, onEdit }) {
  if (!role) return null;

  const normalized = normalizePermissionEntries(role.permissions);
  const displayName = normalizeRoleDisplayName(role.name);
  const summary = summarizePermissions(role.permissions);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Quyền: ${displayName}`} size="md">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 font-medium text-violet-200">
            {tierLabel(role)}
          </span>
          <span className="text-gray-400">
            {normalized.length
              ? `${normalized.length} nhóm quyền${summary.length > 72 ? '' : ` · ${summary}`}`
              : 'Chưa gán quyền'}
          </span>
        </div>

        {normalized.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-8 text-center text-sm text-gray-400">
            Vai trò này chưa có quyền. Bấm &quot;Chỉnh sửa vai trò&quot; để thêm quyền.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {normalized.map((p) => {
              const group = PERMISSION_EDITOR_OPTIONS.find((x) => x.resource === p.resource);
              return (
                <div
                  key={p.resource}
                  className="rounded-xl border border-slate-700/80 bg-[#040f2a] p-4"
                >
                  <div className="mb-2 text-sm font-semibold text-white">
                    {group?.label || p.resource}
                  </div>
                  <ul className="flex flex-wrap gap-1.5">
                    {p.actions.map((action) => (
                      <li
                        key={action}
                        className="rounded-lg bg-slate-800/90 px-2.5 py-1 text-xs font-medium text-cyan-200/90"
                      >
                        {ACTION_LABEL[action] || action}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

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
