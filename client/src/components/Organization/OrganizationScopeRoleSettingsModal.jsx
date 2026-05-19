import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Plus, X } from 'lucide-react';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { displayDepartmentName } from '../../utils/orgEntityDisplay';
import { normalizeRoleDisplayName } from './roleRbacUtils';
import ChannelPermissionTriToggle from './ChannelPermissionTriToggle';
import {
  applyChannelPermissionToggle,
  defaultScopeRolePermissions,
  emptyChannelRolePermissions,
  roleAccentColor,
  scopePermissionGroups,
} from './channelRolePermissionDefs';

const unwrap = (payload) => payload?.data ?? payload;

export default function OrganizationScopeRoleSettingsModal({
  isOpen,
  onClose,
  organizationId,
  scopeType,
  scope,
  locale,
  isDarkMode,
  canManage = false,
  onSaved,
}) {
  const [orgRoles, setOrgRoles] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const scopeId = scope?._id ? String(scope._id) : '';
  const isDivision = scopeType === 'division';
  const isDepartment = scopeType === 'department';
  const isTeam = scopeType === 'team';
  const scopeLabel = isDivision
    ? String(scope?.name || 'Khối')
    : isTeam
      ? String(scope?.name || 'Team')
      : displayDepartmentName(scope?.name, locale);

  const permGroups = useMemo(() => scopePermissionGroups(), []);

  const loadData = useCallback(async () => {
    if (!organizationId || !scopeId || !scopeType) return;
    setLoading(true);
    try {
      const listApi = isDivision
        ? organizationAPI.listDivisionRoleAccess
        : isTeam
          ? organizationAPI.listTeamRoleAccess
          : organizationAPI.listDepartmentRoleAccess;
      const silent404 = { skipNotFoundToast: true };
      const [rolesRes, aclRes] = await Promise.all([
        roleAPI.getRolesByOrganization(organizationId),
        listApi(organizationId, scopeId, silent404),
      ]);
      const roleListRaw = unwrap(rolesRes);
      const roleList = Array.isArray(roleListRaw)
        ? roleListRaw
        : Array.isArray(roleListRaw?.data)
          ? roleListRaw.data
          : [];
      const aclBody = unwrap(aclRes);
      const aclData = aclBody?.data ?? aclBody;
      const entries = Array.isArray(aclData?.entries) ? aclData.entries : [];

      const roleById = new Map(
        roleList.map((r) => [
          String(r._id || r.id),
          { id: String(r._id || r.id), name: normalizeRoleDisplayName(r.name) },
        ])
      );

      const assignedRows = entries
        .map((entry) => {
          const rid = String(entry.roleId || '');
          const meta = roleById.get(rid);
          if (!meta) return null;
          return {
            ...meta,
            permissions: {
              ...emptyChannelRolePermissions(),
              canSee: Boolean(entry.permissions?.canSee),
              canRead: Boolean(entry.permissions?.canRead),
              canWrite: Boolean(entry.permissions?.canWrite),
              canDelete: Boolean(entry.permissions?.canDelete),
              canVoice: Boolean(entry.permissions?.canVoice),
            },
          };
        })
        .filter(Boolean);

      setOrgRoles([...roleById.values()]);
      setAssigned(assignedRows);
      setSelectedRoleId(assignedRows[0]?.id || '');
    } catch {
      toast.error('Không tải được quyền theo vai trò');
      setOrgRoles([]);
      setAssigned([]);
      setSelectedRoleId('');
    } finally {
      setLoading(false);
    }
  }, [organizationId, scopeId, scopeType, isDivision, isTeam]);

  useEffect(() => {
    if (!isOpen) return;
    setAddOpen(false);
    loadData();
  }, [isOpen, loadData]);

  const assignedIds = useMemo(() => new Set(assigned.map((r) => r.id)), [assigned]);
  const availableToAdd = useMemo(
    () => orgRoles.filter((r) => !assignedIds.has(r.id)),
    [orgRoles, assignedIds]
  );
  const selectedRole = assigned.find((r) => r.id === selectedRoleId) || assigned[0] || null;

  const setSelectedPerm = (key, allowed) => {
    if (!selectedRole?.id || !canManage) return;
    setAssigned((prev) =>
      prev.map((row) =>
        row.id === selectedRole.id
          ? { ...row, permissions: applyChannelPermissionToggle(row.permissions, key, allowed) }
          : row
      )
    );
  };

  const handleAddRole = (role) => {
    if (!role?.id || !canManage || assignedIds.has(role.id)) return;
    setAssigned((prev) => [
      ...prev,
      { id: role.id, name: role.name, permissions: defaultScopeRolePermissions() },
    ]);
    setSelectedRoleId(role.id);
    setAddOpen(false);
  };

  const handleRemoveSelectedRole = () => {
    if (!selectedRole?.id || !canManage) return;
    const next = assigned.filter((r) => r.id !== selectedRole.id);
    setAssigned(next);
    setSelectedRoleId(next[0]?.id || '');
  };

  const handleSave = async () => {
    if (!organizationId || !scopeId || !canManage) return;
    setSaving(true);
    try {
      const entries = assigned.map((row) => ({
        roleId: row.id,
        permissions: row.permissions,
      }));
      const saveApi = isDivision
        ? organizationAPI.saveDivisionRoleAccess
        : isTeam
          ? organizationAPI.saveTeamRoleAccess
          : organizationAPI.saveDepartmentRoleAccess;
      await saveApi(organizationId, scopeId, { entries });
      toast.success(
        isDivision ? 'Đã lưu quyền khối' : isTeam ? 'Đã lưu quyền team' : 'Đã lưu quyền phòng ban'
      );
      onSaved?.();
      onClose?.();
    } catch {
      toast.error('Không lưu được quyền');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const panelBg = isDarkMode ? 'bg-[#313338]' : 'bg-white';
  const sidebarBg = isDarkMode ? 'bg-[#2b2d31]' : 'bg-slate-50';
  const borderCls = isDarkMode ? 'border-[#1e1f22]' : 'border-slate-200';
  const textMuted = isDarkMode ? 'text-[#949ba4]' : 'text-slate-500';
  const textMain = isDarkMode ? 'text-[#f2f3f5]' : 'text-slate-900';
  const scopeKind = isDivision ? 'Khối' : isTeam ? 'Team' : 'Phòng ban';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/55" aria-label="Đóng" onClick={onClose} />
      <div
        className={`relative flex h-[min(640px,90vh)] w-full max-w-4xl flex-col overflow-hidden rounded-xl shadow-2xl ${panelBg} ${textMain}`}
        role="dialog"
        aria-modal="true"
      >
        <header className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${borderCls}`}>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-bold">
              Quyền {scopeKind} · {scopeLabel}
            </h2>
            <ChevronDown className={`h-4 w-4 shrink-0 opacity-50 ${textMuted}`} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md p-1.5 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {!canManage ? (
          <div className={`flex flex-1 items-center justify-center p-6 text-sm ${textMuted}`}>
            Chỉ quản trị viên (owner/admin) mới được cấu hình quyền.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <aside className={`flex w-[220px] shrink-0 flex-col border-r ${borderCls} ${sidebarBg}`}>
              <div
                className={`flex items-center justify-between px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide ${textMuted}`}
              >
                <span>Vai trò</span>
                <div className="relative">
                  <button
                    type="button"
                    disabled={!availableToAdd.length}
                    onClick={() => setAddOpen((v) => !v)}
                    className={`rounded p-0.5 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'} disabled:opacity-30`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  {addOpen && availableToAdd.length > 0 ? (
                    <div
                      className={`absolute right-0 top-full z-20 mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border py-1 shadow-xl ${
                        isDarkMode ? 'border-[#1e1f22] bg-[#111214]' : 'border-slate-200 bg-white'
                      }`}
                    >
                      {availableToAdd.map((role) => (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => handleAddRole(role)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                            isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: roleAccentColor(role.id) }}
                          />
                          <span className="truncate">{role.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-2 py-1">
                {loading ? (
                  <p className={`px-2 py-3 text-xs ${textMuted}`}>Đang tải…</p>
                ) : assigned.length === 0 ? (
                  <p className={`px-2 py-3 text-xs leading-relaxed ${textMuted}`}>
                    Thêm vai trò để áp dụng quyền cho mọi kênh trong {scopeKind.toLowerCase()} này.
                  </p>
                ) : (
                  assigned.map((role, idx) => (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                      className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                        selectedRole?.id === role.id
                          ? isDarkMode
                            ? 'bg-[#404249] text-white'
                            : 'bg-white shadow-sm'
                          : isDarkMode
                            ? 'text-[#b5bac1] hover:bg-white/[0.04]'
                            : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: roleAccentColor(role.id, idx) }}
                      />
                      <span className="truncate font-medium">{role.name}</span>
                    </button>
                  ))
                )}
              </div>
              {selectedRole ? (
                <div className={`border-t px-3 py-2 ${borderCls}`}>
                  <button
                    type="button"
                    onClick={handleRemoveSelectedRole}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-rose-400 hover:bg-rose-500/10"
                  >
                    Gỡ bỏ {selectedRole.name}
                  </button>
                </div>
              ) : null}
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!selectedRole ? (
                <div className={`flex flex-1 items-center justify-center p-6 text-sm ${textMuted}`}>
                  Thêm vai trò để cấu hình quyền kế thừa xuống các kênh con.
                </div>
              ) : (
                <div className="scrollbar-chat min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  <p className={`mb-4 text-xs ${textMuted}`}>
                    Quyền áp dụng cho <strong className={textMain}>mọi kênh</strong> thuộc {scopeKind.toLowerCase()}{' '}
                    <strong className={textMain}>{scopeLabel}</strong>. Kênh đã có cài đặt riêng sẽ{' '}
                    <strong className={textMain}>ưu tiên</strong> hơn.
                  </p>
                  {permGroups.map((group) => (
                    <section key={group.id} className="mb-6">
                      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#949ba4]">
                        {group.title}
                      </h3>
                      <div className="space-y-4">
                        {group.items.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-start justify-between gap-4 border-b pb-4 ${
                              isDarkMode ? 'border-[#3f4147]/60' : 'border-slate-100'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold">{item.title}</div>
                              <p className={`mt-1 text-xs leading-relaxed ${textMuted}`}>{item.description}</p>
                            </div>
                            <ChannelPermissionTriToggle
                              allowed={Boolean(selectedRole.permissions[item.key])}
                              onChange={(v) => setSelectedPerm(item.key, v)}
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              <footer className={`flex shrink-0 justify-end gap-2 border-t px-4 py-3 ${borderCls}`}>
                <button
                  type="button"
                  onClick={onClose}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                    isDarkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={saving || loading}
                  onClick={handleSave}
                  className="rounded-lg bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
                >
                  {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
