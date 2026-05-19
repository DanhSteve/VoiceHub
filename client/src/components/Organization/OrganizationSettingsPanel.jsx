import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { ConfirmDialog, Modal, GlassCard, GradientButton } from '../Shared';
import { useAuth } from '../../context/AuthContext';
import { organizationAPI } from '../../services/api/organizationAPI';
import roleAPI from '../../services/api/roleAPI';
import RoleHierarchyKanban from './RoleHierarchyKanban';
import RolePermissionsViewModal from './RolePermissionsViewModal';
import {
  ACTION_LABEL,
  PERMISSION_EDITOR_OPTIONS,
  TIER_META,
  fullPermissionState,
  isFullPermissionState,
  normalizeRoleDisplayName,
  permissionEntriesFromState,
  permissionStateFromEntries,
  priorityFromTier,
  summarizePermissions,
  resolveRoleTier,
  TIER_DEPARTMENT,
} from './roleRbacUtils';

const unwrap = (payload) => payload?.data ?? payload;

const ADMIN_TABS = [
  { id: 'general', label: 'Tổng quan', icon: '⚙️' },
  { id: 'structure', label: 'Cấu trúc tổ chức', icon: '🏢' },
  { id: 'join', label: 'Đơn gia nhập', icon: '📋' },
  { id: 'roles', label: 'Vai trò & quyền', icon: '🔐' },
  { id: 'security', label: 'Bảo mật', icon: '🛡️' },
  { id: 'integrations', label: 'Tích hợp', icon: '🔗' },
  { id: 'billing', label: 'Thanh toán', icon: '💳' },
  { id: 'audit', label: 'Nhật ký', icon: '📜' },
];

const MEMBER_TABS = [
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: '👤' },
  { id: 'notifications', label: 'Thông báo', icon: '🔔' },
  { id: 'privacy', label: 'Quyền riêng tư', icon: '🔒' },
  { id: 'appearance', label: 'Giao diện', icon: '🎨' },
];

const storageKey = (orgId, key) => `orgSettings:${orgId}:${key}`;

const JOIN_CHOICE_MAX = 8;
const JOIN_CHOICE_MIN = 2;

/** Số ô mặc định khi chọn kiểu câu hỏi */
function joinDefaultOptionSlotCount(type) {
  if (type === 'radio') return 4;
  if (type === 'checkbox') return 2;
  if (type === 'single_choice') return 2;
  return 2;
}

/** Chuẩn hóa mảng options để hiển thị đủ ô (radio mặc định 4, checkbox 2, tối đa 8). */
function joinPadOptionsForDisplay(type, options) {
  if (!['single_choice', 'radio', 'checkbox'].includes(type)) return [];
  const raw = Array.isArray(options) ? options : [];
  const def = joinDefaultOptionSlotCount(type);
  const len = Math.min(JOIN_CHOICE_MAX, Math.max(JOIN_CHOICE_MIN, def, raw.length));
  const out = [];
  for (let i = 0; i < len; i += 1) out.push(raw[i] ?? '');
  return out;
}

function joinCreateEmptyOptionsForType(type) {
  const n = joinDefaultOptionSlotCount(type);
  return Array.from({ length: n }, () => '');
}

/**
 * Owner / Admin: toàn bộ mục quản trị. Member: chỉ Hồ sơ / Thông báo / …
 * Full màn hình: sidebar trái (mục) + vùng nội dung phải.
 */
function OrganizationSettingsPanel({
  organization,
  onBack,
  onOrganizationUpdated,
  onOrganizationDeleted,
  /** ?tab=join trên URL */
  initialTab = null,
}) {
  const { user, updateUser } = useAuth();
  const orgId = organization?._id || organization?.id;
  const myRole = String(organization?.myRole || 'member').toLowerCase();

  const isFullAccess = useMemo(
    () => myRole === 'owner' || myRole === 'admin',
    [myRole]
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('general');

  const selectTab = useCallback(
    (tabId) => {
      setActiveTab(tabId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId && tabId !== 'general') next.set('tab', tabId);
          else next.delete('tab');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const [roleDeleteConfirmId, setRoleDeleteConfirmId] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const [organizationForm, setOrganizationForm] = useState({
    name: '',
    description: '',
    website: '',
    contactEmail: '',
  });

  const [userProfileForm, setUserProfileForm] = useState({
    fullName: '',
    phone: '',
  });

  const [integrations] = useState([
    { id: 'slack', name: 'Slack', icon: '💬', connected: false, color: 'from-purple-600 to-pink-600' },
    { id: 'gdrive', name: 'Google Drive', icon: '📁', connected: false, color: 'from-blue-500 to-cyan-500' },
  ]);
  const [securitySettings, setSecuritySettings] = useState([
    { id: '2fa', label: 'Bắt buộc 2FA cho tất cả thành viên', checked: false },
    { id: 'strong-password', label: 'Yêu cầu mật khẩu mạnh', checked: false },
  ]);
  const [notificationSettings, setNotificationSettings] = useState([
    { id: 'new-message', label: 'Thông báo tin nhắn mới trong tổ chức', checked: true },
    { id: 'mention', label: 'Thông báo khi được @mention', checked: true },
    { id: 'email', label: 'Thông báo qua email', checked: false },
  ]);
  const [privacySettings, setPrivacySettings] = useState({
    onlineStatus: 'Mọi người',
    directMessagePermission: 'Mọi người',
  });
  const [themeMode, setThemeMode] = useState('dark');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [roles, setRoles] = useState([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editingRoleOriginalName, setEditingRoleOriginalName] = useState('');
  const [roleDraft, setRoleDraft] = useState({
    name: '',
    members: 0,
    color: 'from-purple-600 to-pink-600',
    icon: '🧩',
  });
  const [rolePermissionState, setRolePermissionState] = useState({});
  const [roleTier, setRoleTier] = useState(TIER_DEPARTMENT);
  const [rolePermissionsView, setRolePermissionsView] = useState(null);

  const roleAllPermissions = useMemo(
    () => isFullPermissionState(rolePermissionState),
    [rolePermissionState]
  );

  /** Tên tổ chức từ API — dùng để so khớp khi xóa (không phụ thuộc chỉnh sửa form chưa lưu). */
  const [serverOrgName, setServerOrgName] = useState('');
  const [deleteOrgModalOpen, setDeleteOrgModalOpen] = useState(false);
  const [deleteOrgNameInput, setDeleteOrgNameInput] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);

  const [joinFormLoading, setJoinFormLoading] = useState(false);
  const [joinFormSaving, setJoinFormSaving] = useState(false);
  const [joinFormEnabled, setJoinFormEnabled] = useState(false);
  const [joinFormDefaultRole, setJoinFormDefaultRole] = useState('member');
  const [joinFormFields, setJoinFormFields] = useState([]);
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureBranches, setStructureBranches] = useState([]);
  const [manageBranchId, setManageBranchId] = useState('');
  const [manageDivisionId, setManageDivisionId] = useState('');
  const [manageDepartmentId, setManageDepartmentId] = useState('');
  const [manageTeamId, setManageTeamId] = useState('');
  const [createDivisionName, setCreateDivisionName] = useState('');
  const [createDivisionBranchId, setCreateDivisionBranchId] = useState('');
  const [createDivisionModalOpen, setCreateDivisionModalOpen] = useState(false);
  const [createDepartmentName, setCreateDepartmentName] = useState('');
  const [createDepartmentBranchId, setCreateDepartmentBranchId] = useState('');
  const [createDepartmentDivisionId, setCreateDepartmentDivisionId] = useState('');
  const [createDepartmentModalOpen, setCreateDepartmentModalOpen] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [createTeamBranchId, setCreateTeamBranchId] = useState('');
  const [createTeamDivisionId, setCreateTeamDivisionId] = useState('');
  const [createTeamDepartmentId, setCreateTeamDepartmentId] = useState('');
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [createChannelName, setCreateChannelName] = useState('');
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelLevel, setCreateChannelLevel] = useState('team');
  const [createChannelBranchId, setCreateChannelBranchId] = useState('');
  const [createChannelDivisionId, setCreateChannelDivisionId] = useState('');
  const [createChannelDepartmentId, setCreateChannelDepartmentId] = useState('');
  const [createChannelTeamId, setCreateChannelTeamId] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [renameDivisionName, setRenameDivisionName] = useState('');
  const [renameDepartmentName, setRenameDepartmentName] = useState('');
  const [renameTeamName, setRenameTeamName] = useState('');
  const [renameChannelId, setRenameChannelId] = useState('');
  const [renameChannelName, setRenameChannelName] = useState('');
  const [orgMembers, setOrgMembers] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [accessUserId, setAccessUserId] = useState('');
  const [accessCanRead, setAccessCanRead] = useState(true);
  const [accessCanWrite, setAccessCanWrite] = useState(false);
  const [accessCanVoice, setAccessCanVoice] = useState(false);

  const expectedOrgNameForDelete = useMemo(() => {
    const fromServer = serverOrgName?.trim();
    if (fromServer) return fromServer;
    return String(organization?.name || '').trim();
  }, [serverOrgName, organization?.name]);

  const deleteNameMatches =
    expectedOrgNameForDelete.length > 0 &&
    deleteOrgNameInput.trim() === expectedOrgNameForDelete;

  const loadOrgFromApi = useCallback(async () => {
    if (!orgId) return;
    setLoadingOrg(true);
    try {
      const payload = await organizationAPI.getOrganization(orgId);
      const data = unwrap(payload);
      const o = data?.data ?? data;
      const n = o?.name || organization?.name || '';
      setServerOrgName(n);
      setOrganizationForm({
        name: n,
        description: o?.description || '',
        website: o?.website || '',
        contactEmail: o?.contactEmail || '',
      });
    } catch {
      setOrganizationForm((prev) => ({
        ...prev,
        name: organization?.name || prev.name,
      }));
      setServerOrgName(organization?.name || '');
    } finally {
      setLoadingOrg(false);
    }
  }, [orgId, organization?.name]);

  const loadRoles = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    try {
      setRoleLoading(true);
      const response = await roleAPI.getRolesByOrganization(orgId);
      const raw = response?.data ?? response;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setRoles(
        list.map((r) => ({
          ...r,
          id: r.id || r._id,
        }))
      );
    } catch {
      /* giữ mặc định */
    } finally {
      setRoleLoading(false);
    }
  }, [orgId, isFullAccess]);

  const loadJoinWorkspace = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    setJoinFormLoading(true);
    try {
      const formRes = await organizationAPI.getJoinApplicationForm(orgId);
      const formRaw = unwrap(formRes);
      const fd = formRaw?.data ?? formRaw;
      setJoinFormEnabled(Boolean(fd?.enabled));
      setJoinFormDefaultRole(fd?.defaultRoleOnApprove === 'admin' ? 'admin' : 'member');
      setJoinFormFields(Array.isArray(fd?.fields) ? fd.fields : []);
    } catch {
      toast.error('Không tải được cấu hình đơn gia nhập');
    } finally {
      setJoinFormLoading(false);
    }
  }, [orgId, isFullAccess]);

  const loadStructure = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    setStructureLoading(true);
    try {
      const payload = await organizationAPI.getStructure(orgId);
      const raw = unwrap(payload);
      const branches = Array.isArray(raw?.branches) ? raw.branches : Array.isArray(raw) ? raw : [];
      setStructureBranches(branches);
      const firstBranchId = branches[0]?._id ? String(branches[0]._id) : '';
      const firstDivisionId = branches[0]?.divisions?.[0]?._id
        ? String(branches[0].divisions[0]._id)
        : '';
      const firstDepartmentId = branches[0]?.divisions?.[0]?.departments?.[0]?._id
        ? String(branches[0].divisions[0].departments[0]._id)
        : '';
      const firstTeamId = branches[0]?.divisions?.[0]?.departments?.[0]?.teams?.[0]?._id
        ? String(branches[0].divisions[0].departments[0].teams[0]._id)
        : '';
      setManageBranchId((prev) => prev || firstBranchId);
      setManageDivisionId((prev) => prev || firstDivisionId);
      setManageDepartmentId((prev) => prev || firstDepartmentId);
      setManageTeamId((prev) => prev || firstTeamId);
    } catch {
      setStructureBranches([]);
    } finally {
      setStructureLoading(false);
    }
  }, [orgId, isFullAccess]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'join') return;
    loadJoinWorkspace();
  }, [orgId, isFullAccess, activeTab, loadJoinWorkspace]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'structure') return;
    loadStructure();
  }, [orgId, isFullAccess, activeTab, loadStructure]);

  useEffect(() => {
    if (!orgId) return;
    const first = isFullAccess ? 'general' : 'profile';
    const allowed = (isFullAccess ? ADMIN_TABS : MEMBER_TABS).map((t) => t.id);
    const urlTab = searchParams.get('tab') || initialTab;
    const nextTab = urlTab && allowed.includes(urlTab) ? urlTab : first;
    setActiveTab(nextTab);
    loadOrgFromApi();
    loadRoles();

    try {
      const raw = localStorage.getItem(storageKey(orgId, 'memberPrefs'));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.notificationSettings) setNotificationSettings(parsed.notificationSettings);
        if (parsed.privacySettings) setPrivacySettings(parsed.privacySettings);
        if (parsed.themeMode) setThemeMode(parsed.themeMode);
      }
    } catch {
      /* ignore */
    }
  }, [orgId, isFullAccess, initialTab, searchParams, loadOrgFromApi, loadRoles]);

  useEffect(() => {
    if (!user) return;
    setUserProfileForm({
      fullName: user?.displayName || user?.fullName || user?.name || '',
      phone: user?.phone || '',
    });
  }, [user, orgId]);

  const persistMemberPrefs = () => {
    if (!orgId) return;
    try {
      localStorage.setItem(
        storageKey(orgId, 'memberPrefs'),
        JSON.stringify({
          notificationSettings,
          privacySettings,
          themeMode,
        })
      );
    } catch {
      /* ignore */
    }
  };

  const openDeleteOrgModal = () => {
    setDeleteOrgNameInput('');
    setDeleteOrgModalOpen(true);
  };

  const closeDeleteOrgModal = () => {
    if (deletingOrg) return;
    setDeleteOrgModalOpen(false);
    setDeleteOrgNameInput('');
  };

  const handleConfirmDeleteOrganization = async () => {
    if (!orgId || !deleteNameMatches) return;
    setDeletingOrg(true);
    try {
      await organizationAPI.deleteOrganization(orgId);
      toast.success('Đã xóa tổ chức');
      setDeleteOrgModalOpen(false);
      setDeleteOrgNameInput('');
      onOrganizationDeleted?.(orgId);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Không thể xóa tổ chức';
      toast.error(typeof msg === 'string' ? msg : 'Không thể xóa tổ chức');
    } finally {
      setDeletingOrg(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!orgId || !organizationForm.name?.trim()) {
      toast.error('Vui lòng nhập tên tổ chức');
      return;
    }
    try {
      const trimmedName = organizationForm.name.trim();
      await organizationAPI.updateOrganization(orgId, {
        name: trimmedName,
        description: organizationForm.description,
      });
      setServerOrgName(trimmedName);
      toast.success('Đã lưu thông tin tổ chức');
      onOrganizationUpdated?.();
    } catch {
      toast.error('Không thể cập nhật tổ chức');
    }
  };

  const handleSaveUserProfile = () => {
    updateUser({ displayName: userProfileForm.fullName, phone: userProfileForm.phone });
    persistMemberPrefs();
    toast.success('Đã cập nhật hồ sơ');
  };

  const handleToggleNotification = (id) => {
    setNotificationSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    );
  };

  const handleToggleSecurity = (id) => {
    setSecuritySettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    );
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === 'string' ? reader.result : '');
      toast.success('Đã cập nhật avatar');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const manageBranch = useMemo(
    () => structureBranches.find((b) => String(b._id) === String(manageBranchId)) || null,
    [structureBranches, manageBranchId]
  );
  const manageDivisions = Array.isArray(manageBranch?.divisions) ? manageBranch.divisions : [];
  const manageDivision =
    manageDivisions.find((d) => String(d._id) === String(manageDivisionId)) || null;
  const manageDepartments = Array.isArray(manageDivision?.departments) ? manageDivision.departments : [];
  const manageDepartment =
    manageDepartments.find((d) => String(d._id) === String(manageDepartmentId)) || null;
  const manageTeams = Array.isArray(manageDepartment?.teams) ? manageDepartment.teams : [];
  const manageTeam = manageTeams.find((t) => String(t._id) === String(manageTeamId)) || null;
  const manageDivisionChannels = Array.isArray(manageDivision?.channels) ? manageDivision.channels : [];
  const manageDepartmentChannels = Array.isArray(manageDepartment?.channels) ? manageDepartment.channels : [];
  const manageTeamChannels = Array.isArray(manageTeam?.channels) ? manageTeam.channels : [];
  const manageChannels = [
    ...manageDivisionChannels.map((ch) => ({ ...ch, __scope: 'division' })),
    ...manageDepartmentChannels.map((ch) => ({ ...ch, __scope: 'department' })),
    ...manageTeamChannels.map((ch) => ({ ...ch, __scope: 'team' })),
  ];

  const resolveBranchById = (branchId) =>
    structureBranches.find((b) => String(b._id) === String(branchId)) || null;
  const resolveDivisionById = (branchId, divisionId) =>
    (resolveBranchById(branchId)?.divisions || []).find(
      (d) => String(d._id) === String(divisionId)
    ) || null;
  const resolveDepartmentById = (branchId, divisionId, departmentId) =>
    (resolveDivisionById(branchId, divisionId)?.departments || []).find(
      (d) => String(d._id) === String(departmentId)
    ) || null;
  const createDepartmentBranch = resolveBranchById(createDepartmentBranchId);
  const createDepartmentDivisions = Array.isArray(createDepartmentBranch?.divisions)
    ? createDepartmentBranch.divisions
    : [];
  const createTeamBranch = resolveBranchById(createTeamBranchId);
  const createTeamDivisions = Array.isArray(createTeamBranch?.divisions) ? createTeamBranch.divisions : [];
  const createTeamDivision =
    createTeamDivisions.find((d) => String(d._id) === String(createTeamDivisionId)) || null;
  const createTeamDepartments = Array.isArray(createTeamDivision?.departments)
    ? createTeamDivision.departments
    : [];
  const createChannelBranch = resolveBranchById(createChannelBranchId);
  const createChannelDivisions = Array.isArray(createChannelBranch?.divisions)
    ? createChannelBranch.divisions
    : [];
  const createChannelDivision =
    createChannelDivisions.find((d) => String(d._id) === String(createChannelDivisionId)) || null;
  const createChannelDepartments = Array.isArray(createChannelDivision?.departments)
    ? createChannelDivision.departments
    : [];
  const createChannelDepartment =
    createChannelDepartments.find((d) => String(d._id) === String(createChannelDepartmentId)) || null;
  const createChannelTeams = Array.isArray(createChannelDepartment?.teams)
    ? createChannelDepartment.teams
    : [];

  const openCreateDivisionModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    if (!fallbackBranchId) {
      toast.error('Chưa có chi nhánh để tạo khối');
      return;
    }
    setCreateDivisionBranchId(fallbackBranchId);
    setCreateDivisionName('');
    setCreateDivisionModalOpen(true);
  };

  const handleCreateDivision = async () => {
    if (!orgId || !createDivisionBranchId || !createDivisionName.trim()) return;
    try {
      await organizationAPI.createDivision(orgId, createDivisionBranchId, {
        name: createDivisionName.trim(),
      });
      setCreateDivisionName('');
      setCreateDivisionModalOpen(false);
      await loadStructure();
      toast.success('Đã tạo khối');
    } catch {
      toast.error('Không tạo được khối');
    }
  };

  const openCreateDepartmentModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    const branch = resolveBranchById(fallbackBranchId);
    const fallbackDivisionId =
      manageDivisionId || (branch?.divisions?.[0]?._id ? String(branch.divisions[0]._id) : '');
    if (!fallbackBranchId || !fallbackDivisionId) {
      toast.error('Cần có chi nhánh và khối trước khi tạo phòng ban');
      return;
    }
    setCreateDepartmentBranchId(fallbackBranchId);
    setCreateDepartmentDivisionId(fallbackDivisionId);
    setCreateDepartmentName('');
    setCreateDepartmentModalOpen(true);
  };

  const handleCreateDepartment = async () => {
    if (!orgId || !createDepartmentDivisionId || !createDepartmentName.trim()) return;
    try {
      await organizationAPI.createDepartmentByDivision(orgId, createDepartmentDivisionId, {
        name: createDepartmentName.trim(),
      });
      setCreateDepartmentName('');
      setCreateDepartmentModalOpen(false);
      await loadStructure();
      toast.success('Đã tạo phòng ban');
    } catch {
      toast.error('Không tạo được phòng ban');
    }
  };

  const openCreateTeamModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    const branch = resolveBranchById(fallbackBranchId);
    const fallbackDivisionId =
      manageDivisionId || (branch?.divisions?.[0]?._id ? String(branch.divisions[0]._id) : '');
    const division = resolveDivisionById(fallbackBranchId, fallbackDivisionId);
    const fallbackDepartmentId =
      manageDepartmentId ||
      (division?.departments?.[0]?._id ? String(division.departments[0]._id) : '');
    if (!fallbackBranchId || !fallbackDivisionId || !fallbackDepartmentId) {
      toast.error('Cần có đủ chi nhánh, khối và phòng ban trước khi tạo team');
      return;
    }
    setCreateTeamBranchId(fallbackBranchId);
    setCreateTeamDivisionId(fallbackDivisionId);
    setCreateTeamDepartmentId(fallbackDepartmentId);
    setCreateTeamName('');
    setCreateTeamModalOpen(true);
  };

  const handleCreateTeam = async () => {
    if (!orgId || !createTeamDepartmentId || !createTeamName.trim()) return;
    try {
      await organizationAPI.createTeamByDepartment(orgId, createTeamDepartmentId, {
        name: createTeamName.trim(),
      });
      setCreateTeamName('');
      setCreateTeamModalOpen(false);
      await loadStructure();
      toast.success('Đã tạo team');
    } catch {
      toast.error('Không tạo được team');
    }
  };

  const openCreateChannelModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    const branch = resolveBranchById(fallbackBranchId);
    const fallbackDivisionId =
      manageDivisionId || (branch?.divisions?.[0]?._id ? String(branch.divisions[0]._id) : '');
    const division = resolveDivisionById(fallbackBranchId, fallbackDivisionId);
    const fallbackDepartmentId =
      manageDepartmentId ||
      (division?.departments?.[0]?._id ? String(division.departments[0]._id) : '');
    const department = resolveDepartmentById(
      fallbackBranchId,
      fallbackDivisionId,
      fallbackDepartmentId
    );
    const fallbackTeamId =
      manageTeamId || (department?.teams?.[0]?._id ? String(department.teams[0]._id) : '');
    if (!fallbackBranchId || !fallbackDivisionId) {
      toast.error('Cần có ít nhất chi nhánh và khối trước khi tạo kênh');
      return;
    }
    setCreateChannelLevel('team');
    setCreateChannelBranchId(fallbackBranchId);
    setCreateChannelDivisionId(fallbackDivisionId);
    setCreateChannelDepartmentId(fallbackDepartmentId);
    setCreateChannelTeamId(fallbackTeamId);
    setCreateChannelType('chat');
    setCreateChannelName('');
    setCreateChannelModalOpen(true);
  };

  const handleCreateChannel = async () => {
    if (!orgId || !createChannelName.trim()) return;
    if (createChannelLevel === 'division' && !createChannelDivisionId) {
      toast.error('Vui lòng chọn khối');
      return;
    }
    if (createChannelLevel === 'department' && !createChannelDepartmentId) {
      toast.error('Vui lòng chọn phòng ban');
      return;
    }
    if (createChannelLevel === 'team' && !createChannelTeamId) {
      toast.error('Vui lòng chọn team');
      return;
    }
    try {
      await organizationAPI.createChannelByScope(orgId, {
        level: createChannelLevel,
        branchId: createChannelBranchId || null,
        divisionId: createChannelDivisionId || null,
        departmentId: createChannelDepartmentId || null,
        teamId: createChannelTeamId || null,
        name: createChannelName.trim(),
        type: createChannelType,
      });
      setCreateChannelName('');
      setCreateChannelModalOpen(false);
      await loadStructure();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vh:org-structure-changed', { detail: { orgId } })
        );
      }
      toast.success('Đã tạo kênh');
    } catch {
      toast.error('Không tạo được kênh');
    }
  };
  const handleRenameDivision = async () => {
    if (!orgId || !manageDivisionId || !renameDivisionName.trim()) return;
    try {
      await organizationAPI.updateDivision(orgId, manageDivisionId, { name: renameDivisionName.trim() });
      await loadStructure();
      toast.success('Đã đổi tên khối');
    } catch {
      toast.error('Không đổi được tên khối');
    }
  };
  const handleRenameDepartment = async () => {
    if (!orgId || !manageDepartmentId || !renameDepartmentName.trim()) return;
    try {
      await organizationAPI.updateDepartment(orgId, manageDepartmentId, {
        name: renameDepartmentName.trim(),
      });
      await loadStructure();
      toast.success('Đã đổi tên phòng ban');
    } catch {
      toast.error('Không đổi được tên phòng ban');
    }
  };
  const handleRenameTeam = async () => {
    if (!orgId || !manageTeamId || !renameTeamName.trim()) return;
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, manageTeamId, { name: renameTeamName.trim() });
      await loadStructure();
      toast.success('Đã đổi tên team');
    } catch {
      toast.error('Không đổi được tên team');
    }
  };
  const handleRenameChannel = async () => {
    if (!orgId || !renameChannelId || !renameChannelName.trim()) return;
    try {
      await organizationAPI.updateChannelByScope(orgId, renameChannelId, {
        name: renameChannelName.trim(),
      });
      await loadStructure();
      toast.success('Đã đổi tên kênh');
    } catch {
      toast.error('Không đổi được tên kênh');
    }
  };

  const loadOrgMembers = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    try {
      const payload = await organizationAPI.getMembers(orgId);
      const raw = unwrap(payload);
      const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setOrgMembers(rows);
    } catch {
      setOrgMembers([]);
    }
  }, [orgId, isFullAccess]);

  const loadChannelAccessRows = useCallback(async () => {
    if (!orgId || !renameChannelId) {
      setAccessRows([]);
      return;
    }
    try {
      const payload = await organizationAPI.listChannelAccess(orgId, renameChannelId);
      const raw = unwrap(payload);
      const data = raw?.data ?? raw;
      setAccessRows(Array.isArray(data?.accesses) ? data.accesses : []);
    } catch {
      setAccessRows([]);
    }
  }, [orgId, renameChannelId]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'structure') return;
    loadOrgMembers();
  }, [orgId, isFullAccess, activeTab, loadOrgMembers]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'structure') return;
    loadChannelAccessRows();
  }, [orgId, isFullAccess, activeTab, loadChannelAccessRows]);

  const handleGrantChannelAccess = async () => {
    if (!orgId || !renameChannelId || !accessUserId) return;
    try {
      await organizationAPI.grantChannelAccess(orgId, renameChannelId, {
        userId: accessUserId,
        permissions: {
          canRead: accessCanRead,
          canWrite: accessCanWrite,
          canVoice: accessCanVoice,
        },
      });
      await loadChannelAccessRows();
      toast.success('Đã cấp quyền kênh');
    } catch {
      toast.error('Không thể cấp quyền kênh');
    }
  };

  const handleRevokeChannelAccess = async (userId) => {
    if (!orgId || !renameChannelId || !userId) return;
    try {
      await organizationAPI.revokeChannelAccess(orgId, renameChannelId, { userId });
      await loadChannelAccessRows();
      toast.success('Đã gỡ quyền kênh');
    } catch {
      toast.error('Không thể gỡ quyền kênh');
    }
  };

  const openCreateRole = () => {
    setEditingRoleId(null);
    setEditingRoleOriginalName('');
    setRoleDraft({
      name: '',
      members: 0,
      color: 'from-purple-600 to-pink-600',
      icon: '🧩',
    });
    setRolePermissionState({});
    setRoleTier(TIER_DEPARTMENT);
    setRoleEditorOpen(true);
  };

  const openEditRole = (role) => {
    setEditingRoleId(role.id || role._id);
    setEditingRoleOriginalName(String(role.name || ''));
    setRoleDraft({
      name: normalizeRoleDisplayName(role.name),
      members: role.members,
      color: role.color || 'from-purple-600 to-pink-600',
      icon: role.icon || '🧩',
    });
    setRoleTier(resolveRoleTier(role));
    setRolePermissionState(permissionStateFromEntries(role.permissions));
    setRoleEditorOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleDraft.name?.trim()) {
      toast.error('Nhập tên vai trò');
      return;
    }
    try {
      setRoleLoading(true);
      const permissionsPayload = permissionEntriesFromState(rolePermissionState);
      const fallbackHierarchyName =
        editingRoleId &&
        editingRoleOriginalName &&
        normalizeRoleDisplayName(editingRoleOriginalName) === roleDraft.name?.trim()
          ? editingRoleOriginalName
          : '';
      const payload = {
        ...roleDraft,
        name: fallbackHierarchyName || roleDraft.name,
        permissions: permissionsPayload,
        priority: priorityFromTier(roleTier),
        organizationId: orgId,
        serverId: orgId,
      };
      if (editingRoleId) {
        await roleAPI.updateRole(editingRoleId, payload);
        toast.success('Đã cập nhật vai trò');
      } else {
        await roleAPI.createRole(payload);
        toast.success('Đã tạo vai trò');
      }
      setRoleEditorOpen(false);
      setEditingRoleId(null);
      setEditingRoleOriginalName('');
      setRoleTier(TIER_DEPARTMENT);
      await loadRoles();
    } catch (e) {
      toast.error(e?.message || 'Không lưu được vai trò');
    } finally {
      setRoleLoading(false);
    }
  };

  const requestDeleteRole = (roleId) => {
    setRoleDeleteConfirmId(roleId);
  };

  const confirmDeleteRole = async () => {
    const roleId = roleDeleteConfirmId;
    if (!roleId) return;
    try {
      setRoleLoading(true);
      await roleAPI.deleteRole(roleId);
      toast.success('Đã xóa vai trò');
      await loadRoles();
    } catch (e) {
      toast.error(e?.message || 'Lỗi xóa vai trò');
    } finally {
      setRoleLoading(false);
    }
  };

  const persistRoleHierarchy = async (updates) => {
    if (!updates?.length) return;
    try {
      setRoleLoading(true);
      await Promise.all(
        updates.map(({ id, priority }) => roleAPI.updateRole(id, { priority }))
      );
      await loadRoles();
      toast.success('Đã cập nhật thứ bậc vai trò');
    } catch (e) {
      toast.error(e?.message || 'Không lưu được thứ bậc');
      await loadRoles();
    } finally {
      setRoleLoading(false);
    }
  };

  const handleSaveJoinForm = async () => {
    if (!orgId) return;
    setJoinFormSaving(true);
    try {
      await organizationAPI.updateJoinApplicationForm(orgId, {
        enabled: joinFormEnabled,
        defaultRoleOnApprove: joinFormDefaultRole,
        fields: joinFormFields,
      });
      toast.success('Đã lưu form gia nhập');
      onOrganizationUpdated?.();
      await loadJoinWorkspace();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Không lưu được';
      toast.error(typeof msg === 'string' ? msg : 'Không lưu được');
    } finally {
      setJoinFormSaving(false);
    }
  };

  const addJoinField = () => {
    setJoinFormFields((prev) => [
      ...prev,
      {
        id: `field_${Date.now()}`,
        label: 'Câu hỏi mới',
        type: 'short_text',
        required: false,
        options: [],
      },
    ]);
  };

  const updateJoinField = (index, patch) => {
    setJoinFormFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const removeJoinField = (index) => {
    setJoinFormFields((prev) => prev.filter((_, i) => i !== index));
  };

  const tabs = isFullAccess ? ADMIN_TABS : MEMBER_TABS;

  if (!organization) return null;

  return (
    <>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#0b0e14] text-slate-100">
        <header className="shrink-0 border-b border-white/[0.08] px-4 py-4 md:px-8">
          <button
            type="button"
            onClick={onBack}
            className="mb-3 text-sm text-cyan-400/90 hover:text-cyan-300 hover:underline"
          >
            ← Quay lại Tổ chức
          </button>
          <h1 className="text-xl font-bold text-white md:text-2xl">Cài đặt tổ chức</h1>
          <p className="mt-1 text-sm font-semibold text-white/90">{organization.name}</p>
          <p className="text-xs text-gray-400">
            Vai trò của bạn:{' '}
            <span className="text-cyan-300">
              {myRole === 'owner'
                ? 'Chủ sở hữu'
                : myRole === 'admin'
                  ? 'Quản trị viên'
                  : myRole === 'hr'
                    ? 'Nhân sự'
                  : 'Thành viên'}
            </span>
            {!isFullAccess && ' — chỉ xem các mục cá nhân trong tổ chức'}
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-b border-white/[0.08] bg-[#06080d] py-4 md:block md:border-b-0 md:border-r lg:w-64">
            <nav className="flex flex-col gap-1 px-3">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'border border-transparent text-gray-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="text-lg leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/[0.08] bg-[#080a10] px-2 py-2 md:hidden">
              <div className="flex gap-1 overflow-x-auto pb-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'border border-slate-800 bg-[#040f2a] text-gray-400'
                    }`}
                  >
                    <span className="mr-0.5">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-10 md:py-8">
              {loadingOrg && isFullAccess && (
                <p className="mb-4 text-sm text-gray-400">Đang tải thông tin tổ chức…</p>
              )}

          {/* ——— Admin ——— */}
          {isFullAccess && activeTab === 'general' && (
            <div className="mx-auto max-w-4xl space-y-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-4 text-xl font-bold text-white">Thông tin tổ chức</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Tên tổ chức</label>
                    <input
                      value={organizationForm.name}
                      onChange={(e) =>
                        setOrganizationForm((p) => ({ ...p, name: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Mô tả</label>
                    <textarea
                      rows={3}
                      value={organizationForm.description}
                      onChange={(e) =>
                        setOrganizationForm((p) => ({ ...p, description: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <GradientButton variant="primary" onClick={handleSaveOrganization}>
                    Lưu thay đổi
                  </GradientButton>
                </div>
              </GlassCard>
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-2 text-lg font-bold text-white">Quota & giới hạn</h3>
                <p className="text-sm text-gray-400">
                  Theo gói đăng ký — chi tiết sẽ đồng bộ khi backend billing sẵn sàng.
                </p>
              </GlassCard>
              {myRole === 'owner' && (
                <GlassCard className="border border-red-900/40 bg-red-950/20">
                  <h3 className="mb-2 text-lg font-bold text-red-300">Vùng nguy hiểm</h3>
                  <p className="mb-3 text-sm text-gray-400">
                    Xóa tổ chức sẽ vô hiệu hóa tổ chức này. Nếu bạn là chủ sở hữu duy nhất và không thể rời
                    tổ chức, hãy xóa tổ chức hoặc chuyển quyền sở hữu trước.
                  </p>
                  <button
                    type="button"
                    onClick={openDeleteOrgModal}
                    className="rounded-xl border border-red-500/60 bg-red-950/40 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-950/60"
                  >
                    Xóa tổ chức vĩnh viễn
                  </button>
                </GlassCard>
              )}
            </div>
          )}

          {isFullAccess && activeTab === 'structure' && (
            <div className="mx-auto max-w-6xl space-y-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-3 text-xl font-bold text-white">Quản trị cấu trúc tổ chức</h3>
                {structureLoading ? (
                  <p className="text-sm text-gray-400">Đang tải cấu trúc…</p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      <label className="text-sm text-gray-300">Chi nhánh
                        <select value={manageBranchId} onChange={(e) => {
                          const nextBranchId = e.target.value;
                          const nextBranch = structureBranches.find((b) => String(b._id) === String(nextBranchId)) || null;
                          const nextDivisionId = nextBranch?.divisions?.[0]?._id ? String(nextBranch.divisions[0]._id) : '';
                          const nextDepartmentId = nextBranch?.divisions?.[0]?.departments?.[0]?._id ? String(nextBranch.divisions[0].departments[0]._id) : '';
                          const nextTeamId = nextBranch?.divisions?.[0]?.departments?.[0]?.teams?.[0]?._id ? String(nextBranch.divisions[0].departments[0].teams[0]._id) : '';
                          setManageBranchId(nextBranchId); setManageDivisionId(nextDivisionId); setManageDepartmentId(nextDepartmentId); setManageTeamId(nextTeamId);
                        }} className="mt-1 w-full rounded-xl border border-slate-800 bg-[#040f2a] px-3 py-2 text-white">
                          {structureBranches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                        </select>
                      </label>
                      <label className="text-sm text-gray-300">Khối
                        <select value={manageDivisionId} onChange={(e) => {
                          const nextDivisionId = e.target.value;
                          const nextDivision = manageDivisions.find((d) => String(d._id) === String(nextDivisionId)) || null;
                          const nextDepartmentId = nextDivision?.departments?.[0]?._id ? String(nextDivision.departments[0]._id) : '';
                          const nextTeamId = nextDivision?.departments?.[0]?.teams?.[0]?._id ? String(nextDivision.departments[0].teams[0]._id) : '';
                          setManageDivisionId(nextDivisionId); setManageDepartmentId(nextDepartmentId); setManageTeamId(nextTeamId);
                        }} className="mt-1 w-full rounded-xl border border-slate-800 bg-[#040f2a] px-3 py-2 text-white">
                          {manageDivisions.map((division) => <option key={division._id} value={division._id}>{division.name}</option>)}
                        </select>
                      </label>
                      <label className="text-sm text-gray-300">Phòng ban
                        <select value={manageDepartmentId} onChange={(e) => {
                          const nextDepartmentId = e.target.value;
                          const nextDepartment = manageDepartments.find((d) => String(d._id) === String(nextDepartmentId)) || null;
                          const nextTeamId = nextDepartment?.teams?.[0]?._id ? String(nextDepartment.teams[0]._id) : '';
                          setManageDepartmentId(nextDepartmentId); setManageTeamId(nextTeamId);
                        }} className="mt-1 w-full rounded-xl border border-slate-800 bg-[#040f2a] px-3 py-2 text-white">
                          {manageDepartments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
                        </select>
                      </label>
                      <label className="text-sm text-gray-300">Team
                        <select value={manageTeamId} onChange={(e) => setManageTeamId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-800 bg-[#040f2a] px-3 py-2 text-white">
                          {manageTeams.map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
                        </select>
                      </label>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3">
                        <button
                          type="button"
                          onClick={openCreateDivisionModal}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Tạo khối
                        </button>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3">
                        <button
                          type="button"
                          onClick={openCreateDepartmentModal}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Tạo phòng ban
                        </button>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3">
                        <button
                          type="button"
                          onClick={openCreateTeamModal}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Mở form tạo team
                        </button>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3">
                        <button
                          type="button"
                          onClick={openCreateChannelModal}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Mở form tạo kênh
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3"><div className="mb-2 text-sm font-semibold text-white">Đổi tên khối</div><div className="flex gap-2"><input value={renameDivisionName} onChange={(e) => setRenameDivisionName(e.target.value)} placeholder={manageDivision?.name || 'Tên mới'} className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white" /><button type="button" onClick={handleRenameDivision} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Lưu</button></div></div>
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3"><div className="mb-2 text-sm font-semibold text-white">Đổi tên phòng ban</div><div className="flex gap-2"><input value={renameDepartmentName} onChange={(e) => setRenameDepartmentName(e.target.value)} placeholder={manageDepartment?.name || 'Tên mới'} className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white" /><button type="button" onClick={handleRenameDepartment} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Lưu</button></div></div>
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3"><div className="mb-2 text-sm font-semibold text-white">Đổi tên team</div><div className="flex gap-2"><input value={renameTeamName} onChange={(e) => setRenameTeamName(e.target.value)} placeholder={manageTeam?.name || 'Tên mới'} className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white" /><button type="button" onClick={handleRenameTeam} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Lưu</button></div></div>
                      <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3"><div className="mb-2 text-sm font-semibold text-white">Đổi tên kênh</div><div className="mb-2 flex gap-2"><select value={renameChannelId} onChange={(e) => { const nextId = e.target.value; const ch = manageChannels.find((c) => String(c._id) === String(nextId)); setRenameChannelId(nextId); setRenameChannelName(ch?.name || ''); }} className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white"><option value="">Chọn kênh</option>{manageChannels.map((channel) => <option key={`${channel._id}-${channel.__scope || 'team'}`} value={channel._id}>[{channel.__scope === 'division' ? 'Khối' : channel.__scope === 'department' ? 'Phòng' : 'Team'}] {channel.name}</option>)}</select><input value={renameChannelName} onChange={(e) => setRenameChannelName(e.target.value)} placeholder="Tên mới" className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white" /><button type="button" onClick={handleRenameChannel} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">Lưu</button></div></div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-[#040f2a] p-3">
                      <div className="mb-2 text-sm font-semibold text-white">Phân quyền kênh liên phòng (ACL)</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <select
                          value={accessUserId}
                          onChange={(e) => setAccessUserId(e.target.value)}
                          className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-white"
                        >
                          <option value="">Chọn thành viên</option>
                          {orgMembers.map((member) => (
                            <option key={member._id} value={member?.user?._id || member?.user}>
                              {member?.user?.displayName ||
                                member?.user?.fullName ||
                                member?.user?.username ||
                                String(member.user)}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-4 text-xs text-gray-300">
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={accessCanRead} onChange={(e) => setAccessCanRead(e.target.checked)} />
                            Read
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={accessCanWrite} onChange={(e) => setAccessCanWrite(e.target.checked)} />
                            Write
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={accessCanVoice} onChange={(e) => setAccessCanVoice(e.target.checked)} />
                            Voice
                          </label>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleGrantChannelAccess}
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
                        >
                          Cấp quyền
                        </button>
                      </div>
                      <div className="mt-3 space-y-1">
                        {accessRows.map((row) => (
                          <div
                            key={`${row.user}-${row.channel || 'c'}`}
                            className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-xs text-gray-200"
                          >
                            <span>
                              {String(row.user)} — R:{row.permissions?.canRead ? 'Y' : 'N'} W:
                              {row.permissions?.canWrite ? 'Y' : 'N'} V:
                              {row.permissions?.canVoice ? 'Y' : 'N'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRevokeChannelAccess(row.user)}
                              className="text-red-300 hover:text-red-200"
                            >
                              Gỡ
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          )}

          {isFullAccess && activeTab === 'join' && (
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-3 text-xl font-bold text-white">Form gia nhập (link mời)</h3>
                <p className="mb-2 text-sm text-gray-400">
                  Khi bật, người dùng phải điền form trước khi vào tổ chức. Bạn có thể thêm trường ngắn, đoạn
                  văn hoặc một lựa chọn.
                </p>
                {orgId && (
                  <p className="mb-4 text-sm">
                    <Link
                      to={`/organizations/join/${orgId}?name=${encodeURIComponent(organization?.name || '')}`}
                      className="text-cyan-400 hover:underline"
                    >
                      Mở trang đơn gia nhập (xem trước)
                    </Link>
                  </p>
                )}
                {joinFormLoading ? (
                  <p className="text-sm text-gray-500">Đang tải…</p>
                ) : (
                  <div className="space-y-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={joinFormEnabled}
                        onChange={(e) => setJoinFormEnabled(e.target.checked)}
                        className="h-4 w-4 rounded"
                      />
                      Bật form gia nhập
                    </label>
                    <div>
                      <label className="mb-1 block text-sm text-gray-300">Vai trò khi duyệt</label>
                      <select
                        value={joinFormDefaultRole}
                        onChange={(e) => setJoinFormDefaultRole(e.target.value)}
                        className="w-full max-w-xs rounded-xl border border-slate-800 bg-[#040f2a] px-3 py-2 text-white"
                      >
                        <option value="member">Thành viên</option>
                        <option value="admin">Quản trị viên</option>
                      </select>
                    </div>
                    <div className="space-y-3">
                      {joinFormFields.map((f, idx) => (
                        <div
                          key={f.id || idx}
                          className="rounded-xl border border-slate-800 bg-[#040f2a] p-3 space-y-2"
                        >
                          <div className="grid gap-2 md:grid-cols-2">
                            <input
                              value={f.label}
                              onChange={(e) => updateJoinField(idx, { label: e.target.value })}
                              placeholder="Nhãn câu hỏi"
                              className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-sm text-white"
                            />
                            <input
                              value={f.id}
                              onChange={(e) => updateJoinField(idx, { id: e.target.value.trim() })}
                              placeholder="id (vd: full_name)"
                              className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <select
                              value={f.type}
                              onChange={(e) => {
                                const nextType = e.target.value;
                                const needsOptions = ['single_choice', 'radio', 'checkbox'].includes(
                                  nextType
                                );
                                updateJoinField(idx, {
                                  type: nextType,
                                  options: needsOptions ? joinCreateEmptyOptionsForType(nextType) : [],
                                });
                              }}
                              className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-sm text-white"
                            >
                              <option value="short_text">Một dòng</option>
                              <option value="long_text">Đoạn văn</option>
                              <option value="single_choice">Chọn một (dropdown)</option>
                              <option value="radio">Radio (một lựa chọn)</option>
                              <option value="checkbox">Checkbox (nhiều lựa chọn)</option>
                            </select>
                            <label className="flex items-center gap-1 text-xs text-gray-400">
                              <input
                                type="checkbox"
                                checked={Boolean(f.required)}
                                onChange={(e) => updateJoinField(idx, { required: e.target.checked })}
                              />
                              Bắt buộc
                            </label>
                            <button
                              type="button"
                              onClick={() => removeJoinField(idx)}
                              className="ml-auto text-xs text-red-400 hover:underline"
                            >
                              Xóa trường
                            </button>
                          </div>
                          {['single_choice', 'radio', 'checkbox'].includes(f.type) && (
                            <div className="space-y-2 border-t border-white/5 pt-3">
                              <p className="text-xs text-gray-500">
                                Lựa chọn — tối đa {JOIN_CHOICE_MAX} ô (tối thiểu {JOIN_CHOICE_MIN} giá trị có nội
                                dung khi lưu).
                              </p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {joinPadOptionsForDisplay(f.type, f.options).map((opt, optIdx) => (
                                  <input
                                    key={optIdx}
                                    value={opt}
                                    onChange={(e) => {
                                      const padded = joinPadOptionsForDisplay(f.type, f.options);
                                      padded[optIdx] = e.target.value;
                                      updateJoinField(idx, { options: padded });
                                    }}
                                    placeholder={`Lựa chọn ${optIdx + 1}`}
                                    className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1.5 text-sm text-white placeholder:text-gray-600"
                                  />
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    joinPadOptionsForDisplay(f.type, f.options).length >= JOIN_CHOICE_MAX
                                  }
                                  onClick={() => {
                                    const padded = joinPadOptionsForDisplay(f.type, f.options);
                                    if (padded.length >= JOIN_CHOICE_MAX) return;
                                    updateJoinField(idx, { options: [...padded, ''] });
                                  }}
                                  className="text-xs font-medium text-cyan-400 hover:underline disabled:cursor-not-allowed disabled:text-gray-600"
                                >
                                  + Thêm lựa chọn
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    joinPadOptionsForDisplay(f.type, f.options).length <= JOIN_CHOICE_MIN
                                  }
                                  onClick={() => {
                                    const padded = joinPadOptionsForDisplay(f.type, f.options);
                                    if (padded.length <= JOIN_CHOICE_MIN) return;
                                    updateJoinField(idx, { options: padded.slice(0, -1) });
                                  }}
                                  className="text-xs text-gray-400 hover:text-red-300 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Xóa ô cuối
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addJoinField}
                        className="text-sm font-medium text-cyan-400 hover:underline"
                      >
                        + Thêm trường
                      </button>
                    </div>
                    <GradientButton
                      variant="primary"
                      onClick={handleSaveJoinForm}
                      disabled={joinFormSaving}
                    >
                      {joinFormSaving ? 'Đang lưu…' : 'Lưu form'}
                    </GradientButton>
                  </div>
                )}
              </GlassCard>

              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-2 text-sm font-semibold text-white">Đơn chờ duyệt</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  Danh sách đơn gia nhập cần bạn xử lý được gom tại{' '}
                  <span className="font-medium text-gray-200">Trang chủ tổ chức</span> (Organization
                  Home) để xem và duyệt thống nhất từ mọi tổ chức bạn quản trị.
                </p>
                <Link
                  to="/organizations"
                  className="mt-3 inline-block text-sm font-medium text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  Mở Trang chủ tổ chức →
                </Link>
              </GlassCard>
            </div>
          )}

          {isFullAccess && activeTab === 'roles' && (
            <div className="mx-auto max-w-6xl space-y-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white">Quản lý vai trò (RBAC)</h3>
                    <p className="mt-1 max-w-xl text-sm text-slate-400">
                      Bấm tên vai trò để xem quyền. Kéo thả giữa 4 cột: Điều hành → Khối → Phòng → Team.
                    </p>
                  </div>
                  <GradientButton variant="primary" onClick={openCreateRole} disabled={roleLoading}>
                    + Tạo vai trò
                  </GradientButton>
                </div>
                {roleEditorOpen && (
                  <div className="mb-5 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-[#040f2a] to-slate-950/80 p-5 shadow-lg shadow-violet-950/20">
                    <h4 className="mb-3 text-sm font-semibold text-violet-200">
                      {editingRoleId ? 'Chỉnh sửa vai trò' : 'Vai trò mới'}
                    </h4>
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-400">
                            Tên vai trò
                          </label>
                          <input
                            value={roleDraft.name}
                            onChange={(e) => setRoleDraft((p) => ({ ...p, name: e.target.value }))}
                            placeholder="VD: Trưởng phòng Dev"
                            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white placeholder:text-slate-500 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-400">
                            Cấp vai trò
                          </label>
                          <select
                            value={roleTier}
                            onChange={(e) => setRoleTier(e.target.value)}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-white focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                          >
                            {TIER_META.map((tier) => (
                              <option key={tier.id} value={tier.id}>
                                {tier.title} — {tier.hint}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Quyền cho vai trò
                          </span>
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20">
                            <input
                              type="checkbox"
                              checked={roleAllPermissions}
                              onChange={(e) => {
                                setRolePermissionState(
                                  e.target.checked ? fullPermissionState() : {}
                                );
                              }}
                              className="h-4 w-4 rounded border-slate-500 bg-slate-900 accent-violet-500"
                            />
                            Toàn quyền
                          </label>
                        </div>
                        <div className="space-y-2">
                          {PERMISSION_EDITOR_OPTIONS.map((group) => (
                            <div
                              key={group.resource}
                              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-950/40 px-3 py-2"
                            >
                              <span className="min-w-24 text-sm font-semibold text-white">{group.label}</span>
                              {group.actions.map((action) => {
                                const key = `${group.resource}:${action}`;
                                const checked = Boolean(rolePermissionState[key]);
                                return (
                                  <label
                                    key={key}
                                    className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-300"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(e) =>
                                        setRolePermissionState((prev) => ({
                                          ...prev,
                                          [key]: e.target.checked,
                                        }))
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-500 bg-slate-900"
                                    />
                                    {ACTION_LABEL[action] || action}
                                  </label>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-cyan-300/90">
                        Quyền hiện tại: {summarizePermissions(permissionEntriesFromState(rolePermissionState))}
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-gray-300"
                        onClick={() => {
                          setRoleEditorOpen(false);
                          setRolePermissionState({});
                          setRoleTier(TIER_DEPARTMENT);
                          setEditingRoleId(null);
                          setEditingRoleOriginalName('');
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 text-sm font-semibold text-white"
                        onClick={handleSaveRole}
                        disabled={roleLoading}
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                )}
                {roleLoading && roles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">Đang tải vai trò…</p>
                ) : roles.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-700 py-10 text-center text-sm text-slate-500">
                    Chưa có vai trò. Bấm &quot;+ Tạo vai trò&quot; để bắt đầu.
                  </p>
                ) : (
                  <RoleHierarchyKanban
                    roles={roles}
                    disabled={roleLoading}
                    onRoleNameClick={(role) => setRolePermissionsView(role)}
                    onEdit={openEditRole}
                    onDelete={(role) => requestDeleteRole(role.id || role._id)}
                    onHierarchyPersist={persistRoleHierarchy}
                  />
                )}
              </GlassCard>

              <RolePermissionsViewModal
                role={rolePermissionsView}
                isOpen={Boolean(rolePermissionsView)}
                onClose={() => setRolePermissionsView(null)}
                onEdit={(role) => {
                  setRolePermissionsView(null);
                  openEditRole(role);
                }}
              />
            </div>
          )}

          {isFullAccess && activeTab === 'security' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Chính sách bảo mật</h3>
              <div className="space-y-2">
                {securitySettings.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4"
                  >
                    <span>{s.label}</span>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={() => handleToggleSecurity(s.id)}
                      className="h-5 w-5 rounded"
                    />
                  </label>
                ))}
              </div>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'integrations' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Tích hợp</h3>
              <div className="grid grid-cols-2 gap-3">
                {integrations.map((i) => (
                  <div key={i.id} className="rounded-xl border border-slate-800 bg-[#040f2a] p-4">
                    <div className="text-2xl">{i.icon}</div>
                    <div className="font-semibold text-white">{i.name}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'billing' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-2 text-xl font-bold text-white">Thanh toán</h3>
              <p className="text-sm text-gray-400">Quản lý gói cước và hóa đơn — bản demo.</p>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'audit' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-2 text-xl font-bold text-white">Nhật ký hoạt động</h3>
              <p className="text-sm text-gray-400">Nhật ký audit sẽ hiển thị khi backend cung cấp API.</p>
            </GlassCard>
          )}

          {/* ——— Member ——— */}
          {!isFullAccess && activeTab === 'profile' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Thông tin trong tổ chức</h3>
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-4xl">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    '👤'
                  )}
                </div>
                <label className="inline-flex cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <span className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white">
                    Đổi avatar
                  </span>
                </label>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Họ và tên</label>
                  <input
                    value={userProfileForm.fullName}
                    onChange={(e) =>
                      setUserProfileForm((p) => ({ ...p, fullName: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Email</label>
                  <input
                    value={user?.email || ''}
                    disabled
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a]/60 px-4 py-3 text-gray-400"
                  />
                </div>
                <GradientButton variant="primary" onClick={handleSaveUserProfile}>
                  Lưu thay đổi
                </GradientButton>
              </div>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'notifications' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Thông báo (tổ chức)</h3>
              <div className="space-y-2">
                {notificationSettings.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4"
                  >
                    <span>{s.label}</span>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={() => handleToggleNotification(s.id)}
                      className="h-5 w-5 rounded"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 text-sm text-indigo-400 hover:underline"
                onClick={() => {
                  persistMemberPrefs();
                  toast.success('Đã lưu cài đặt thông báo');
                }}
              >
                Lưu cài đặt thông báo
              </button>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'privacy' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Quyền riêng tư</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Hiển thị trạng thái online</label>
                  <select
                    value={privacySettings.onlineStatus}
                    onChange={(e) =>
                      setPrivacySettings((p) => ({ ...p, onlineStatus: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white"
                  >
                    <option>Mọi người</option>
                    <option>Chỉ đồng nghiệp</option>
                    <option>Không ai</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Ai có thể nhắn tin cho tôi</label>
                  <select
                    value={privacySettings.directMessagePermission}
                    onChange={(e) =>
                      setPrivacySettings((p) => ({
                        ...p,
                        directMessagePermission: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white"
                  >
                    <option>Mọi người</option>
                    <option>Chỉ đồng nghiệp</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="text-sm text-indigo-400 hover:underline"
                  onClick={() => {
                    persistMemberPrefs();
                    toast.success('Đã lưu quyền riêng tư');
                  }}
                >
                  Lưu
                </button>
              </div>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'appearance' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Giao diện</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'dark', name: 'Tối', icon: '🌙' },
                  { id: 'light', name: 'Sáng', icon: '☀️' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setThemeMode(t.id);
                      persistMemberPrefs();
                      toast.success(`Đã chọn giao diện ${t.name.toLowerCase()}`);
                    }}
                    className={`rounded-xl p-6 text-left transition-all ${
                      themeMode === t.id
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600'
                        : 'border border-slate-800 bg-[#040f2a] hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="mb-2 text-4xl">{t.icon}</div>
                    <div className="font-bold text-white">{t.name}</div>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={createDivisionModalOpen}
        onClose={() => setCreateDivisionModalOpen(false)}
        title="Tạo khối"
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-slate-100">
          <label className="block text-sm text-gray-300">
            Chi nhánh
            <select
              value={createDivisionBranchId}
              onChange={(e) => setCreateDivisionBranchId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Tên khối
            <input
              value={createDivisionName}
              onChange={(e) => setCreateDivisionName(e.target.value)}
              placeholder="Tên khối"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDivisionModalOpen(false)}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-gray-200"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCreateDivision}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createDepartmentModalOpen}
        onClose={() => setCreateDepartmentModalOpen(false)}
        title="Tạo phòng ban"
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-slate-100">
          <label className="block text-sm text-gray-300">
            Chi nhánh
            <select
              value={createDepartmentBranchId}
              onChange={(e) => {
                const nextBranchId = e.target.value;
                const nextBranch = resolveBranchById(nextBranchId);
                const nextDivisionId = nextBranch?.divisions?.[0]?._id
                  ? String(nextBranch.divisions[0]._id)
                  : '';
                setCreateDepartmentBranchId(nextBranchId);
                setCreateDepartmentDivisionId(nextDivisionId);
              }}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Khối
            <select
              value={createDepartmentDivisionId}
              onChange={(e) => setCreateDepartmentDivisionId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {createDepartmentDivisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Tên phòng ban
            <input
              value={createDepartmentName}
              onChange={(e) => setCreateDepartmentName(e.target.value)}
              placeholder="Tên phòng ban"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDepartmentModalOpen(false)}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-gray-200"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCreateDepartment}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createTeamModalOpen}
        onClose={() => setCreateTeamModalOpen(false)}
        title="Tạo team"
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-slate-100">
          <label className="block text-sm text-gray-300">
            Chi nhánh
            <select
              value={createTeamBranchId}
              onChange={(e) => {
                const nextBranchId = e.target.value;
                const nextBranch = resolveBranchById(nextBranchId);
                const nextDivisionId = nextBranch?.divisions?.[0]?._id
                  ? String(nextBranch.divisions[0]._id)
                  : '';
                const nextDepartmentId = nextBranch?.divisions?.[0]?.departments?.[0]?._id
                  ? String(nextBranch.divisions[0].departments[0]._id)
                  : '';
                setCreateTeamBranchId(nextBranchId);
                setCreateTeamDivisionId(nextDivisionId);
                setCreateTeamDepartmentId(nextDepartmentId);
              }}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Khối
            <select
              value={createTeamDivisionId}
              onChange={(e) => {
                const nextDivisionId = e.target.value;
                const nextDivision = createTeamDivisions.find(
                  (d) => String(d._id) === String(nextDivisionId)
                );
                const nextDepartmentId = nextDivision?.departments?.[0]?._id
                  ? String(nextDivision.departments[0]._id)
                  : '';
                setCreateTeamDivisionId(nextDivisionId);
                setCreateTeamDepartmentId(nextDepartmentId);
              }}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {createTeamDivisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Phòng ban
            <select
              value={createTeamDepartmentId}
              onChange={(e) => setCreateTeamDepartmentId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {createTeamDepartments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Tên team
            <input
              value={createTeamName}
              onChange={(e) => setCreateTeamName(e.target.value)}
              placeholder="Tên team"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateTeamModalOpen(false)}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-gray-200"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCreateTeam}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        title="Tạo kênh"
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-slate-100">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm text-gray-300">
              Loại kênh
              <select
                value={createChannelType}
                onChange={(e) => setCreateChannelType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
              >
                <option value="chat">Chat</option>
                <option value="voice">Voice</option>
              </select>
            </label>
            <label className="block text-sm text-gray-300">
              Cấp tạo
              <select
                value={createChannelLevel}
                onChange={(e) => setCreateChannelLevel(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
              >
                <option value="division">Khối</option>
                <option value="department">Phòng ban</option>
                <option value="team">Team</option>
              </select>
            </label>
          </div>

          <label className="block text-sm text-gray-300">
            Chi nhánh
            <select
              value={createChannelBranchId}
              onChange={(e) => {
                const nextBranchId = e.target.value;
                const nextBranch = resolveBranchById(nextBranchId);
                const nextDivisionId = nextBranch?.divisions?.[0]?._id
                  ? String(nextBranch.divisions[0]._id)
                  : '';
                const nextDepartmentId = nextBranch?.divisions?.[0]?.departments?.[0]?._id
                  ? String(nextBranch.divisions[0].departments[0]._id)
                  : '';
                const nextTeamId = nextBranch?.divisions?.[0]?.departments?.[0]?.teams?.[0]?._id
                  ? String(nextBranch.divisions[0].departments[0].teams[0]._id)
                  : '';
                setCreateChannelBranchId(nextBranchId);
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Khối
            <select
              value={createChannelDivisionId}
              onChange={(e) => {
                const nextDivisionId = e.target.value;
                const nextDivision = createChannelDivisions.find(
                  (d) => String(d._id) === String(nextDivisionId)
                );
                const nextDepartmentId = nextDivision?.departments?.[0]?._id
                  ? String(nextDivision.departments[0]._id)
                  : '';
                const nextTeamId = nextDivision?.departments?.[0]?.teams?.[0]?._id
                  ? String(nextDivision.departments[0].teams[0]._id)
                  : '';
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            >
              {createChannelDivisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Phòng ban
            <select
              value={createChannelDepartmentId}
              onChange={(e) => {
                const nextDepartmentId = e.target.value;
                const nextDepartment = createChannelDepartments.find(
                  (d) => String(d._id) === String(nextDepartmentId)
                );
                const nextTeamId = nextDepartment?.teams?.[0]?._id
                  ? String(nextDepartment.teams[0]._id)
                  : '';
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              disabled={createChannelLevel === 'division'}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white disabled:opacity-50"
            >
              {createChannelDepartments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Team
            <select
              value={createChannelTeamId}
              onChange={(e) => setCreateChannelTeamId(e.target.value)}
              disabled={createChannelLevel !== 'team'}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white disabled:opacity-50"
            >
              {createChannelTeams.map((team) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-gray-300">
            Tên kênh
            <input
              value={createChannelName}
              onChange={(e) => setCreateChannelName(e.target.value)}
              placeholder="Tên kênh"
              className="mt-1 w-full rounded-xl border border-slate-700 bg-[#040f2a] px-3 py-2 text-white"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateChannelModalOpen(false)}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-gray-200"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCreateChannel}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteOrgModalOpen}
        onClose={closeDeleteOrgModal}
        title="Xóa tổ chức vĩnh viễn?"
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-4 text-slate-100">
          <p className="text-sm text-gray-300">
            Hành động này vô hiệu hóa tổ chức và không thể hoàn tác từ giao diện này.
          </p>
          <div className="rounded-xl border border-white/10 bg-[#040f2a] px-3 py-2 text-sm">
            <span className="text-gray-400">Tên tổ chức: </span>
            <span className="font-semibold text-white">{expectedOrgNameForDelete || '—'}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Nhập tên tổ chức để xác nhận.
            </label>
            <input
              type="text"
              value={deleteOrgNameInput}
              onChange={(e) => setDeleteOrgNameInput(e.target.value)}
              placeholder="Nhập tên tổ chức"
              autoComplete="off"
              disabled={deletingOrg}
              className="w-full rounded-xl border border-slate-700 bg-[#040f2a] px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeDeleteOrgModal}
              disabled={deletingOrg}
              className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/5 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteOrganization}
              disabled={!deleteNameMatches || deletingOrg || !expectedOrgNameForDelete}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300"
            >
              {deletingOrg ? 'Đang xóa…' : 'Xóa tổ chức'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={roleDeleteConfirmId != null}
        onClose={() => setRoleDeleteConfirmId(null)}
        onConfirm={confirmDeleteRole}
        title="Xóa vai trò"
        message="Xóa vai trò này?"
        confirmText="Xóa"
        cancelText="Hủy"
      />
    </>
  );
}

export default OrganizationSettingsPanel;
