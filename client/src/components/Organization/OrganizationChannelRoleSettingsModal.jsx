import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../Shared';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import { normalizeRoleDisplayName } from './roleRbacUtils';

const EMPTY_PERMS = {
  canSee: false,
  canRead: false,
  canWrite: false,
  canDelete: false,
  canVoice: false,
};

const unwrap = (payload) => payload?.data ?? payload;

export default function OrganizationChannelRoleSettingsModal({
  isOpen,
  onClose,
  organizationId,
  channel,
  locale,
  isDarkMode,
  onSaved,
}) {
  const [roles, setRoles] = useState([]);
  const [permByRoleId, setPermByRoleId] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const channelId = channel?._id ? String(channel._id) : '';
  const isVoice = String(channel?.type || 'chat').toLowerCase() === 'voice';
  const channelLabel = channel?.name
    ? channelNameToDisplaySlug(channel.name, locale)
    : 'Kênh';

  const loadData = useCallback(async () => {
    if (!organizationId || !channelId) return;
    setLoading(true);
    try {
      const [rolesRes, aclRes] = await Promise.all([
        roleAPI.getRolesByOrganization(organizationId),
        organizationAPI.listChannelRoleAccess(organizationId, channelId),
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
      const nextMap = {};
      for (const entry of entries) {
        const rid = String(entry.roleId || '');
        if (!rid) continue;
        nextMap[rid] = {
          canSee: Boolean(entry.permissions?.canSee),
          canRead: Boolean(entry.permissions?.canRead),
          canWrite: Boolean(entry.permissions?.canWrite),
          canDelete: Boolean(entry.permissions?.canDelete),
          canVoice: Boolean(entry.permissions?.canVoice),
        };
      }
      setRoles(
        roleList.map((r) => ({
          id: String(r._id || r.id),
          name: normalizeRoleDisplayName(r.name),
        }))
      );
      setPermByRoleId(nextMap);
    } catch {
      toast.error('Không tải được quyền kênh theo vai trò');
      setRoles([]);
      setPermByRoleId({});
    } finally {
      setLoading(false);
    }
  }, [organizationId, channelId]);

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen, loadData]);

  const rows = useMemo(
    () =>
      roles.map((role) => ({
        role,
        permissions: permByRoleId[role.id] || { ...EMPTY_PERMS },
      })),
    [roles, permByRoleId]
  );

  const setPerm = (roleId, key, value) => {
    setPermByRoleId((prev) => {
      const current = { ...(prev[roleId] || EMPTY_PERMS), [key]: value };
      if (key === 'canSee' && value) {
        current.canRead = true;
      }
      if (key === 'canRead' && !value) {
        current.canWrite = false;
        current.canDelete = false;
      }
      if ((key === 'canWrite' || key === 'canDelete') && value) {
        current.canSee = true;
        current.canRead = true;
      }
      return { ...prev, [roleId]: current };
    });
  };

  const handleSave = async () => {
    if (!organizationId || !channelId) return;
    setSaving(true);
    try {
      const entries = roles.map((role) => ({
        roleId: role.id,
        permissions: permByRoleId[role.id] || { ...EMPTY_PERMS },
      }));
      await organizationAPI.saveChannelRoleAccess(organizationId, channelId, { entries });
      toast.success('Đã lưu quyền kênh');
      onSaved?.();
      onClose?.();
    } catch {
      toast.error('Không lưu được quyền kênh');
    } finally {
      setSaving(false);
    }
  };

  const cellCls = isDarkMode
    ? 'border-slate-700/80 text-slate-200'
    : 'border-slate-200 text-slate-700';
  const headCls = isDarkMode ? 'bg-slate-900/70 text-slate-300' : 'bg-slate-50 text-slate-600';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Cài đặt kênh · ${channelLabel}`}
      size="lg"
    >
      <p className={`mb-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        Chọn vai trò được phép thấy kênh, đọc/viết/xóa tin nhắn
        {isVoice ? ' và tham gia voice' : ''}. Chỉ áp dụng khi không có quyền team mặc định.
      </p>

      {loading ? (
        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Đang tải…</p>
      ) : rows.length === 0 ? (
        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Chưa có vai trò trong tổ chức. Tạo vai trò ở tab Vai trò & quyền trước.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/60">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className={headCls}>
              <tr>
                <th className={`border-b px-3 py-2.5 font-semibold ${cellCls}`}>Vai trò</th>
                <th className={`border-b px-2 py-2.5 text-center font-semibold ${cellCls}`}>
                  Thấy kênh
                </th>
                <th className={`border-b px-2 py-2.5 text-center font-semibold ${cellCls}`}>
                  Xem chat
                </th>
                <th className={`border-b px-2 py-2.5 text-center font-semibold ${cellCls}`}>
                  Viết chat
                </th>
                <th className={`border-b px-2 py-2.5 text-center font-semibold ${cellCls}`}>
                  Xóa chat
                </th>
                {isVoice ? (
                  <th className={`border-b px-2 py-2.5 text-center font-semibold ${cellCls}`}>
                    Voice
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ role, permissions }) => (
                <tr
                  key={role.id}
                  className={isDarkMode ? 'border-t border-slate-800' : 'border-t border-slate-100'}
                >
                  <td className={`px-3 py-2 font-medium ${cellCls}`}>{role.name}</td>
                  {['canSee', 'canRead', 'canWrite', 'canDelete'].map((key) => (
                    <td key={key} className={`px-2 py-2 text-center ${cellCls}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(permissions[key])}
                        onChange={(e) => setPerm(role.id, key, e.target.checked)}
                        className="h-4 w-4 accent-indigo-500"
                      />
                    </td>
                  ))}
                  {isVoice ? (
                    <td className={`px-2 py-2 text-center ${cellCls}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(permissions.canVoice)}
                        onChange={(e) => setPerm(role.id, 'canVoice', e.target.checked)}
                        className="h-4 w-4 accent-indigo-500"
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            isDarkMode
              ? 'bg-white/10 text-white hover:bg-white/15'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          Hủy
        </button>
        <button
          type="button"
          disabled={saving || loading}
          onClick={handleSave}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Đang lưu…' : 'Lưu quyền'}
        </button>
      </div>
    </Modal>
  );
}
