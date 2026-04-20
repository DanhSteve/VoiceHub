import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { ConfirmDialog, GlassCard, GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

const isValidMongoObjectId = (s) =>
  typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);

const SECURITY_LABEL_KEYS = {
  '2fa': 'sec2fa',
  'strong-password': 'secStrongPwd',
  'auto-logout': 'secAutoLogout',
  'block-unknown-ip': 'secBlockIp',
  'new-device-email': 'secNewDevice',
};

const NOTIF_LABEL_KEYS = {
  'new-message': 'notifNewMsg',
  mention: 'notifMention',
  'new-task': 'notifNewTask',
  deadline: 'notifDeadline',
  email: 'notifEmail',
  'mobile-push': 'notifPush',
};

function SettingsPage() {
  const { t, locale } = useAppStrings();
  const { user, updateUser } = useAuth();
  const { isDarkMode, toggleTheme, fontScale, setFontScale } = useTheme();
  const [activeTab, setActiveTab] = useState('general');
  const [apiKeyDeleteConfirm, setApiKeyDeleteConfirm] = useState(null);
  const [roleDeleteConfirm, setRoleDeleteConfirm] = useState(null);
  const [userRole, setUserRole] = useState('admin'); // 'admin', 'manager', 'user'
  const [organizationForm, setOrganizationForm] = useState({
    name: 'VoiceHub Tech',
    description: 'Leading technology company focused on communication solutions.',
    website: 'https://voicehub.com',
    contactEmail: 'contact@voicehub.com',
  });
  const [userProfileForm, setUserProfileForm] = useState({
    fullName: 'John Doe',
    phone: '+84 123 456 789',
  });
  const [apiKeys, setApiKeys] = useState([
    { id: 'k1', name: 'Production API Key', created: '15/12/2025', lastUsed: '2 giờ trước', value: 'vh_prod_xxxxxxxxxxxx' },
    { id: 'k2', name: 'Development API Key', created: '10/01/2026', lastUsed: '1 ngày trước', value: 'vh_dev_xxxxxxxxxxxx' },
  ]);
  const [integrations, setIntegrations] = useState([
    { id: 'slack', name: 'Slack', icon: '💬', connected: true, color: 'from-cyan-600 to-teal-600' },
    { id: 'gdrive', name: 'Google Drive', icon: '📁', connected: false, color: 'from-blue-500 to-cyan-500' },
    { id: 'github', name: 'GitHub', icon: '🐙', connected: true, color: 'from-green-500 to-emerald-500' },
    { id: 'jira', name: 'Jira', icon: '📊', connected: false, color: 'from-orange-500 to-yellow-500' },
  ]);
  const [securitySettings, setSecuritySettings] = useState([
    { id: '2fa', checked: true },
    { id: 'strong-password', checked: true },
    { id: 'auto-logout', checked: false },
    { id: 'block-unknown-ip', checked: false },
    { id: 'new-device-email', checked: true },
  ]);
  const [notificationSettings, setNotificationSettings] = useState([
    { id: 'new-message', checked: true },
    { id: 'mention', checked: true },
    { id: 'new-task', checked: true },
    { id: 'deadline', checked: true },
    { id: 'email', checked: false },
    { id: 'mobile-push', checked: true },
  ]);
  const [privacySettings, setPrivacySettings] = useState({
    onlineStatus: 'everyone',
    directMessagePermission: 'everyone',
  });
  const [avatarUrl, setAvatarUrl] = useState('');
  const [roles, setRoles] = useState([
    { id: 'r1', name: 'Administrator', members: 3, permissions: 'Full access', color: 'from-red-500 to-orange-500', icon: '👑' },
    { id: 'r2', name: 'Department lead', members: 4, permissions: 'Manage department', color: 'from-cyan-600 to-teal-600', icon: '👔' },
    { id: 'r3', name: 'Team lead', members: 8, permissions: 'Manage team', color: 'from-blue-500 to-cyan-500', icon: '👨‍💼' },
    { id: 'r4', name: 'Member', members: 30, permissions: 'Basic', color: 'from-green-500 to-emerald-500', icon: '👷' },
  ]);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  /** Mongo ObjectId tổ chức đầu tiên — dùng cho roles API (không dùng placeholder kiểu org_123). */
  const [roleContextOrganizationId, setRoleContextOrganizationId] = useState(null);
  const [roleDraft, setRoleDraft] = useState({
    name: '',
    permissions: '',
    members: 0,
    color: 'from-cyan-600 to-teal-600',
    icon: '🧩'
  });

  /* ----- LOAD ROLES ON MOUNT ----- */
  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    const orgData = localStorage.getItem('settings:organization');
    const userProfileData = localStorage.getItem('settings:userProfile');
    const apiKeyData = localStorage.getItem('settings:apiKeys');
    const integrationData = localStorage.getItem('settings:integrations');
    const securityData = localStorage.getItem('settings:security');
    const notificationData = localStorage.getItem('settings:notifications');
    const privacyData = localStorage.getItem('settings:privacy');
    const avatarData = localStorage.getItem('settings:avatar');

    if (orgData) setOrganizationForm(JSON.parse(orgData));
    if (userProfileData) setUserProfileForm(JSON.parse(userProfileData));
    if (apiKeyData) setApiKeys(JSON.parse(apiKeyData));
    if (integrationData) setIntegrations(JSON.parse(integrationData));
    if (securityData) {
      try {
        const parsed = JSON.parse(securityData);
        if (Array.isArray(parsed)) {
          setSecuritySettings(parsed.map((x) => ({ id: x.id, checked: Boolean(x.checked) })));
        }
      } catch {
        /* ignore */
      }
    }
    if (notificationData) {
      try {
        const parsed = JSON.parse(notificationData);
        if (Array.isArray(parsed)) {
          setNotificationSettings(parsed.map((x) => ({ id: x.id, checked: Boolean(x.checked) })));
        }
      } catch {
        /* ignore */
      }
    }
    if (privacyData) {
      try {
        const p = JSON.parse(privacyData);
        const mapPrivacy = (v, keys) => {
          if (keys.includes(v)) return v;
          if (v === 'Mọi người' || v === 'everyone') return 'everyone';
          if (v === 'Chỉ đồng nghiệp' || v === 'colleagues') return 'colleagues';
          if (v === 'Không ai' || v === 'nobody') return 'nobody';
          return 'everyone';
        };
        setPrivacySettings({
          onlineStatus: mapPrivacy(p.onlineStatus, ['everyone', 'colleagues', 'nobody']),
          directMessagePermission: mapPrivacy(p.directMessagePermission, ['everyone', 'colleagues']),
        });
      } catch {
        /* ignore */
      }
    }
    if (avatarData) setAvatarUrl(avatarData);
  }, []);

  const fetchRoles = async () => {
    try {
      setRoleLoading(true);
      const orgPayload = await organizationAPI.getOrganizations();
      const orgListRaw = orgPayload?.data ?? orgPayload;
      const orgs = Array.isArray(orgListRaw) ? orgListRaw : [];
      const first = orgs[0];
      const oid = first?._id ?? first?.id;
      const idStr = oid != null ? String(oid) : '';
      if (!isValidMongoObjectId(idStr)) {
        setRoleContextOrganizationId(null);
        return;
      }
      setRoleContextOrganizationId(idStr);
      const response = await roleAPI.getRolesByOrganization(idStr);
      const raw = response?.data ?? response;
      const data = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      if (data.length > 0) setRoles(data);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Settings: roles fetch skipped', err?.message);
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setUserProfileForm({
      fullName: user?.displayName || user?.fullName || user?.name || t('settingsPage.userFallback'),
      phone: user?.phone || '',
    });
  }, [user, t]);

  useEffect(() => {
    localStorage.setItem('settings:apiKeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem('settings:integrations', JSON.stringify(integrations));
  }, [integrations]);

  useEffect(() => {
    localStorage.setItem('settings:security', JSON.stringify(securitySettings));
  }, [securitySettings]);

  useEffect(() => {
    localStorage.setItem('settings:notifications', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  useEffect(() => {
    localStorage.setItem('settings:privacy', JSON.stringify(privacySettings));
  }, [privacySettings]);

  useEffect(() => {
    if (!avatarUrl) return;
    localStorage.setItem('settings:avatar', avatarUrl);
  }, [avatarUrl]);

  useEffect(() => {
    const nextTab = userRole === 'admin' ? 'general' : 'profile';
    setActiveTab(nextTab);
  }, [userRole]);

  const handleSaveOrganization = () => {
    localStorage.setItem('settings:organization', JSON.stringify(organizationForm));
    toast.success(t('settingsPage.toastSaveOrg'));
  };

  const handleSaveUserProfile = () => {
    updateUser({ displayName: userProfileForm.fullName, phone: userProfileForm.phone });
    localStorage.setItem('settings:userProfile', JSON.stringify(userProfileForm));
    toast.success(t('settingsPage.toastSaveProfile'));
  };

  const handleCopyApiKey = async (keyValue) => {
    try {
      await navigator.clipboard.writeText(keyValue);
      toast.success(t('settingsPage.toastCopyKey'));
    } catch (error) {
      toast.error(t('settingsPage.toastCopyFail'));
    }
  };

  const requestDeleteApiKey = (keyId) => {
    setApiKeyDeleteConfirm(keyId);
  };

  const confirmDeleteApiKey = () => {
    if (!apiKeyDeleteConfirm) return;
    setApiKeys((prev) => prev.filter((item) => item.id !== apiKeyDeleteConfirm));
    toast.success(t('settingsPage.toastDeleteKey'));
  };

  const handleCreateApiKey = () => {
    const id = `k${Date.now()}`;
    const keyValue = `vh_${id}_${Math.random().toString(36).slice(2, 10)}`;
    setApiKeys((prev) => [
      {
        id,
        name: t('settingsPage.apiKeyGeneratedName', { n: prev.length + 1 }),
        created: new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN'),
        lastUsed: t('settingsPage.apiKeyNeverUsed'),
        value: keyValue,
      },
      ...prev,
    ]);
    toast.success(t('settingsPage.toastCreateKey'));
  };

  const handleToggleIntegration = (integrationId) => {
    setIntegrations((prev) => prev.map((item) => (
      item.id === integrationId ? { ...item, connected: !item.connected } : item
    )));
  };

  const handleToggleSecuritySetting = (settingId) => {
    setSecuritySettings((prev) => prev.map((item) => (
      item.id === settingId ? { ...item, checked: !item.checked } : item
    )));
  };

  const handleToggleNotificationSetting = (settingId) => {
    setNotificationSettings((prev) => prev.map((item) => (
      item.id === settingId ? { ...item, checked: !item.checked } : item
    )));
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setAvatarUrl(result);
      toast.success(t('settingsPage.toastAvatar'));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleExportAuditLog = () => {
    const content = [
      'AUDIT LOG - VoiceHub',
      `Exported at: ${new Date().toISOString()}`,
      '---',
      'Admin - Tạo vai trò Trưởng Nhóm Mới',
      'Sarah Chen - Cập nhật thông tin tổ chức',
      'Mike Ross - Mời thành viên mới',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voicehub-audit-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('settingsPage.toastExportAudit'));
  };

  const handleExportInvoice = () => {
    const content = [
      'VOICEHUB INVOICE SUMMARY',
      `Generated at: ${new Date().toISOString()}`,
      'Plan: Enterprise',
      'Members: 45',
      'Storage: 45.8GB / 100GB',
      'Monthly fee: 12,500,000 VND',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voicehub-invoice-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('settingsPage.toastExportInvoice'));
  };

  const handleContactBilling = () => {
    window.location.href = 'mailto:billing@voicehub.com?subject=Yeu%20cau%20ho%20tro%20thanh%20toan';
  };

  const adminTabs = useMemo(
    () => [
      { id: 'general', label: t('settingsPage.tabGeneral'), icon: '⚙️' },
      { id: 'roles', label: t('settingsPage.tabRoles'), icon: '🔐' },
      { id: 'security', label: t('settingsPage.tabSecurity'), icon: '🛡️' },
      { id: 'integrations', label: t('settingsPage.tabIntegrations'), icon: '🔗' },
      { id: 'billing', label: t('settingsPage.tabBilling'), icon: '💳' },
      { id: 'audit', label: t('settingsPage.tabAudit'), icon: '📜' },
    ],
    [t]
  );

  const userTabs = useMemo(
    () => [
      { id: 'profile', label: t('settingsPage.tabProfile'), icon: '👤' },
      { id: 'notifications', label: t('settingsPage.tabNotifications'), icon: '🔔' },
      { id: 'privacy', label: t('settingsPage.tabPrivacy'), icon: '🔒' },
      { id: 'appearance', label: t('settingsPage.tabAppearance'), icon: '🎨' },
    ],
    [t]
  );

  const currentTabs = userRole === 'admin' ? adminTabs : userTabs;

  const openCreateRoleEditor = () => {
    setEditingRoleId(null);
    setRoleDraft({
      name: '',
      permissions: '',
      members: 0,
      color: 'from-cyan-600 to-teal-600',
      icon: '🧩'
    });
    setRoleEditorOpen(true);
  };

  const openEditRoleEditor = (role) => {
    setEditingRoleId(role.id);
    setRoleDraft({
      name: role.name,
      permissions: role.permissions,
      members: role.members,
      color: role.color,
      icon: role.icon
    });
    setRoleEditorOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleDraft.name.trim() || !roleDraft.permissions.trim()) {
      toast.error(t('settingsPage.toastRoleFill'));
      return;
    }

    try {
      setRoleLoading(true);
      if (editingRoleId) {
        // Update existing role
        await roleAPI.updateRole(editingRoleId, {
          name: roleDraft.name.trim(),
          permissions: roleDraft.permissions.trim(),
          color: roleDraft.color,
          icon: roleDraft.icon
        });
        setRoles((prev) => prev.map((role) => (
          role.id === editingRoleId
            ? { ...role, ...roleDraft, members: Number(roleDraft.members) || 0 }
            : role
        )));
        toast.success(t('settingsPage.toastRoleUpdated'));
      } else {
        if (!roleContextOrganizationId) {
          toast.error(t('settingsPage.toastRoleNoOrg'));
          return;
        }
        const response = await roleAPI.createRole({
          name: roleDraft.name.trim(),
          permissions: roleDraft.permissions.trim(),
          serverId: roleContextOrganizationId,
          organizationId: roleContextOrganizationId,
          color: roleDraft.color,
          icon: roleDraft.icon
        });
        const wrapped = response?.data ?? response;
        const newRole = wrapped?.data ?? wrapped;
        setRoles((prev) => [
          ...prev,
          {
            id: newRole?._id || newRole?.id || `r${Date.now()}`,
            name: roleDraft.name,
            permissions: roleDraft.permissions,
            members: 0,
            color: roleDraft.color,
            icon: roleDraft.icon
          }
        ]);
        toast.success(t('settingsPage.toastRoleCreated'));
      }
      setRoleEditorOpen(false);
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error(error?.message || t('settingsPage.toastRoleErr'));
    } finally {
      setRoleLoading(false);
    }
  };

  const requestDeleteRole = (roleId) => {
    setRoleDeleteConfirm(roleId);
  };

  const confirmDeleteRole = async () => {
    const roleId = roleDeleteConfirm;
    if (!roleId) return;
    try {
      setRoleLoading(true);
      await roleAPI.deleteRole(roleId);
      setRoles((prev) => prev.filter((role) => role.id !== roleId));
      toast.success(t('settingsPage.toastRoleDeleted'));
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error(error?.message || t('settingsPage.toastRoleDeleteErr'));
    } finally {
      setRoleLoading(false);
    }
  };

  const settingsShell = isDarkMode
    ? 'bg-[#050810] text-slate-100'
    : 'bg-gradient-to-b from-sky-100 via-cyan-50/70 to-slate-200 text-slate-900';
  const gc = isDarkMode ? 'border border-slate-800 bg-slate-900/60' : 'border border-slate-200 bg-white shadow-sm';
  /** Chuỗi class dùng chung — chế độ sáng: chữ slate, nền trắng/slate-50, viền nhạt */
  const st = {
    heading: isDarkMode ? 'text-white' : 'text-slate-900',
    muted: isDarkMode ? 'text-gray-400' : 'text-slate-600',
    label: isDarkMode ? 'text-gray-300' : 'text-slate-700',
    onSurface: isDarkMode ? 'text-white' : 'text-slate-800',
    input:
      'w-full rounded-xl border px-4 py-3 outline-none transition-colors ' +
      (isDarkMode
        ? 'border-slate-800 bg-[#040f2a] text-white placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25'
        : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20'),
    inputSm:
      'w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors ' +
      (isDarkMode
        ? 'border-slate-800 bg-slate-900/60 text-white focus:border-cyan-500'
        : 'border-slate-200 bg-white text-slate-900 shadow-sm focus:border-cyan-500'),
    inputDisabled:
      'w-full cursor-not-allowed rounded-xl border px-4 py-3 outline-none ' +
      (isDarkMode
        ? 'border-slate-800 bg-slate-900/40 text-slate-400'
        : 'border-slate-200 bg-slate-100 text-slate-500 shadow-inner'),
    panel: isDarkMode ? 'rounded-xl border border-slate-800 bg-[#040f2a]' : 'rounded-xl border border-slate-200 bg-slate-50 shadow-sm',
    panelLoose: isDarkMode ? 'rounded-xl border border-slate-700 bg-[#040f2a]' : 'rounded-xl border border-slate-200 bg-slate-50 shadow-sm',
    listRow: isDarkMode
      ? 'flex items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4'
      : 'flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
    settingRow: isDarkMode
      ? 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4 transition-all hover:bg-slate-800/70'
      : 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:bg-slate-50',
    ghostBtn: isDarkMode
      ? 'rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/80'
      : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50',
    outlineBtn: isDarkMode
      ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-2 font-semibold text-slate-100 transition-all hover:bg-slate-800/70'
      : 'rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50',
    select:
      'w-full rounded-xl border px-4 py-3 outline-none ' +
      (isDarkMode
        ? 'border-slate-800 bg-[#040f2a] text-white focus:border-cyan-500'
        : 'border-slate-200 bg-white text-slate-900 shadow-sm focus:border-cyan-500'),
    integrationCard: isDarkMode ? 'border border-slate-800 bg-slate-900/60' : 'border border-slate-200 bg-slate-50 shadow-sm',
    nestedBox: isDarkMode ? 'rounded-lg border border-slate-800 p-3' : 'rounded-lg border border-slate-200 bg-white p-3',
    accentInline: isDarkMode ? 'text-cyan-400' : 'text-cyan-700',
    roleTabInactive: isDarkMode
      ? 'border border-slate-800 bg-[#040f2a] text-gray-400 hover:bg-slate-800/70'
      : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50',
  };

  const auditEntries = useMemo(
    () => [
      { user: 'Admin', action: t('settingsPage.auditLog1'), time: t('settingsPage.timeMinAgo', { n: 5 }), type: 'create' },
      { user: 'Sarah Chen', action: t('settingsPage.auditLog2'), time: t('settingsPage.timeHourAgo', { n: 1 }), type: 'update' },
      { user: 'Mike Ross', action: t('settingsPage.auditLog3'), time: t('settingsPage.timeHourAgo', { n: 3 }), type: 'invite' },
      { user: 'Admin', action: t('settingsPage.auditLog4'), time: t('settingsPage.timeDayAgo', { n: 1 }), type: 'security' },
      { user: 'Emma Wilson', action: t('settingsPage.auditLog5'), time: t('settingsPage.timeDayAgo', { n: 2 }), type: 'delete' },
    ],
    [t]
  );

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className={`p-5 lg:p-6 min-h-full ${settingsShell}`}>
        {/* Role Switcher for demo */}
        <div className={`mb-6 rounded-xl border p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-white shadow-sm'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`mb-1 text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('settingsPage.demoModeTitle')}</h2>
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('settingsPage.demoModeSubtitle')}</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setUserRole('admin')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'admin'
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                    : st.roleTabInactive
                }`}
              >
                {t('settingsPage.roleAdmin')}
              </button>
              <button 
                onClick={() => setUserRole('manager')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'manager'
                    ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white'
                    : st.roleTabInactive
                }`}
              >
                {t('settingsPage.roleManager')}
              </button>
              <button 
                onClick={() => setUserRole('user')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'user'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                    : st.roleTabInactive
                }`}
              >
                {t('settingsPage.roleUser')}
              </button>
            </div>
          </div>
        </div>

        <h1 className={`mb-1 text-3xl font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          {userRole === 'admin' ? t('settingsPage.pageTitleOrg') : t('settingsPage.pageTitleUser')}
        </h1>
        <p className={`mb-8 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          {userRole === 'admin' ? t('settingsPage.pageSubtitleOrg') : t('settingsPage.pageSubtitleUser')}
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-gradient">
          {currentTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white'
                  : st.roleTabInactive
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Admin Tabs Content */}
        {userRole === 'admin' && (
        <>
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.orgInfoTitle')}</h3>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.orgName')}</label>
                  <input
                    type="text"
                    value={organizationForm.name}
                    onChange={(e) => setOrganizationForm((prev) => ({ ...prev, name: e.target.value }))}
                    className={st.input}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.orgDesc')}</label>
                  <textarea
                    className={st.input}
                    rows="3"
                    value={organizationForm.description}
                    onChange={(e) => setOrganizationForm((prev) => ({ ...prev, description: e.target.value }))}
                  ></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.website')}</label>
                    <input
                      type="url"
                      value={organizationForm.website}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, website: e.target.value }))}
                      className={st.input}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.contactEmail')}</label>
                    <input
                      type="email"
                      value={organizationForm.contactEmail}
                      onChange={(e) => setOrganizationForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
                      className={st.input}
                    />
                  </div>
                </div>
                <GradientButton 
                  variant="primary"
                  onClick={handleSaveOrganization}
                >
                  {t('settingsPage.saveChanges')}
                </GradientButton>
              </div>
            </GlassCard>

            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.quotaTitle')}</h3>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`text-sm ${st.muted}`}>{t('settingsPage.quotaMembersLabel')}</span>
                    <span className={`text-sm font-bold ${st.heading}`}>45 / 100</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-600 to-teal-600" style={{width: '45%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`text-sm ${st.muted}`}>{t('settingsPage.quotaStorageLabel')}</span>
                    <span className={`text-sm font-bold ${st.heading}`}>45.8 GB / 100 GB</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{width: '45.8%'}}></div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className="max-w-4xl">
            <GlassCard className={`mb-6 ${gc}`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${st.heading}`}>{t('settingsPage.rbacTitle')}</h3>
                <GradientButton 
                  variant="primary"
                  onClick={openCreateRoleEditor}
                  disabled={roleLoading}
                >
                  {t('settingsPage.createRole')}
                </GradientButton>
              </div>
              {roleEditorOpen && (
                <div className={`mb-4 p-4 ${st.panelLoose}`}>
                  <div className={`mb-3 text-sm font-semibold ${st.label}`}>
                    {editingRoleId ? t('settingsPage.editRolePanel') : t('settingsPage.createRolePanel')}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={roleDraft.name}
                      onChange={(event) => setRoleDraft((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder={t('settingsPage.roleNamePh')}
                      className={st.inputSm}
                    />
                    <input
                      value={roleDraft.permissions}
                      onChange={(event) => setRoleDraft((prev) => ({ ...prev, permissions: event.target.value }))}
                      placeholder={t('settingsPage.rolePermPh')}
                      className={st.inputSm}
                    />
                    <input
                      type="number"
                      min="0"
                      value={roleDraft.members}
                      onChange={(event) => setRoleDraft((prev) => ({ ...prev, members: event.target.value }))}
                      placeholder={t('settingsPage.roleMembersPh')}
                      className={st.inputSm}
                    />
                    <input
                      value={roleDraft.icon}
                      onChange={(event) => setRoleDraft((prev) => ({ ...prev, icon: event.target.value || '🧩' }))}
                      placeholder={t('settingsPage.roleIconPh')}
                      className={st.inputSm}
                    />
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => setRoleEditorOpen(false)} className={st.ghostBtn}>
                      {t('settingsPage.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveRole}
                      disabled={roleLoading}
                      className="rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {roleLoading ? t('settingsPage.savingRole') : t('settingsPage.saveRole')}
                    </button>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {roles.map((role) => (
                  <div key={role.id} className={st.listRow}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-2xl`}>
                        {role.icon}
                      </div>
                      <div>
                        <div className={`font-bold ${st.heading}`}>{role.name}</div>
                        <div className={`text-sm ${st.muted}`}>
                          {t('settingsPage.roleMeta', { n: role.members, perm: role.permissions })}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditRoleEditor(role)}
                        disabled={roleLoading}
                        className={`rounded-lg border px-4 py-2 text-sm transition-all disabled:opacity-50 ${
                          isDarkMode
                            ? 'border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800/70'
                            : 'border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50'
                        }`}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        onClick={() => requestDeleteRole(role.id)}
                        disabled={roleLoading}
                        className={`rounded-lg border px-4 py-2 text-sm transition-all disabled:opacity-50 ${
                          isDarkMode
                            ? 'border-slate-700 bg-slate-900/60 text-red-400 hover:bg-slate-800/70'
                            : 'border-slate-200 bg-white text-red-600 shadow-sm hover:bg-slate-50'
                        }`}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.securityPolicyTitle')}</h3>
              <div className="space-y-4">
                {[
                  ...securitySettings
                ].map((setting) => (
                  <label key={setting.id} className={st.settingRow}>
                    <span className={st.onSurface}>
                      {t(`settingsPage.${SECURITY_LABEL_KEYS[setting.id]}`)}
                    </span>
                    <input
                      type="checkbox"
                      checked={setting.checked}
                      onChange={() => handleToggleSecuritySetting(setting.id)}
                      className="w-5 h-5 rounded"
                    />
                  </label>
                ))}
              </div>
            </GlassCard>

            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.apiKeysTitle')}</h3>
              <p className={`mb-4 ${st.muted}`}>{t('settingsPage.apiKeysDesc')}</p>
              <div className="space-y-3 mb-4">
                {apiKeys.map((key) => (
                  <div key={key.id} className={st.listRow}>
                    <div>
                      <div className={`font-bold ${st.heading}`}>{key.name}</div>
                      <div className={`text-sm ${st.muted}`}>
                        {t('settingsPage.apiCreated')}: {key.created} • {t('settingsPage.apiLastUsed')}: {key.lastUsed}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyApiKey(key.value)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                          isDarkMode
                            ? 'border-slate-700 bg-slate-900/60 text-slate-100 hover:bg-slate-800/70'
                            : 'border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50'
                        }`}
                      >
                        {t('settingsPage.copy')}
                      </button>
                      <button
                        onClick={() => requestDeleteApiKey(key.id)}
                        className={`rounded-lg border px-3 py-2 text-sm transition-all ${
                          isDarkMode
                            ? 'border-slate-700 bg-slate-900/60 text-red-400 hover:bg-slate-800/70'
                            : 'border-slate-200 bg-white text-red-600 shadow-sm hover:bg-slate-50'
                        }`}
                      >
                        {t('settingsPage.delete')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <GradientButton variant="secondary" onClick={handleCreateApiKey}>{t('settingsPage.createApiKey')}</GradientButton>
            </GlassCard>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="max-w-4xl">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-6 ${st.heading}`}>{t('settingsPage.integrationsTitle')}</h3>
              <div className="grid grid-cols-2 gap-4">
                {integrations.map((integration) => (
                  <GlassCard key={integration.id} hover className={st.integrationCard}>
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center text-3xl mb-3`}>
                      {integration.icon}
                    </div>
                    <h4 className={`mb-1 font-bold ${st.heading}`}>{integration.name}</h4>
                    <p className={`mb-3 text-sm ${st.muted}`}>
                      {integration.connected ? t('settingsPage.integConnected') : t('settingsPage.integDisconnected')}
                    </p>
                    <button
                      onClick={() => {
                        handleToggleIntegration(integration.id);
                        toast.success(
                          integration.connected
                            ? t('settingsPage.integToastOff', { name: integration.name })
                            : t('settingsPage.integToastOn', { name: integration.name })
                        );
                      }}
                      className={`w-full rounded-lg py-2 text-sm font-semibold transition-all ${
                        integration.connected
                          ? isDarkMode
                            ? 'glass hover:bg-white/10'
                            : 'border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200'
                          : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-700 hover:to-teal-700'
                      }`}
                    >
                      {integration.connected ? t('settingsPage.integDisconnect') : t('settingsPage.integConnect')}
                    </button>
                  </GlassCard>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Billing Tab */}
        {activeTab === 'billing' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.billingCurrentPlan')}</h3>
              <div className={`p-4 ${st.panel}`}>
                <div className="mb-2 flex items-center justify-between">
                  <div className={`text-lg font-bold ${st.heading}`}>{t('settingsPage.planEnterprise')}</div>
                  <span className="rounded-full bg-gradient-to-r from-cyan-600 to-teal-600 px-3 py-1 text-xs font-bold text-white">
                    {t('settingsPage.planActive')}
                  </span>
                </div>
                <div className={`text-sm ${st.muted}`}>{t('settingsPage.billingPriceLine')}</div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className={st.nestedBox}>
                    <div className={st.muted}>{t('settingsPage.billingMembers')}</div>
                    <div className={`font-bold ${st.heading}`}>45 / 100</div>
                  </div>
                  <div className={st.nestedBox}>
                    <div className={st.muted}>{t('settingsPage.billingStorage')}</div>
                    <div className={`font-bold ${st.heading}`}>45.8 GB / 100 GB</div>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.billingInvoiceTitle')}</h3>
              <div className="flex flex-wrap gap-3">
                <GradientButton variant="primary" onClick={handleExportInvoice}>{t('settingsPage.exportInvoice')}</GradientButton>
                <button
                  onClick={handleContactBilling}
                  className={st.outlineBtn}
                >
                  {t('settingsPage.contactBilling')}
                </button>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="max-w-4xl">
            <GlassCard className={gc}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${st.heading}`}>{t('settingsPage.auditTitle')}</h3>
                <button
                  onClick={handleExportAuditLog}
                  className={st.outlineBtn}
                >
                  {t('settingsPage.exportLog')}
                </button>
              </div>
              <div className="space-y-2">
                {auditEntries.map((log, idx) => (
                  <div key={idx} className={`${st.listRow} gap-4`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                      log.type === 'create' ? 'bg-green-500/20' :
                      log.type === 'update' ? 'bg-blue-500/20' :
                      log.type === 'delete' ? 'bg-red-500/20' :
                      log.type === 'security' ? 'bg-orange-500/20' :
                      'bg-cyan-500/15'
                    }`}>
                      {log.type === 'create' ? '➕' :
                       log.type === 'update' ? '✏️' :
                       log.type === 'delete' ? '🗑️' :
                       log.type === 'security' ? '🔒' : '📧'}
                    </div>
                    <div className="flex-1">
                      <div className={`font-semibold ${st.onSurface}`}>
                        <span className={st.accentInline}>{log.user}</span> {log.action}
                      </div>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>🕐 {log.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}
        </>
        )}

        {/* User/Manager Tabs Content */}
        {(userRole === 'user' || userRole === 'manager') && (
        <>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.profileTitle')}</h3>
              <div className="flex items-center gap-6 mb-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-600 to-teal-600 flex items-center justify-center text-5xl overflow-hidden">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    '👤'
                  )}
                </div>
                <label className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <span className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 font-semibold text-white cursor-pointer hover:from-cyan-700 hover:to-teal-700 transition-all">{t('settingsPage.changeAvatar')}</span>
                </label>
              </div>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.fullName')}</label>
                  <input
                    type="text"
                    value={userProfileForm.fullName}
                    onChange={(e) => setUserProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    className={st.input}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.email')}</label>
                    <input type="email" value={user?.email || ''} className={st.input} disabled />
                  </div>
                  <div>
                    <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.phone')}</label>
                    <input
                      type="tel"
                      value={userProfileForm.phone}
                      onChange={(e) => setUserProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                      className={st.input}
                    />
                  </div>
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.jobTitle')}</label>
                  <input
                    type="text"
                    defaultValue={userRole === 'manager' ? t('settingsPage.jobManager') : t('settingsPage.jobStaff')}
                    className={st.inputDisabled}
                    disabled
                  />
                </div>
                <GradientButton 
                  variant="primary"
                  onClick={handleSaveUserProfile}
                >
                  {t('settingsPage.saveChanges')}
                </GradientButton>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="max-w-3xl">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.notifSettingsTitle')}</h3>
              <div className="space-y-4">
                {notificationSettings.map((setting) => (
                  <label key={setting.id} className={st.settingRow}>
                    <span className={st.onSurface}>{t(`settingsPage.${NOTIF_LABEL_KEYS[setting.id]}`)}</span>
                    <input
                      type="checkbox"
                      checked={setting.checked}
                      onChange={() => handleToggleNotificationSetting(setting.id)}
                      className="w-5 h-5 rounded"
                    />
                  </label>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.privacyTitle')}</h3>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.onlineStatusLabel')}</label>
                  <select
                    className={st.select}
                    value={privacySettings.onlineStatus}
                    onChange={(event) => setPrivacySettings((prev) => ({ ...prev, onlineStatus: event.target.value }))}
                  >
                    <option value="everyone" className={isDarkMode ? 'bg-[#0b1738] text-white' : 'bg-white text-slate-800'}>
                      {t('settingsPage.privacyEveryone')}
                    </option>
                    <option value="colleagues" className={isDarkMode ? 'bg-[#0b1738] text-white' : 'bg-white text-slate-800'}>
                      {t('settingsPage.privacyColleagues')}
                    </option>
                    <option value="nobody" className={isDarkMode ? 'bg-[#0b1738] text-white' : 'bg-white text-slate-800'}>
                      {t('settingsPage.privacyNobody')}
                    </option>
                  </select>
                </div>
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.dmPermissionLabel')}</label>
                  <select
                    className={st.select}
                    value={privacySettings.directMessagePermission}
                    onChange={(event) => setPrivacySettings((prev) => ({ ...prev, directMessagePermission: event.target.value }))}
                  >
                    <option value="everyone" className={isDarkMode ? 'bg-[#0b1738] text-white' : 'bg-white text-slate-800'}>
                      {t('settingsPage.privacyEveryone')}
                    </option>
                    <option value="colleagues" className={isDarkMode ? 'bg-[#0b1738] text-white' : 'bg-white text-slate-800'}>
                      {t('settingsPage.privacyColleagues')}
                    </option>
                  </select>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="max-w-3xl">
            <GlassCard className={gc}>
              <h3 className={`text-xl font-bold mb-4 ${st.heading}`}>{t('settingsPage.appearanceTitle')}</h3>
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${st.label}`}>{t('settingsPage.themeLabel')}</label>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'dark', name: t('settingsPage.themeDark'), icon: '🌙' },
                      { id: 'light', name: t('settingsPage.themeLight'), icon: '☀️' },
                    ].map((theme) => {
                      const selected = theme.id === 'dark' ? isDarkMode : !isDarkMode;
                      return (
                        <div
                          key={theme.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (theme.id === 'dark' && !isDarkMode) toggleTheme();
                            if (theme.id === 'light' && isDarkMode) toggleTheme();
                            toast.success(t('settingsPage.toastTheme', { name: theme.name }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (theme.id === 'dark' && !isDarkMode) toggleTheme();
                              if (theme.id === 'light' && isDarkMode) toggleTheme();
                              toast.success(t('settingsPage.toastTheme', { name: theme.name }));
                            }
                          }}
                          className={`cursor-pointer rounded-xl p-6 transition-all ${
                            selected
                              ? 'bg-gradient-to-br from-cyan-600 to-teal-600 text-white shadow-lg'
                              : isDarkMode
                                ? 'border border-slate-800 bg-[#040f2a] hover:bg-slate-800/70'
                                : 'border border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="mb-2 text-4xl">{theme.icon}</div>
                          <div className={`font-bold ${selected ? 'text-white' : st.heading}`}>{theme.name}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mt-8">
                  <label className={`block text-sm font-semibold mb-3 ${st.label}`}>{t('settingsPage.fontScaleLabel')}</label>
                  <p className={`mb-3 text-sm ${st.muted}`}>
                    {t('settingsPage.fontScaleHint')}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {[
                      { id: 'normal', name: t('settingsPage.fontNormal'), hint: '100%' },
                      { id: 'comfortable', name: t('settingsPage.fontComfortable'), hint: '112.5%' },
                      { id: 'large', name: t('settingsPage.fontLarge'), hint: '125%' },
                    ].map((opt) => {
                      const selected = fontScale === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setFontScale(opt.id);
                            toast.success(t('settingsPage.toastFont', { name: opt.name }));
                          }}
                          className={`rounded-xl border px-4 py-3 text-left transition ${
                            selected
                              ? 'border-cyan-500 bg-cyan-500/15 ring-2 ring-cyan-500/40'
                              : isDarkMode
                                ? 'border-slate-700 bg-[#040f2a] hover:bg-slate-800/80'
                                : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className={`font-bold ${st.heading}`}>{opt.name}</div>
                          <div className={`mt-1 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {opt.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}
        </>
        )}
      </div>
        }
      />

    <ConfirmDialog
      isOpen={apiKeyDeleteConfirm != null}
      onClose={() => setApiKeyDeleteConfirm(null)}
      onConfirm={confirmDeleteApiKey}
      title={t('settingsPage.confirmDeleteApiKeyTitle')}
      message={t('settingsPage.confirmDeleteApiKeyMsg')}
      confirmText={t('settingsPage.confirmOk')}
      cancelText={t('settingsPage.cancel')}
    />
    <ConfirmDialog
      isOpen={roleDeleteConfirm != null}
      onClose={() => setRoleDeleteConfirm(null)}
      onConfirm={confirmDeleteRole}
      title={t('settingsPage.confirmDeleteRoleTitle')}
      message={t('settingsPage.confirmDeleteRoleMsg')}
      confirmText={t('settingsPage.confirmOk')}
      cancelText={t('settingsPage.cancel')}
    />
    </>
  );
}



export default SettingsPage;