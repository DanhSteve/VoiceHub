import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { ConfirmDialog, Modal } from '../../components/Shared';
import OrganizationMemberSidebar from '../../components/Organization/OrganizationMemberSidebar';
import OrganizationVoiceChannelSidebar from '../../components/Organization/OrganizationVoiceChannelSidebar';
import OrganizationMainPanel from '../../components/Organization/OrganizationMainPanel';
import OrganizationChannelRoleSettingsModal from '../../components/Organization/OrganizationChannelRoleSettingsModal';
import ForwardChannelModal from '../../components/Organization/ForwardChannelModal';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI } from '../../services/api/taskAPI';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';
import { appShellBg } from '../../theme/shellTheme';
import { displayDepartmentName, channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';

import {
  divisionChannelsFromStructure,
  mergeChannelsById,
} from '../../utils/orgChannelScope';
import { isOrgMembershipStructureAdmin } from '../../components/Organization/roleRbacUtils';


const unwrapData = (payload) => payload?.data ?? payload;

/** Khi đổi phòng ban: không tự nhảy vào kênh voice — ưu tiên kênh chat hoặc để trống. */
function preferDefaultTextChannelId(channelList, preferredTeamId = '', permissionMatrix = null) {
  const list = Array.isArray(channelList) ? channelList : [];
  const matrix =
    permissionMatrix && typeof permissionMatrix === 'object' ? permissionMatrix : null;
  const matrixReady = matrix && Object.keys(matrix).length > 0;
  const isReadable = (ch) => {
    if (!matrixReady) return true;
    const row = matrix[String(ch._id)] || {};
    return Boolean(row.canSee ?? row.canRead);
  };
  const readable = list.filter(isReadable);
  const pool = matrixReady ? readable : list;
  if (preferredTeamId) {
    const teamScoped = pool.filter((ch) => String(ch.team || '') === String(preferredTeamId));
    const teamText = teamScoped.find((ch) => String(ch.type || 'text').toLowerCase() !== 'voice');
    if (teamText?._id) return String(teamText._id);
  }
  const deptScoped = pool.filter((ch) => !String(ch.team || ''));
  const deptText = deptScoped.find((ch) => String(ch.type || 'text').toLowerCase() !== 'voice');
  if (deptText?._id) return String(deptText._id);
  const anyText = pool.find((ch) => String(ch.type || 'text').toLowerCase() !== 'voice');
  return anyText?._id ? String(anyText._id) : '';
}

const parseNotificationData = (item) => {
  if (!item || typeof item !== 'object') return { data: {} };
  if (item.data && typeof item.data === 'object') return item;
  if (typeof item.data !== 'string') return { ...item, data: {} };
  try {
    return { ...item, data: JSON.parse(item.data) };
  } catch {
    return { ...item, data: {} };
  }
};

function OrganizationsPage({ landingDemo = false, initialWorkspaceSlug = '' } = {}) {
  const { t, locale } = useAppStrings();
  const { user } = useAuth();
  const { setActiveWorkspace, lastWorkspaceSlug, setLastWorkspaceSlug } = useWorkspace();
  const { isDarkMode } = useTheme();
  const { on, off, onlineUsers, connected: socketConnected, joinRoom, leaveRoom } = useSocket();
  const navigate = useLandingSafeNavigate(landingDemo);
  const location = useLocation();
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [workspaceStructure, setWorkspaceStructure] = useState([]);
  const [channelPermissionMatrix, setChannelPermissionMatrix] = useState({});
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState(null);
  const [membershipScope, setMembershipScope] = useState({
    branchId: null,
    divisionId: null,
    departmentId: null,
    teamId: null,
    canSeeAllStructure: false,
  });
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [voiceRoomMessages, setVoiceRoomMessages] = useState([]);
  const [voiceMessageInput, setVoiceMessageInput] = useState('');
  const [voiceChatDismissed, setVoiceChatDismissed] = useState(false);
  /** Đã hoàn tất ít nhất một lần gọi API danh sách tổ chức (sidebar: chỉ hiện “chưa tham gia” sau khi biết kết quả). */
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  /** Tiến trình upload file/ảnh lên kênh (0–100), null khi không upload */
  const [channelUploadProgress, setChannelUploadProgress] = useState(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteOrgId, setInviteOrgId] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteFriends, setInviteFriends] = useState([]);
  const [loadingInviteFriends, setLoadingInviteFriends] = useState(false);
  const [invitingIds, setInvitingIds] = useState([]);
  const [quickInviteInput, setQuickInviteInput] = useState('');
  const [joiningQuickInvite, setJoiningQuickInvite] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [generatingInviteLink, setGeneratingInviteLink] = useState(false);
  const [inviteBranchId, setInviteBranchId] = useState('');
  const [inviteDivisionId, setInviteDivisionId] = useState('');
  const [inviteStructureBranches, setInviteStructureBranches] = useState([]);
  const [inviteContextLabel, setInviteContextLabel] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState([]);
  /** Đơn gia nhập đang chờ duyệt (hiển thị bubble sidebar). */
  const [pendingJoinApplications, setPendingJoinApplications] = useState([]);
  /** Đơn cần duyệt (owner/admin) — Trang chủ tổ chức. */
  const [joinApplicationsToReview, setJoinApplicationsToReview] = useState([]);
  const [loadingJoinApplicationsToReview, setLoadingJoinApplicationsToReview] = useState(false);
  const [respondingJoinReviewKeys, setRespondingJoinReviewKeys] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [respondingInvitationIds, setRespondingInvitationIds] = useState([]);
  const [chatContacts, setChatContacts] = useState([]);
  const [loadingChatContacts, setLoadingChatContacts] = useState(false);
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [createWorkspaceStep, setCreateWorkspaceStep] = useState(1);
  const [createOrgName, setCreateOrgName] = useState('');
  const [createWorkspaceSlug, setCreateWorkspaceSlug] = useState('');
  const [createWorkspaceType, setCreateWorkspaceType] = useState('company');
  const [createWorkspaceTeamSize, setCreateWorkspaceTeamSize] = useState('1-10');
  const [createWorkspaceIndustry, setCreateWorkspaceIndustry] = useState('');
  const [createBranchCount, setCreateBranchCount] = useState(1);
  const [createDivisionPerBranch, setCreateDivisionPerBranch] = useState(1);
  const [createDepartmentPerDivision, setCreateDepartmentPerDivision] = useState(2);
  const [createTeamPerDepartment, setCreateTeamPerDepartment] = useState(2);
  const [createBranchCountInput, setCreateBranchCountInput] = useState('1');
  const [createDivisionPerBranchInput, setCreateDivisionPerBranchInput] = useState('1');
  const [createDepartmentPerDivisionInput, setCreateDepartmentPerDivisionInput] = useState('2');
  const [createTeamPerDepartmentInput, setCreateTeamPerDepartmentInput] = useState('2');
  const [createBranchNames, setCreateBranchNames] = useState(['']);
  const [createDivisionNames, setCreateDivisionNames] = useState([['']]);
  const [createDepartmentNames, setCreateDepartmentNames] = useState([[['']]]); // [b][d][dept]
  const [createTeamNames, setCreateTeamNames] = useState([[[['']]]]); // [b][d][dept][team]

  useEffect(() => {
    const branchCount = Math.max(1, Number(createBranchCount) || 1);
    const divisionsPerBranch = Math.max(1, Number(createDivisionPerBranch) || 1);
    const departmentsPerDivision = Math.max(1, Number(createDepartmentPerDivision) || 1);
    const teamsPerDepartment = Math.max(1, Number(createTeamPerDepartment) || 1);

    setCreateBranchNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) => {
        const val = prev?.[bIdx];
        const fallback = bIdx === 0 ? 'Trụ sở chính' : `Chi nhánh ${bIdx + 1}`;
        return val != null && String(val).trim() ? String(val) : fallback;
      })
    );

    setCreateDivisionNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) =>
        Array.from({ length: divisionsPerBranch }, (_, dIdx) => {
          const val = prev?.[bIdx]?.[dIdx];
          const fallback = dIdx === 0 ? 'Khối Công nghệ' : `Khối ${dIdx + 1}`;
          return val != null && String(val).trim() ? String(val) : fallback;
        })
      )
    );

    setCreateDepartmentNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) =>
        Array.from({ length: divisionsPerBranch }, (_, dIdx) =>
          Array.from({ length: departmentsPerDivision }, (_, depIdx) => {
            const val = prev?.[bIdx]?.[dIdx]?.[depIdx];
            const fallback = `Phòng ${depIdx + 1}`;
            return val != null && String(val).trim() ? String(val) : fallback;
          })
        )
      )
    );

    setCreateTeamNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) =>
        Array.from({ length: divisionsPerBranch }, (_, dIdx) =>
          Array.from({ length: departmentsPerDivision }, (_, depIdx) =>
            Array.from({ length: teamsPerDepartment }, (_, tIdx) => {
              const val = prev?.[bIdx]?.[dIdx]?.[depIdx]?.[tIdx];
              const fallback = `Team ${depIdx + 1}.${tIdx + 1}`;
              return val != null && String(val).trim() ? String(val) : fallback;
            })
          )
        )
      )
    );
  }, [createBranchCount, createDivisionPerBranch, createDepartmentPerDivision, createTeamPerDepartment]);
  const [createDeptModalOpen, setCreateDeptModalOpen] = useState(false);
  const [createDeptName, setCreateDeptName] = useState('');
  const [createDeptDivisionId, setCreateDeptDivisionId] = useState('');
  const [createDivisionModalOpen, setCreateDivisionModalOpen] = useState(false);
  const [createDivisionName, setCreateDivisionName] = useState('');
  const [createDivisionBranchId, setCreateDivisionBranchId] = useState('');
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [createTeamDepartmentId, setCreateTeamDepartmentId] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelName, setCreateChannelName] = useState('');
  const [createChannelBranchId, setCreateChannelBranchId] = useState('');
  const [createChannelDivisionId, setCreateChannelDivisionId] = useState('');
  const [createChannelDepartmentId, setCreateChannelDepartmentId] = useState('');
  const [createChannelTeamId, setCreateChannelTeamId] = useState('');
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetType, setRenameTargetType] = useState('');
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameTargetName, setRenameTargetName] = useState('');
  const [deleteChannelMsgConfirmId, setDeleteChannelMsgConfirmId] = useState(null);
  const [leaveOrgModalOpen, setLeaveOrgModalOpen] = useState(false);
  const [leaveOrgPendingId, setLeaveOrgPendingId] = useState(null);
  const [leaveOrgPendingName, setLeaveOrgPendingName] = useState('');
  const [leavingOrg, setLeavingOrg] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [forwardTargetsLoading, setForwardTargetsLoading] = useState(false);
  const [memberListRefreshKey, setMemberListRefreshKey] = useState(0);
  const [workspaceTasks, setWorkspaceTasks] = useState([]);
  const [loadingWorkspaceTasks, setLoadingWorkspaceTasks] = useState(false);
  const [workspaceTabView, setWorkspaceTabView] = useState('chat');
  const [workspaceNotificationsOpen, setWorkspaceNotificationsOpen] = useState(false);
  const [workspaceNotifications, setWorkspaceNotifications] = useState([]);
  const [loadingWorkspaceNotifications, setLoadingWorkspaceNotifications] = useState(false);
  const previousVoiceChannelIdRef = useRef('');
  const hasInviteQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get('orgId') || params.get('inviteOrgId') || params.get('inviteToken'));
  }, [location.search]);
  const shouldRedirectEmptyOrganizations =
    !landingDemo &&
    organizationsLoaded &&
    organizations.length === 0 &&
    !initialWorkspaceSlug &&
    !createOrgModalOpen &&
    !location.state?.openCreateWorkspace &&
    !hasInviteQuery;
  const workspaceTabFromUrl = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const raw = String(params.get('tab') || '').trim().toLowerCase();
    return raw === 'tasks' ? 'tasks' : 'chat';
  }, [location.search]);

  useEffect(() => {
    setWorkspaceTabView(workspaceTabFromUrl);
  }, [workspaceTabFromUrl]);

  const notify = (message, type = 'success') => {
    if (type === 'fail') toast.error(message);
    else if (type === 'info') toast(message, { icon: 'ℹ️' });
    else toast.success(message);
  };
  const notifySuccess = (message) => notify(message, 'success');
  const notifyError = (message) => notify(message, 'fail');
  const inviteJoinSuccessText = (data) => {
    const ctx = data?.inviteContext || {};
    const parts = [ctx?.branchName, ctx?.divisionName].filter(Boolean);
    if (!parts.length) return t('organizations.joinedFromInvite');
    return `${t('organizations.joinedFromInvite')} (${parts.join(' / ')})`;
  };

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org._id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId]
  );

  useEffect(() => {
    setWorkspaceSearchOpen(false);
  }, [selectedOrganizationId]);
  const selectedDepartment = useMemo(
    () => departments.find((department) => department._id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );
  const selectedTeam = useMemo(
    () => teams.find((team) => String(team._id) === String(selectedTeamId)) || null,
    [teams, selectedTeamId]
  );
  const selectedChannel = useMemo(
    () => channels.find((ch) => String(ch._id) === String(selectedChannelId)) || null,
    [channels, selectedChannelId]
  );
  const selectedChannelType = String(selectedChannel?.type || '').toLowerCase();
  const selectedBranch = useMemo(
    () => workspaceStructure.find((branch) => String(branch._id) === String(selectedBranchId)) || null,
    [workspaceStructure, selectedBranchId]
  );
  const selectedDivision = useMemo(
    () =>
      (selectedBranch?.divisions || []).find(
        (division) => String(division._id) === String(selectedDivisionId)
      ) || null,
    [selectedBranch, selectedDivisionId]
  );
  const inviteOrganization = useMemo(
    () => organizations.find((org) => org._id === inviteOrgId) || null,
    [organizations, inviteOrgId]
  );
  const isInviteLinkBeta = window.location.protocol !== 'https:';
  const filteredInviteFriends = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return inviteFriends;
    return inviteFriends.filter((friend) => {
      const text = `${friend.name} ${friend.username}`.toLowerCase();
      return text.includes(q);
    });
  }, [inviteFriends, inviteSearch]);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    const current = organizations.find((item) => String(item._id) === String(selectedOrganizationId));
    if (!current) return;
    setActiveWorkspace({
      _id: current._id,
      slug: current.slug,
      name: current.name,
      myRole: current.myRole,
    });
  }, [organizations, selectedOrganizationId, setActiveWorkspace]);

  /** Số đơn gia nhập chờ duyệt theo từng tổ chức (badge trên avatar). */
  const joinReviewCountByOrgId = useMemo(() => {
    const m = {};
    for (const app of joinApplicationsToReview) {
      const id = String(app.organizationId);
      m[id] = (m[id] || 0) + 1;
    }
    return m;
  }, [joinApplicationsToReview]);

  const forwardPreviewText = useMemo(() => {
    if (!forwardSourceMessage) return '';
    return String(forwardSourceMessage.content || '').slice(0, 500);
  }, [forwardSourceMessage]);

  const extractInvitePayloadFromInput = (raw) => {
    if (!raw) return '';
    const input = raw.trim();
    if (!input) return { orgId: '', token: '' };

    try {
      const url = new URL(input);
      return {
        orgId: url.searchParams.get('orgId') || url.searchParams.get('inviteOrgId') || '',
        token: url.searchParams.get('inviteToken') || '',
      };
    } catch (error) {
      // Fallback: cho phép dán query string rút gọn + decode URL-encoded values
      const tokenRaw = (input.includes('inviteToken=') && input.split('inviteToken=')[1]?.split('&')[0]) || '';
      const token = tokenRaw ? decodeURIComponent(tokenRaw) : '';
      const orgIdRaw = (input.includes('orgId=') && input.split('orgId=')[1]?.split('&')[0]) ||
        (input.includes('inviteOrgId=') && input.split('inviteOrgId=')[1]?.split('&')[0]) || '';
      const orgId = orgIdRaw ? decodeURIComponent(orgIdRaw) : '';
      return { orgId, token };
    }
  };

  const toWorkspaceSlug = (value) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

  const loadOrganizations = async () => {
    try {
      const payload = await organizationAPI.getOrganizations();
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setOrganizations(normalized);
      if (normalized.length > 0) {
        const matchedBySlug = normalized.find(
          (item) => String(item.slug || '').trim() === String(lastWorkspaceSlug || '').trim()
        );
        setSelectedOrganizationId((prev) => prev || matchedBySlug?._id || normalized[0]._id);
      } else {
        setSelectedOrganizationId('');
      }
    } catch (error) {
      notifyError(t('organizations.loadOrgsFail'));
    } finally {
      setOrganizationsLoaded(true);
    }
  };

  const loadPendingInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const payload = await organizationAPI.getMyInvitations();
      const list = unwrapData(payload);
      setPendingInvitations(Array.isArray(list) ? list : []);
    } catch (error) {
      setPendingInvitations([]);
      notifyError(t('organizations.loadInvitesFail'));
    } finally {
      setLoadingInvitations(false);
    }
  };

  const loadPendingJoinApplications = async () => {
    try {
      const payload = await organizationAPI.getMyPendingJoinApplications();
      const list = unwrapData(payload);
      setPendingJoinApplications(Array.isArray(list) ? list : []);
    } catch (error) {
      setPendingJoinApplications([]);
    }
  };

  const loadJoinApplicationsToReview = async () => {
    setLoadingJoinApplicationsToReview(true);
    try {
      const payload = await organizationAPI.getJoinApplicationsToReview();
      const list = unwrapData(payload);
      setJoinApplicationsToReview(Array.isArray(list) ? list : []);
    } catch (error) {
      setJoinApplicationsToReview([]);
    } finally {
      setLoadingJoinApplicationsToReview(false);
    }
  };

  const joinReviewKey = (orgId, applicationId) => `${orgId}:${applicationId}`;

  const handleApproveJoinApplication = async (orgId, applicationId) => {
    if (!orgId || !applicationId) return;
    const key = joinReviewKey(orgId, applicationId);
    setRespondingJoinReviewKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    try {
      await organizationAPI.reviewJoinApplication(orgId, applicationId, { action: 'approve' });
      notifySuccess(t('organizations.approveOk'));
      await Promise.all([loadJoinApplicationsToReview(), loadOrganizations()]);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.approveFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.approveFail'));
    } finally {
      setRespondingJoinReviewKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  const handleRejectJoinApplication = async (orgId, applicationId, rejectionReason) => {
    if (!orgId || !applicationId) return;
    const key = joinReviewKey(orgId, applicationId);
    setRespondingJoinReviewKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    try {
      await organizationAPI.reviewJoinApplication(orgId, applicationId, {
        action: 'reject',
        rejectionReason: String(rejectionReason || '').trim(),
      });
      notifySuccess(t('organizations.rejectOk'));
      await loadJoinApplicationsToReview();
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.rejectFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.rejectFail'));
    } finally {
      setRespondingJoinReviewKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  const loadChatContacts = async (organizationIdArg = selectedOrganizationId) => {
    setLoadingChatContacts(true);
    try {
      const [friendPayload, memberPayload] = await Promise.all([
        friendService.getFriends(),
        organizationIdArg ? organizationAPI.getMembers(organizationIdArg) : Promise.resolve(null),
      ]);
      const friendData = unwrapData(friendPayload);
      const rawFriendList = Array.isArray(friendData?.friends)
        ? friendData.friends
        : Array.isArray(friendData)
          ? friendData
          : [];
      const friendContacts = rawFriendList
        .map((item) => item.friendId || item)
        .filter(Boolean)
        .map((item) => ({
          id: item._id || item.id,
          name: item.displayName || item.name || item.username || t('organizations.userFallback'),
          username: item.username || '',
          role: item.role || '',
          phone: item.phone || item.phoneNumber || item.mobile || '',
          email: item.email || '',
          avatar: item.avatar || null,
          category: 'friend',
        }))
        .filter((item) => !!item.id);
      const memberData = unwrapData(memberPayload);
      const rawMemberList = Array.isArray(memberData?.data)
        ? memberData.data
        : Array.isArray(memberData)
          ? memberData
          : [];
      const memberContacts = rawMemberList
        .map((item) => item?.user || item)
        .filter(Boolean)
        .map((item) => ({
          id: item._id || item.id || item.userId,
          name:
            item.displayName ||
            item.fullName ||
            item.username ||
            item.email ||
            t('organizations.userFallback'),
          username: item.username || '',
          role: item.role || item.memberRole || '',
          phone: item.phone || item.phoneNumber || item.mobile || '',
          email: item.email || '',
          avatar: item.avatar || null,
          category: 'work',
        }))
        .filter((item) => !!item.id);
      const merged = new Map();
      [...memberContacts, ...friendContacts].forEach((item) => {
        const key = String(item.id);
        if (!merged.has(key)) merged.set(key, item);
      });
      setChatContacts(Array.from(merged.values()));
    } catch (error) {
      setChatContacts([]);
    } finally {
      setLoadingChatContacts(false);
    }
  };

  const buildStructureBlueprint = () => {
    const branchCount = Math.max(1, Number(createBranchCount) || 1);
    const divisionsPerBranch = Math.max(1, Number(createDivisionPerBranch) || 1);
    const departmentsPerDivision = Math.max(1, Number(createDepartmentPerDivision) || 1);
    const teamsPerDepartment = Math.max(1, Number(createTeamPerDepartment) || 1);
    const safeBranchNames = Array.isArray(createBranchNames) ? createBranchNames : [];
    const safeDivisionNames = Array.isArray(createDivisionNames) ? createDivisionNames : [];
    const safeDepartmentNames = Array.isArray(createDepartmentNames) ? createDepartmentNames : [];
    const safeTeamNames = Array.isArray(createTeamNames) ? createTeamNames : [];
    return {
      branches: Array.from({ length: branchCount }, (_, bIdx) => ({
        name:
          safeBranchNames[bIdx] != null && String(safeBranchNames[bIdx]).trim()
            ? String(safeBranchNames[bIdx]).trim()
            : bIdx === 0
              ? 'Trụ sở chính'
              : `Chi nhánh ${bIdx + 1}`,
        location: '',
        divisions: Array.from({ length: divisionsPerBranch }, (_, dIdx) => ({
          name:
            safeDivisionNames[bIdx]?.[dIdx] != null && String(safeDivisionNames[bIdx]?.[dIdx]).trim()
              ? String(safeDivisionNames[bIdx]?.[dIdx]).trim()
              : dIdx === 0
                ? 'Khối Công nghệ'
                : `Khối ${dIdx + 1}`,
          departments: Array.from({ length: departmentsPerDivision }, (_, depIdx) => ({
            name:
              safeDepartmentNames[bIdx]?.[dIdx]?.[depIdx] != null &&
              String(safeDepartmentNames[bIdx]?.[dIdx]?.[depIdx]).trim()
                ? String(safeDepartmentNames[bIdx]?.[dIdx]?.[depIdx]).trim()
                : `Phòng ${depIdx + 1}`,
            teams: Array.from({ length: teamsPerDepartment }, (_, tIdx) => ({
              name:
                safeTeamNames[bIdx]?.[dIdx]?.[depIdx]?.[tIdx] != null &&
                String(safeTeamNames[bIdx]?.[dIdx]?.[depIdx]?.[tIdx]).trim()
                  ? String(safeTeamNames[bIdx]?.[dIdx]?.[depIdx]?.[tIdx]).trim()
                  : `Team ${depIdx + 1}.${tIdx + 1}`,
            })),
          })),
        })),
      })),
    };
  };

  const loadStructure = async (orgId) => {
    if (!orgId) return;
    try {
      const payload = await organizationAPI.getStructure(orgId);
      const body = unwrapData(payload);
      const branches = Array.isArray(body?.branches) ? body.branches : Array.isArray(body) ? body : [];
      setWorkspaceStructure(branches);

      const depList = [];
      const teamList = [];
      for (const branch of branches) {
        for (const division of branch?.divisions || []) {
          for (const department of division?.departments || []) {
            depList.push(department);
            for (const team of department?.teams || []) {
              teamList.push(team);
            }
          }
        }
      }
      setDepartments(depList);
      setTeams(teamList);
      const defaultBranchId = branches?.[0]?._id ? String(branches[0]._id) : '';
      const defaultDivisionId = branches?.[0]?.divisions?.[0]?._id
        ? String(branches[0].divisions[0]._id)
        : '';
      setSelectedBranchId((prev) => (prev ? prev : defaultBranchId));
      setSelectedDivisionId((prev) => (prev ? prev : defaultDivisionId));

      const visibleDepts = defaultDivisionId
        ? depList.filter((d) => String(d.division || '') === defaultDivisionId)
        : depList;
      const defaultDeptId = visibleDepts?.[0]?._id ? String(visibleDepts[0]._id) : '';
      setSelectedDepartmentId((prev) => {
        if (prev && depList.some((d) => String(d._id) === String(prev))) return prev;
        return defaultDeptId || '';
      });

      const visibleTeams = defaultDeptId
        ? teamList.filter((t) => String(t.department || '') === defaultDeptId)
        : teamList;
      const defaultTeamId = visibleTeams?.[0]?._id ? String(visibleTeams[0]._id) : '';
      setSelectedTeamId((prev) => {
        if (prev && teamList.some((t) => String(t._id) === String(prev))) return prev;
        return defaultTeamId || '';
      });
    } catch {
      setWorkspaceStructure([]);
      setSelectedBranchId('');
      setSelectedDivisionId('');
      await loadDepartments(orgId);
    }
  };

  const loadTaskWorkspaceScope = async (orgId) => {
    if (!orgId) {
      setTaskWorkspaceScope(null);
      return;
    }
    try {
      const payload = await organizationAPI.getTaskWorkspaceScope(orgId);
      const body = unwrapData(payload);
      const data = body?.data ?? body;
      setTaskWorkspaceScope(data && typeof data === 'object' ? data : null);
    } catch {
      setTaskWorkspaceScope({
        visibility: 'self',
        canCreateTask: false,
        canUseAiTask: false,
        assignableUserIds: [],
      });
    }
  };

  const loadChannelPermissions = async (orgId) => {
    if (!orgId) return;
    try {
      const payload = await organizationAPI.getAccessibleChannelIds(orgId);
      const body = unwrapData(payload);
      const data = body?.data ?? body;
      setChannelPermissionMatrix(data?.permissionsByChannelId || {});
      setMembershipScope({
        branchId: data?.scope?.branchId || null,
        divisionId: data?.scope?.divisionId || null,
        departmentId: data?.scope?.departmentId || null,
        teamId: data?.scope?.teamId || null,
        canSeeAllStructure: Boolean(data?.scope?.canSeeAllStructure),
      });
      if (data?.scope?.branchId) setSelectedBranchId(String(data.scope.branchId));
      if (data?.scope?.divisionId) setSelectedDivisionId(String(data.scope.divisionId));
      if (data?.scope?.departmentId) setSelectedDepartmentId(String(data.scope.departmentId));
      if (data?.scope?.teamId) setSelectedTeamId(String(data.scope.teamId));
    } catch {
      setChannelPermissionMatrix({});
      setMembershipScope({
        branchId: null,
        divisionId: null,
        departmentId: null,
        teamId: null,
        canSeeAllStructure: false,
      });
    }
  };

  const findBranchAndDivisionForDepartment = useMemo(() => {
    // Memoized to avoid rebuilding maps on every render; depends on workspaceStructure.
    if (!Array.isArray(workspaceStructure) || workspaceStructure.length === 0) return null;
    const departmentIdToBranchAndDivision = new Map();

    for (const branch of workspaceStructure) {
      const branchId = branch?._id ? String(branch._id) : '';
      for (const division of branch?.divisions || []) {
        const divisionId = division?._id ? String(division._id) : '';
        for (const department of division?.departments || []) {
          const deptId = department?._id ? String(department._id) : '';
          if (deptId) departmentIdToBranchAndDivision.set(deptId, { branchId, divisionId });
        }
      }
    }

    return departmentIdToBranchAndDivision;
  }, [workspaceStructure]);

  const handleSelectBranch = (branchId) => {
    setSelectedBranchId(branchId);
    const branch = workspaceStructure.find((b) => String(b._id) === String(branchId));
    const division = branch?.divisions?.[0];
    const divisionId = division?._id ? String(division._id) : '';
    setSelectedDivisionId(divisionId);

    const firstDept = division?.departments?.[0];
    const deptId = firstDept?._id ? String(firstDept._id) : '';
    setSelectedDepartmentId(deptId);
  };

  const handleSelectDivision = (divisionId) => {
    // Find branch that owns this division.
    const hitBranch = workspaceStructure.find((b) =>
      (b?.divisions || []).some((d) => String(d._id) === String(divisionId))
    );
    const branchId = hitBranch?._id ? String(hitBranch._id) : '';
    setSelectedBranchId(branchId);
    setSelectedDivisionId(divisionId);

    const division = hitBranch?.divisions?.find((d) => String(d._id) === String(divisionId));
    const firstDept = division?.departments?.[0];
    const deptId = firstDept?._id ? String(firstDept._id) : '';
    setSelectedDepartmentId(deptId);
  };

  const isOrgStructureAdmin =
    Boolean(membershipScope?.canSeeAllStructure) ||
    isOrgMembershipStructureAdmin(selectedOrganization?.myRole);

  const handleSelectDepartment = (deptId) => {
    if (
      membershipScope?.departmentId &&
      !isOrgStructureAdmin &&
      String(deptId) !== String(membershipScope.departmentId)
    ) {
      return;
    }
    setSelectedDepartmentId(deptId);
    if (!findBranchAndDivisionForDepartment) return;
    const hit = findBranchAndDivisionForDepartment.get(String(deptId));
    if (!hit) return;
    setSelectedBranchId(hit.branchId);
    setSelectedDivisionId(hit.divisionId);
  };

  const handleSelectChannel = (channelId) => {
    const perm = channelPermissionMatrix?.[String(channelId)] || {};
    if (!(perm?.canSee || perm?.canRead)) return;
    setSelectedChannelId(channelId);
  };

  const handleOpenChannelSettings = (channel) => {
    if (!channel?._id) return;
    setChannelSettingsChannel(channel);
    setChannelSettingsOpen(true);
  };

  const loadDepartments = async (orgId) => {
    if (!orgId) return;
    setLoadingDepartments(true);
    try {
      const payload = await organizationAPI.getDepartments(orgId);
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setDepartments(normalized);
      setTeams([]);
      setSelectedTeamId('');
      setSelectedDepartmentId((prev) => {
        if (prev && normalized.some((item) => item._id === prev)) return prev;
        return normalized[0]?._id || '';
      });
    } catch (error) {
      setDepartments([]);
      setTeams([]);
      setSelectedTeamId('');
      setSelectedDepartmentId('');
      notifyError(t('organizations.loadDeptFail'));
    } finally {
      setLoadingDepartments(false);
    }
  };

  const loadChannels = async (orgId, deptId, teamIdHint = '', divisionIdHint = '') => {
    if (!orgId || !deptId) {
      setChannels([]);
      setSelectedChannelId('');
      return;
    }

    setLoadingChannels(true);
    try {
      const payload = await organizationAPI.getChannels(orgId, deptId);
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      const divisionId = divisionIdHint || selectedDivisionId || '';
      const divisionExtras = divisionChannelsFromStructure(workspaceStructure, divisionId);
      const merged = mergeChannelsById(normalized, divisionExtras);
      setChannels(merged);
      setSelectedChannelId((prev) => {
        if (prev && merged.some((item) => String(item._id) === String(prev))) {
          const readable = Boolean(channelPermissionMatrix?.[String(prev)]?.canRead);
          const matrixReady = Object.keys(channelPermissionMatrix || {}).length > 0;
          if (!matrixReady || readable) return prev;
        }
        return preferDefaultTextChannelId(merged, teamIdHint, channelPermissionMatrix);
      });
    } catch (error) {
      setChannels([]);
      setSelectedChannelId('');
      notifyError(t('organizations.loadChannelsFail'));
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadTeams = async (orgId, deptId) => {
    if (!orgId || !deptId) {
      setTeams([]);
      setSelectedTeamId('');
      return '';
    }
    try {
      const payload = await organizationAPI.getTeamsByDepartment(orgId, deptId);
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setTeams(normalized);
      let nextTeamId = '';
      setSelectedTeamId((prev) => {
        if (prev && normalized.some((item) => String(item._id) === String(prev))) {
          nextTeamId = String(prev);
          return prev;
        }
        nextTeamId = normalized[0]?._id ? String(normalized[0]._id) : '';
        return nextTeamId;
      });
      return nextTeamId || (normalized[0]?._id ? String(normalized[0]._id) : '');
    } catch {
      setTeams([]);
      setSelectedTeamId('');
      return '';
    }
  };

  const loadMessages = async (channelId) => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const payload = await api.get('/messages', {
        params: {
          roomId: channelId,
          limit: 100,
          ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
        },
        skipPermissionDeniedToast: true,
      });
      const data = unwrapData(payload);
      const list = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
      // Sắp xếp cũ -> mới để hiển thị tự nhiên trong màn chat
      list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      const enriched = await enrichMessagesBusinessCards(list);
      setMessages(enriched);
    } catch (error) {
      setMessages([]);
      if (error?.status !== 403) {
        notifyError(t('organizations.loadMessagesFail'));
      }
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadWorkspaceTasks = async (organizationId) => {
    if (!organizationId) {
      setWorkspaceTasks([]);
      return;
    }
    setLoadingWorkspaceTasks(true);
    try {
      const payload = await taskAPI.getTasks({ organizationId });
      const body = payload?.data ?? payload;
      const inner = body?.data ?? body;
      const list = Array.isArray(inner?.tasks) ? inner.tasks : Array.isArray(inner) ? inner : [];
      setWorkspaceTasks(list);
    } catch {
      setWorkspaceTasks([]);
    } finally {
      setLoadingWorkspaceTasks(false);
    }
  };

  const openWorkspaceNotifications = async () => {
    if (!selectedOrganizationId) return;
    setWorkspaceNotificationsOpen(true);
    setLoadingWorkspaceNotifications(true);
    try {
      const response = await api.get('/notifications', {
        params: { organizationId: selectedOrganizationId, limit: 50 },
      });
      const body = response?.data ?? response;
      const inner = body?.data ?? body;
      const list = Array.isArray(inner?.notifications) ? inner.notifications : [];
      setWorkspaceNotifications(list.map(parseNotificationData));
    } catch (error) {
      setWorkspaceNotifications([]);
      notifyError(error?.response?.data?.message || t('notifications.loadFail'));
    } finally {
      setLoadingWorkspaceNotifications(false);
    }
  };

  const handleMoveWorkspaceTask = async (task, nextStatus) => {
    if (!task?._id || !selectedOrganizationId) return;
    const taskId = String(task._id);
    const previousStatus = String(task.status || 'todo');
    setWorkspaceTasks((prev) =>
      prev.map((t) => (String(t._id) === taskId ? { ...t, status: nextStatus } : t))
    );
    try {
      await taskAPI.updateTask(
        taskId,
        { status: nextStatus },
        { organizationId: selectedOrganizationId }
      );
    } catch {
      setWorkspaceTasks((prev) =>
        prev.map((t) => (String(t._id) === taskId ? { ...t, status: previousStatus } : t))
      );
      notifyError(t('tasks.toastMoveFail'));
    }
  };

  const handleCreateWorkspaceTask = async (taskData) => {
    if (!selectedOrganizationId) return;
    const optimisticId = `tmp-${Date.now()}`;
    const optimisticTask = {
      _id: optimisticId,
      title: String(taskData?.title || '').trim(),
      description: String(taskData?.description || '').trim(),
      status: 'todo',
      priority: taskData?.priority || 'medium',
      departmentId: taskData?.departmentId || '',
      organizationId: selectedOrganizationId,
      assigneeId: taskData?.assigneeId || '',
      dueDate: taskData?.dueDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      __optimistic: true,
    };
    setWorkspaceTasks((prev) => [optimisticTask, ...prev]);
    try {
      const payload = {
        ...taskData,
        organizationId: selectedOrganizationId,
        serverId: selectedOrganizationId,
      };
      const created = await taskAPI.createTask(payload);
      const body = created?.data ?? created;
      const task = body?.data ?? body;
      if (task && (task._id || task.id)) {
        setWorkspaceTasks((prev) =>
          prev.map((item) => (String(item._id || item.id) === optimisticId ? task : item))
        );
      }
      // Luôn sync lại từ server để đảm bảo board dùng dữ liệu thật (owner/assignee/status chuẩn).
      await loadWorkspaceTasks(selectedOrganizationId);
      notifySuccess(t('tasks.toastCreated') || 'Task created');
    } catch (error) {
      setWorkspaceTasks((prev) =>
        prev.filter((item) => String(item._id || item.id) !== optimisticId)
      );
      notifyError(error?.response?.data?.message || error?.message || t('tasks.toastCreateFail'));
      throw error;
    }
  };

  const handleCreateOrganization = async () => {
    setCreateOrgName('');
    setCreateWorkspaceSlug('');
    setCreateWorkspaceType('company');
    setCreateWorkspaceTeamSize('1-10');
    setCreateWorkspaceIndustry('');
    setCreateBranchCount(1);
    setCreateDivisionPerBranch(1);
    setCreateDepartmentPerDivision(2);
    setCreateTeamPerDepartment(2);
    setCreateBranchCountInput('1');
    setCreateDivisionPerBranchInput('1');
    setCreateDepartmentPerDivisionInput('2');
    setCreateTeamPerDepartmentInput('2');
    setCreateBranchNames(['']);
    setCreateDivisionNames([['']]);
    setCreateDepartmentNames([[['']]]);
    setCreateTeamNames([[[['']]]]);
    setCreateWorkspaceStep(1);
    setCreateOrgModalOpen(true);
  };

  const handleSubmitCreateOrganization = async () => {
    const normalizedName = String(createOrgName || '').trim();
    const normalizedSlug = toWorkspaceSlug(createWorkspaceSlug || createOrgName);
    if (!normalizedName) {
      notifyError(t('organizations.orgNameRequired'));
      return;
    }
    if (!normalizedSlug || normalizedSlug.length < 3) {
      notifyError('Workspace slug phải có ít nhất 3 ký tự hợp lệ.');
      return;
    }

    try {
      const response = await organizationAPI.createWorkspace({
        name: normalizedName,
        slug: normalizedSlug,
        type: createWorkspaceType,
        teamSize: createWorkspaceTeamSize,
        industry: String(createWorkspaceIndustry || '').trim(),
        structureBlueprint: buildStructureBlueprint(),
      });
      const payload = unwrapData(response);
      const created = payload?.data ?? payload;
      notifySuccess(t('organizations.orgCreated'));
      if (String(created?.provisioning?.structure?.status || '').toLowerCase() !== 'ready') {
        notifySuccess('Workspace đang được khởi tạo cấu trúc nền. Bạn có thể sử dụng ngay trong lúc hệ thống hoàn tất.');
      }
      setCreateOrgModalOpen(false);
      setCreateWorkspaceStep(1);
      await loadOrganizations();
      const createdSlug = String(created?.slug || normalizedSlug || '').trim();
      if (createdSlug) {
        navigate(`/w/${encodeURIComponent(createdSlug)}`);
      }
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.orgCreateFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.orgCreateFail'));
    }
  };

  const updateStructureCountDraft = (rawValue, min, max, setInput, setValue) => {
    if (rawValue === '') {
      setInput('');
      return;
    }
    if (!/^\d+$/.test(rawValue)) return;
    const parsed = Number(rawValue);
    const clamped = Math.min(max, Math.max(min, parsed));
    setInput(String(clamped));
    setValue(clamped);
  };

  const commitStructureCountDraft = (inputValue, fallbackValue, min, max, setInput, setValue) => {
    const parsed = Number(inputValue);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallbackValue;
    setInput(String(next));
    setValue(next);
  };

  const adjustStructureCount = (currentValue, delta, min, max, setInput, setValue) => {
    const next = Math.min(max, Math.max(min, Number(currentValue || min) + delta));
    setInput(String(next));
    setValue(next);
  };

  const handleJoinQuickInvite = async () => {
    const { orgId, token } = extractInvitePayloadFromInput(quickInviteInput);
    if (!orgId || !token) {
      notifyError(t('organizations.inviteLinkInvalid'));
      return;
    }

    setJoiningQuickInvite(true);
    try {
      const res = await organizationAPI.joinByInviteLink(orgId, token);
      const body = res?.data ?? res;
      const data = body?.data ?? body;
      if (data?.requiresJoinApplication) {
        if (data?.requiresAnswers) {
          const qs = new URLSearchParams();
          if (data.organizationName) qs.set('name', data.organizationName);
          const q = qs.toString();
          navigate(`/workspaces/join/${encodeURIComponent(orgId)}${q ? `?${q}` : ''}`);
        } else {
          notifySuccess(body?.message || 'Đã gửi đơn, vui lòng chờ quản trị viên xét duyệt');
        }
        setQuickInviteInput('');
        return;
      }
      notifySuccess(inviteJoinSuccessText(data));
      setQuickInviteInput('');
      await Promise.all([
        loadOrganizations(),
        loadPendingInvitations(),
        loadPendingJoinApplications(),
        loadJoinApplicationsToReview(),
      ]);
    } catch (error) {
      notifyError(t('organizations.joinInviteFail'));
    } finally {
      setJoiningQuickInvite(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    if (!selectedDivisionId) {
      notifyError('Vui lòng chọn khối trước khi tạo phòng ban');
      return;
    }
    setCreateDeptName('');
    setCreateDeptDivisionId(String(selectedDivisionId));
    setCreateDeptModalOpen(true);
  };

  const handleCreateDivision = async () => {
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    if (!selectedBranchId) {
      notifyError('Vui lòng chọn chi nhánh trước khi tạo khối');
      return;
    }
    setCreateDivisionName('');
    setCreateDivisionBranchId(String(selectedBranchId));
    setCreateDivisionModalOpen(true);
  };

  const handleSubmitCreateDivision = async () => {
    if (!createDivisionName?.trim()) {
      notifyError('Tên khối là bắt buộc');
      return;
    }
    if (!createDivisionBranchId) {
      notifyError('Vui lòng chọn chi nhánh');
      return;
    }
    try {
      await organizationAPI.createDivision(selectedOrganizationId, createDivisionBranchId, {
        name: createDivisionName.trim(),
      });
      notifySuccess('Đã tạo khối');
      setCreateDivisionModalOpen(false);
      await loadStructure(selectedOrganizationId);
    } catch {
      notifyError('Không thể tạo khối');
    }
  };

  const handleSubmitCreateDepartment = async () => {
    if (!createDeptName?.trim()) {
      notifyError(t('organizations.deptNameRequired'));
      return;
    }
    if (!createDeptDivisionId) {
      notifyError('Vui lòng chọn khối');
      return;
    }

    try {
      await organizationAPI.createDepartmentByDivision(selectedOrganizationId, createDeptDivisionId, {
        name: createDeptName.trim(),
      });
      notifySuccess(t('organizations.deptCreated'));
      setCreateDeptModalOpen(false);
      await loadStructure(selectedOrganizationId);
    } catch (error) {
      notifyError(t('organizations.deptCreateFail'));
    }
  };

  const handleCreateTeam = async () => {
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    if (!selectedDepartmentId) {
      notifyError('Vui lòng chọn phòng ban trước khi tạo team');
      return;
    }
    setCreateTeamName('');
    setCreateTeamDepartmentId(String(selectedDepartmentId));
    setCreateTeamModalOpen(true);
  };

  const handleSubmitCreateTeam = async () => {
    if (!createTeamName?.trim()) {
      notifyError('Tên team là bắt buộc');
      return;
    }
    if (!createTeamDepartmentId) {
      notifyError('Vui lòng chọn phòng ban');
      return;
    }
    try {
      await organizationAPI.createTeamByDepartment(selectedOrganizationId, createTeamDepartmentId, {
        name: createTeamName.trim(),
      });
      notifySuccess('Đã tạo team');
      setCreateTeamModalOpen(false);
      await loadStructure(selectedOrganizationId);
      setSelectedDepartmentId(createTeamDepartmentId);
      await loadTeams(selectedOrganizationId, createTeamDepartmentId);
    } catch {
      notifyError('Không thể tạo team');
    }
  };

  const handleOpenWorkspace = (orgId) => {
    if (!orgId) return;
    const selected = organizations.find((item) => String(item._id) === String(orgId));
    setSelectedOrganizationId(orgId);
    if (selected?.slug) {
      setLastWorkspaceSlug(selected.slug);
      navigate(`/w/${encodeURIComponent(selected.slug)}`);
    }
  };

  const handleEditOrganization = (orgId) => {
    if (!orgId) return;
    navigate(`/workspaces/${encodeURIComponent(orgId)}/settings`);
  };

  const handleOpenOrganizationSettingsModal = (orgCandidate = null) => {
    const target =
      orgCandidate ||
      organizations.find((o) => String(o._id) === String(selectedOrganizationId)) ||
      selectedOrganization;
    if (!target) return;
    const orgId = target?._id || target?.id;
    if (!orgId) return;
    navigate(`/workspaces/${encodeURIComponent(orgId)}/settings`);
  };

  const handleLeaveOrganization = (orgId) => {
    if (!orgId) return;
    const name =
      organizations.find((o) => String(o._id) === String(orgId))?.name || t('organizations.orgFallback');
    setLeaveOrgPendingId(orgId);
    setLeaveOrgPendingName(name);
    setLeaveOrgModalOpen(true);
  };

  const closeLeaveOrgModal = () => {
    if (leavingOrg) return;
    setLeaveOrgModalOpen(false);
    setLeaveOrgPendingId(null);
    setLeaveOrgPendingName('');
  };

  const confirmLeaveOrganization = async () => {
    const orgId = leaveOrgPendingId;
    if (!orgId) return;
    setLeavingOrg(true);
    try {
      await organizationAPI.leaveOrganization(orgId);
      notifySuccess(t('organizations.leftOrg'));
      setLeaveOrgModalOpen(false);
      setLeaveOrgPendingId(null);
      setLeaveOrgPendingName('');
      if (String(selectedOrganizationId) === String(orgId)) {
        setSelectedOrganizationId('');
        setSelectedDepartmentId('');
        setSelectedChannelId('');
        setChannels([]);
        setDepartments([]);
        setMessages([]);
        setLastWorkspaceSlug('');
      }
      await Promise.all([
        loadOrganizations(),
        loadPendingInvitations(),
        loadPendingJoinApplications(),
        loadJoinApplicationsToReview(),
      ]);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.leaveFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.leaveFail'));
    } finally {
      setLeavingOrg(false);
    }
  };

  const handleInviteOrganization = async (orgId) => {
    const normalizedMyRole = String(selectedOrganization?.myRole || '').toLowerCase();
    if (!['owner', 'admin', 'hr'].includes(normalizedMyRole)) {
      notifyError('Bạn không có quyền mời thành viên');
      return;
    }
    setInviteOrgId(orgId);
    setGeneratedInviteLink('');
    setInviteSearch('');
    setInviteBranchId('');
    setInviteDivisionId('');
    setInviteStructureBranches([]);
    setInviteContextLabel('');
    setInviteModalOpen(true);
    setLoadingInviteFriends(true);
    setGeneratingInviteLink(true);
    try {
      const [friendsPayload, structurePayload] = await Promise.all([
        friendService.getFriends(),
        organizationAPI.getStructure(orgId),
      ]);

      const data = unwrapData(friendsPayload);
      const rawList = Array.isArray(data?.friends) ? data.friends : Array.isArray(data) ? data : [];
      const normalized = rawList.map((item) => {
        const raw = item.friendId || item;
        const id = raw?._id || raw?.id;
        return {
          id,
          name: raw?.displayName || raw?.name || raw?.username || t('organizations.userFallback'),
          username: raw?.username || raw?.email || '',
          avatar: raw?.avatar || null,
        };
      });
      setInviteFriends(normalized.filter((friend) => !!friend.id));

      const structureBody = unwrapData(structurePayload);
      const branches = Array.isArray(structureBody?.branches)
        ? structureBody.branches
        : Array.isArray(structureBody)
          ? structureBody
          : [];
      setInviteStructureBranches(branches);
      const defaultBranchId = branches[0]?._id ? String(branches[0]._id) : '';
      const defaultDivisionId = branches[0]?.divisions?.[0]?._id
        ? String(branches[0].divisions[0]._id)
        : '';
      setInviteBranchId(defaultBranchId);
      setInviteDivisionId(defaultDivisionId);

      const invitePayload = await organizationAPI.createInviteLink(orgId, {
        branchId: defaultBranchId || undefined,
        divisionId: defaultDivisionId || undefined,
      });
      const inviteData = unwrapData(invitePayload);
      setGeneratedInviteLink(inviteData?.inviteUrl || '');
      const branchName = String(inviteData?.context?.branchName || '').trim();
      const divisionName = String(inviteData?.context?.divisionName || '').trim();
      const label = [branchName, divisionName].filter(Boolean).join(' / ');
      setInviteContextLabel(label);
    } catch (error) {
      setInviteFriends([]);
      setGeneratedInviteLink('');
      notifyError(t('organizations.inviteInitFail'));
    } finally {
      setLoadingInviteFriends(false);
      setGeneratingInviteLink(false);
    }
  };

  const regenerateInviteLinkWithContext = async (orgId, branchId, divisionId) => {
    if (!orgId) return;
    setGeneratingInviteLink(true);
    try {
      const invitePayload = await organizationAPI.createInviteLink(orgId, {
        branchId: branchId || undefined,
        divisionId: divisionId || undefined,
      });
      const inviteData = unwrapData(invitePayload);
      setGeneratedInviteLink(inviteData?.inviteUrl || '');
      const branchName = String(inviteData?.context?.branchName || '').trim();
      const divisionName = String(inviteData?.context?.divisionName || '').trim();
      setInviteContextLabel([branchName, divisionName].filter(Boolean).join(' / '));
    } catch (error) {
      setGeneratedInviteLink('');
      notifyError('Không thể tạo link mời theo chi nhánh/khối đã chọn');
    } finally {
      setGeneratingInviteLink(false);
    }
  };

  const handleInviteFriendToOrganization = async (friendId) => {
    if (!inviteOrgId || !friendId) return;
    setInvitingIds((prev) => (prev.includes(friendId) ? prev : [...prev, friendId]));
    try {
      await organizationAPI.addMember(inviteOrgId, { userId: friendId, role: 'member' });
      notifySuccess(t('organizations.inviteSent'));
    } catch (error) {
      notifyError(t('organizations.inviteFail'));
    } finally {
      setInvitingIds((prev) => prev.filter((id) => id !== friendId));
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteLink) return;
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      notifySuccess(t('organizations.linkCopied'));
    } catch (error) {
      notifyError(t('organizations.linkCopyFail'));
    }
  };

  const handleRespondInvitation = async (invitationId, action) => {
    if (!invitationId) return;
    setRespondingInvitationIds((prev) =>
      prev.includes(invitationId) ? prev : [...prev, invitationId]
    );
    try {
      const res = await organizationAPI.respondInvitation(invitationId, action);
      const body = res?.data ?? res;
      const data = body?.data ?? body;
      if (action === 'accept') {
        if (data?.requiresJoinApplication && data?.requiresAnswers) {
          const orgId = data.organizationId;
          const qs = new URLSearchParams();
          if (data.organizationName) qs.set('name', data.organizationName);
          const q = qs.toString();
          navigate(`/workspaces/join/${encodeURIComponent(orgId)}${q ? `?${q}` : ''}`);
          notifySuccess(body?.message || 'Vui lòng điền form gia nhập để gửi xét duyệt');
        } else if (data?.requiresJoinApplication) {
          notifySuccess(body?.message || 'Đã gửi đơn, vui lòng chờ quản trị viên xét duyệt');
        } else {
          notifySuccess(t('organizations.inviteAccepted'));
        }
      } else {
        notifySuccess(t('organizations.inviteDeclined'));
      }
      await Promise.all([
        loadOrganizations(),
        loadPendingInvitations(),
        loadPendingJoinApplications(),
        loadJoinApplicationsToReview(),
      ]);
    } catch (error) {
      notifyError(t('organizations.inviteHandleFail'));
    } finally {
      setRespondingInvitationIds((prev) => prev.filter((id) => id !== invitationId));
    }
  };

  const handleCreateChannel = async (channelType = 'chat') => {
    if (!selectedOrganizationId || !selectedDepartmentId || !selectedTeamId) {
      notifyError('Vui lòng chọn phòng ban và team trước khi tạo kênh');
      return;
    }

    setCreateChannelType(channelType);
    setCreateChannelName('');
    setCreateChannelBranchId(String(selectedBranchId || ''));
    setCreateChannelDivisionId(String(selectedDivisionId || ''));
    setCreateChannelDepartmentId(String(selectedDepartmentId || ''));
    setCreateChannelTeamId(String(selectedTeamId));
    setCreateChannelModalOpen(true);
  };

  const handleSubmitCreateChannel = async () => {
    if (!createChannelName.trim()) {
      notifyError(t('organizations.channelNameRequired'));
      return;
    }
    if (!createChannelTeamId) {
      notifyError('Vui lòng chọn team');
      return;
    }

    try {
      await organizationAPI.createChannelByTeam(selectedOrganizationId, createChannelTeamId, {
        name: createChannelName.trim(),
        type: createChannelType,
      });
      notifySuccess(t('organizations.channelCreated'));
      setSelectedBranchId(createChannelBranchId);
      setSelectedDivisionId(createChannelDivisionId);
      setSelectedDepartmentId(createChannelDepartmentId);
      setSelectedTeamId(createChannelTeamId);
      setCreateChannelModalOpen(false);
      await loadChannels(selectedOrganizationId, createChannelDepartmentId, createChannelTeamId);
    } catch (error) {
      notifyError(t('organizations.channelCreateFail'));
    }
  };

  const openRenameModal = (type, entity) => {
    if (!entity?._id) return;
    setRenameTargetType(type);
    setRenameTargetId(String(entity._id));
    setRenameTargetName(String(entity?.name || ''));
    setRenameModalOpen(true);
  };

  const handleSubmitRenameEntity = async () => {
    const nextName = String(renameTargetName || '').trim();
    if (!nextName) {
      notifyError('Tên mới không được để trống');
      return;
    }
    try {
      if (renameTargetType === 'division') {
        await organizationAPI.updateDivision(selectedOrganizationId, renameTargetId, { name: nextName });
      } else if (renameTargetType === 'department') {
        await organizationAPI.updateDepartment(selectedOrganizationId, renameTargetId, { name: nextName });
      } else if (renameTargetType === 'team') {
        await organizationAPI.updateTeamByHierarchy(selectedOrganizationId, renameTargetId, { name: nextName });
      } else if (renameTargetType === 'channel') {
        if (!selectedTeamId) {
          notifyError('Vui lòng chọn team chứa kênh');
          return;
        }
        await organizationAPI.updateChannelByTeam(selectedOrganizationId, selectedTeamId, renameTargetId, {
          name: nextName,
        });
      }
      notifySuccess('Đã cập nhật tên');
      setRenameModalOpen(false);
      await loadStructure(selectedOrganizationId);
      if (selectedDepartmentId) await loadTeams(selectedOrganizationId, selectedDepartmentId);
      if (selectedDepartmentId) {
        await loadChannels(selectedOrganizationId, selectedDepartmentId, selectedTeamId);
      }
    } catch {
      notifyError('Không thể đổi tên, vui lòng thử lại');
    }
  };

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedChannelId || sendingMessage) return;

    setSendingMessage(true);
    try {
      const replyId = replyingToMessage?._id || replyingToMessage?.id;
      const body = {
        roomId: selectedChannelId,
        content,
        messageType: 'text',
        organizationId: selectedOrganizationId || undefined,
      };
      if (replyId) body.replyToMessageId = replyId;
      const payload = await api.post('/messages', body);
      const created = unwrapData(payload);
      setMessages((prev) => [...prev, created]);
      setMessageInput('');
      setReplyingToMessage(null);
    } catch (error) {
      notifyError(t('organizations.sendMessageFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendVoiceRoomMessage = async () => {
    const content = voiceMessageInput.trim();
    if (!content || !selectedChannelId || sendingMessage || selectedChannelType !== 'voice') return;

    setSendingMessage(true);
    try {
      const body = {
        roomId: selectedChannelId,
        content,
        messageType: 'text',
        organizationId: selectedOrganizationId || undefined,
      };
      const payload = await api.post('/messages', body);
      const created = unwrapData(payload);
      setVoiceRoomMessages((prev) => {
        const id = created?._id || created?.id;
        if (id && prev.some((m) => String(m._id || m.id) === String(id))) return prev;
        return [...prev, created].sort(
          (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
        );
      });
      setVoiceMessageInput('');
    } catch {
      notifyError(t('organizations.sendMessageFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleVoiceRoomSessionEnd = useCallback(
    (payload) => {
      setVoiceRoomMessages([]);
      setVoiceMessageInput('');
      if (payload?.recordingSaved) {
        notifySuccess(t('orgPanel.voiceRecordingSaved'));
      }
    },
    [t]
  );

  const handleSaveMessageEdit = async (messageId, content) => {
    try {
      const res = await api.patch(`/messages/${messageId}/edit`, { content });
      const raw = unwrapData(res);
      const updated = raw?.data !== undefined ? raw.data : raw;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      notifySuccess(t('organizations.msgUpdated'));
    } catch {
      notifyError(t('organizations.editFail'));
    }
  };

  const requestDeleteChannelMessage = (messageId) => {
    if (!messageId) return;
    setDeleteChannelMsgConfirmId(messageId);
  };

  const confirmDeleteChannelMessage = async () => {
    const messageId = deleteChannelMsgConfirmId;
    if (!messageId) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(messageId)));
      notifySuccess(t('organizations.msgDeleted'));
    } catch {
      notifyError(t('organizations.deleteFail'));
    }
  };

  const handleForwardRequest = (msg) => {
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const handleForwardConfirm = async ({ channelIds, note }) => {
    if (!forwardSourceMessage || !channelIds?.length) return;
    const chName = selectedChannel?.name || t('organizations.channelNameFallback');
    const preview = String(forwardSourceMessage.content || '').trim().slice(0, 500);
    const header = t('organizations.forwardHeader', { name: chName });
    const body = [note, header, preview].filter(Boolean).join('\n\n');
    setSendingMessage(true);
    try {
      for (const cid of channelIds) {
        await api.post('/messages', {
          roomId: cid,
          content: body,
          messageType: 'text',
          organizationId: selectedOrganizationId || undefined,
        });
      }
      notifySuccess(t('organizations.forwardOk'));
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
    } catch {
      notifyError(t('organizations.forwardFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleQuickReactMessage = (_message, _emoji) => {
    notify(t('organizations.reactionInfo'), 'info');
  };

  const handleSendChatOption = async ({ kind, file, payload }) => {
    if (!selectedChannelId || sendingMessage) return;

    let messageType = 'system';
    let content = '';

    if (kind === 'file' && file) {
      setSendingMessage(true);
      setChannelUploadProgress(0);
      try {
        const normalized = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'org_room',
            roomId: selectedChannelId,
            organizationId: selectedOrganizationId || undefined,
          },
          (p) => setChannelUploadProgress(p)
        );
        const unwrapped = unwrapData({ data: normalized });
        setMessages((prev) => [...prev, unwrapped]);
        notifySuccess(t('organizations.fileSent'));
      } catch (error) {
        notifyError(error.response?.data?.message || error.message || t('organizations.fileSendFail'));
      } finally {
        setChannelUploadProgress(null);
        setSendingMessage(false);
      }
      return;
    }
    if (kind === 'image' && file) {
      setSendingMessage(true);
      setChannelUploadProgress(0);
      try {
        const normalized = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'org_room',
            roomId: selectedChannelId,
            organizationId: selectedOrganizationId || undefined,
          },
          (p) => setChannelUploadProgress(p)
        );
        const unwrapped = unwrapData({ data: normalized });
        setMessages((prev) => [...prev, unwrapped]);
        notifySuccess(t('organizations.imageSent'));
      } catch (error) {
        notifyError(error.response?.data?.message || error.message || t('organizations.imageSendFail'));
      } finally {
        setChannelUploadProgress(null);
        setSendingMessage(false);
      }
      return;
    } else if (kind === 'contact') {
      messageType = 'business_card';
      let fields = normalizeBusinessCardFields({
        userId: payload?.userId || '',
        fullName: payload?.fullName || '',
        phone: payload?.phone || '',
        email: payload?.email || '',
        username: payload?.username || '',
      });
      const uid = fields.userId;
      if (uid && !uid.startsWith('manual-') && (!fields.phone || !fields.email || !looksLikeEmail(fields.email))) {
        try {
          const res = await userService.getProfile(uid);
          const body = unwrapData(res);
          const profile = body?.data ?? body;
          fields = applyProfileToBusinessCard(fields, profile);
        } catch {
          /* giữ snapshot từ form chọn liên hệ */
        }
      }
      content = JSON.stringify({
        userId: fields.userId,
        fullName: fields.fullName,
        phone: fields.phone,
        email: fields.email && looksLikeEmail(fields.email) ? fields.email : '',
        avatar: payload?.avatar || '',
        username: fields.username || payload?.username || '',
        role: payload?.role || '',
      });
    } else if (kind === 'poll') {
      messageType = 'system';
      const options = Array.isArray(payload?.options) ? payload.options : [];
      content = t('organizations.poll', {
        q: payload?.question || '',
        options: options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n'),
      });
    } else if (kind === 'topic') {
      messageType = 'system';
      const topicText = String(messageInput || '').trim();
      if (!topicText) {
        notifyError('Vui long nhap noi dung chu de');
        return;
      }
      content = `Topic: ${topicText}`;
    } else {
      return;
    }

    setSendingMessage(true);
    try {
      const created = await api.post('/messages', {
        roomId: selectedChannelId,
        content,
        messageType,
        organizationId: selectedOrganizationId || undefined,
      });
      let normalized = unwrapData(created);
      if (messageType === 'business_card') {
        const [one] = await enrichMessagesBusinessCards([normalized]);
        normalized = one || normalized;
      }
      setMessages((prev) => [...prev, normalized]);
      notifySuccess(t('organizations.customSent'));
    } catch (error) {
      notifyError(t('organizations.customFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    if (landingDemo) {
      setOrganizations([
        {
          _id: 'demo-org-vh',
          id: 'demo-org-vh',
          name: 'VoiceHub Demo',
          slug: 'voicehub-demo',
          role: 'admin',
        },
      ]);
      setOrganizationsLoaded(true);
      setSelectedOrganizationId('demo-org-vh');
      return;
    }
    Promise.all([
      loadOrganizations(),
      loadPendingInvitations(),
      loadPendingJoinApplications(),
      loadJoinApplicationsToReview(),
    ]);
    loadChatContacts();
  }, [landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    loadChatContacts(selectedOrganizationId);
  }, [selectedOrganizationId, landingDemo]);

  useEffect(() => {
    if (!initialWorkspaceSlug) return;
    const wantedSlug = String(initialWorkspaceSlug).trim();
    if (!wantedSlug) return;
    const matchedWorkspace = organizations.find((item) => String(item.slug || '') === wantedSlug);
    if (matchedWorkspace) {
      setSelectedOrganizationId(String(matchedWorkspace._id));
      return;
    }
    if (!organizationsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await organizationAPI.getWorkspaceBySlug(wantedSlug);
        const raw = unwrapData(payload);
        const org = raw?.data ?? raw;
        if (!org?._id || cancelled) return;
        setOrganizations((prev) => {
          if (prev.some((o) => String(o._id) === String(org._id))) return prev;
          return [org, ...prev];
        });
        setSelectedOrganizationId(String(org._id));
        if (org?.slug) setLastWorkspaceSlug(org.slug);
      } catch {
        if (!cancelled) {
          setLastWorkspaceSlug('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialWorkspaceSlug, organizations, organizationsLoaded, t]);

  useEffect(() => {
    if (!forwardModalOpen || !selectedOrganizationId || !departments.length) {
      if (!forwardModalOpen) setForwardTargets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setForwardTargetsLoading(true);
      try {
        const blocks = await Promise.all(
          departments.map(async (d) => {
            const payload = await organizationAPI.getChannels(selectedOrganizationId, d._id);
            const list = unwrapData(payload);
            const arr = Array.isArray(list) ? list : [];
            return {
              departmentId: d._id,
              departmentName: displayDepartmentName(d.name, locale) || t('organizations.deptFallback'),
              channels: arr,
            };
          })
        );
        if (!cancelled) setForwardTargets(blocks);
      } catch {
        if (!cancelled) setForwardTargets([]);
      } finally {
        if (!cancelled) setForwardTargetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forwardModalOpen, selectedOrganizationId, departments, locale, t]);

  /** Mở đúng kênh tổ chức khi điều hướng từ Chat bạn bè (tin chưa đọc). */
  useEffect(() => {
    if (landingDemo) return;
    if (!location.state?.openCreateWorkspace) return;
    handleCreateOrganization();
    navigate(location.pathname + location.search, {
      replace: true,
      state: { ...location.state, openCreateWorkspace: undefined },
    });
  }, [landingDemo, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (landingDemo) return;
    const target = location.state?.openWorkspace;
    if (!target?.organizationId || !target?.channelId) return;
    if (!organizations.length) return;
    const orgExists = organizations.some((o) => String(o._id) === String(target.organizationId));
    if (!orgExists) return;

    setSelectedOrganizationId(String(target.organizationId));
    if (target.departmentId) {
      setSelectedDepartmentId(String(target.departmentId));
    }
    setSelectedChannelId(String(target.channelId));
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [organizations, location.state, navigate, landingDemo]);

  useEffect(() => {
    if (!shouldRedirectEmptyOrganizations) return;
    navigate('/dashboard', { replace: true });
  }, [shouldRedirectEmptyOrganizations, navigate]);

  useEffect(() => {
    if (landingDemo) return;
    const params = new URLSearchParams(window.location.search);
    const orgIdFromUrl = params.get('orgId') || params.get('inviteOrgId');
    const tokenFromUrl = params.get('inviteToken');
    if (!orgIdFromUrl || !tokenFromUrl) {
      return;
    }

    const joinOrganizationByLink = async () => {
      let navigatedToJoinForm = false;
      try {
        const res = await organizationAPI.joinByInviteLink(orgIdFromUrl, tokenFromUrl);
        const body = res?.data ?? res;
        const data = body?.data ?? body;
        if (data?.requiresJoinApplication) {
          if (data?.requiresAnswers) {
            navigatedToJoinForm = true;
            const qs = new URLSearchParams();
            if (data.organizationName) qs.set('name', data.organizationName);
            const q = qs.toString();
            navigate(
              `/workspaces/join/${encodeURIComponent(orgIdFromUrl)}${q ? `?${q}` : ''}`,
              { replace: true }
            );
          } else {
            notifySuccess(body?.message || 'Đã gửi đơn, vui lòng chờ quản trị viên xét duyệt');
            await Promise.all([
              loadOrganizations(),
              loadPendingInvitations(),
              loadPendingJoinApplications(),
              loadJoinApplicationsToReview(),
            ]);
          }
        } else {
          notifySuccess(inviteJoinSuccessText(data));
          await Promise.all([
            loadOrganizations(),
            loadPendingInvitations(),
            loadPendingJoinApplications(),
            loadJoinApplicationsToReview(),
          ]);
        }
      } catch (error) {
        notifyError(t('organizations.joinInviteFail'));
      } finally {
        if (!navigatedToJoinForm) {
          params.delete('orgId');
          params.delete('inviteOrgId');
          params.delete('inviteToken');
          const nextQuery = params.toString();
          const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
          window.history.replaceState({}, '', nextUrl);
        }
      }
    };

    joinOrganizationByLink();
  }, [landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadStructure(selectedOrganizationId);
      loadChannelPermissions(selectedOrganizationId);
      loadTaskWorkspaceScope(selectedOrganizationId);
    }
  }, [selectedOrganizationId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (!selectedOrganizationId || !selectedDepartmentId) return;
    let cancelled = false;
    (async () => {
      const teamId = await loadTeams(selectedOrganizationId, selectedDepartmentId);
      if (cancelled) return;
      await loadChannels(
        selectedOrganizationId,
        selectedDepartmentId,
        teamId,
        selectedDivisionId
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedOrganizationId, selectedDepartmentId, selectedDivisionId, workspaceStructure, landingDemo]);

  useEffect(() => {
    if (landingDemo) return undefined;
    const onStructureChanged = (event) => {
      if (String(event?.detail?.orgId || '') !== String(selectedOrganizationId || '')) return;
      if (!selectedOrganizationId || !selectedDepartmentId) return;
      loadStructure(selectedOrganizationId);
      loadChannels(
        selectedOrganizationId,
        selectedDepartmentId,
        selectedTeamId,
        selectedDivisionId
      );
    };
    window.addEventListener('vh:org-structure-changed', onStructureChanged);
    return () => window.removeEventListener('vh:org-structure-changed', onStructureChanged);
  }, [
    landingDemo,
    selectedOrganizationId,
    selectedDepartmentId,
    selectedTeamId,
    selectedDivisionId,
  ]);

  useEffect(() => {
    if (landingDemo) return;
    if (!selectedOrganizationId || !selectedDepartmentId || !selectedTeamId) return;
    if (!channels.length) return;
    setSelectedChannelId((prev) => {
      const current = channels.find((ch) => String(ch._id) === String(prev));
      if (current) {
        if (!String(current.team || '')) return prev;
        if (String(current.team || '') === String(selectedTeamId)) return prev;
      }
      return preferDefaultTextChannelId(channels, selectedTeamId, channelPermissionMatrix);
    });
  }, [selectedTeamId, channelPermissionMatrix, channels, landingDemo]);

  useEffect(() => {
    if (landingDemo || !channels.length) return;
    const matrixReady = Object.keys(channelPermissionMatrix || {}).length > 0;
    if (!matrixReady) return;
    const currentPerm = channelPermissionMatrix?.[String(selectedChannelId)];
    if (selectedChannelId && currentPerm?.canRead) return;
    const next = preferDefaultTextChannelId(channels, selectedTeamId, channelPermissionMatrix);
    if (String(next || '') !== String(selectedChannelId || '')) {
      setSelectedChannelId(next);
    }
  }, [channelPermissionMatrix, channels, selectedTeamId, selectedChannelId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (!selectedOrganizationId) return;
    if (!selectedChannelId) {
      setMessages([]);
      return;
    }
    if (selectedChannel?.type === 'voice') {
      setLoadingMessages(false);
      setMessages([]);
      return;
    }
    loadMessages(selectedChannelId);
  }, [selectedOrganizationId, selectedChannelId, selectedChannel?.type, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedChannelType !== 'voice') {
      setVoiceChatDismissed(false);
      return;
    }
    setVoiceChatDismissed(false);
    setVoiceRoomMessages([]);
    setVoiceMessageInput('');
  }, [selectedChannelId, selectedChannelType, landingDemo]);

  useEffect(() => {
    if (landingDemo || selectedChannelType !== 'voice' || !selectedChannelId) return undefined;
    if (!joinRoom || !leaveRoom) return undefined;

    const roomKey = String(selectedChannelId);
    joinRoom(roomKey);

    const appendVoiceMessage = (msg) => {
      const rid = String(msg?.roomId || msg?.room || '');
      if (rid !== roomKey) return;
      setVoiceRoomMessages((prev) => {
        const id = msg?._id || msg?.id;
        if (id && prev.some((m) => String(m._id || m.id) === String(id))) return prev;
        return [...prev, msg].sort(
          (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
        );
      });
    };

    on?.('message:received', appendVoiceMessage);
    return () => {
      off?.('message:received', appendVoiceMessage);
      leaveRoom(roomKey);
    };
  }, [
    selectedChannelId,
    selectedChannelType,
    landingDemo,
    joinRoom,
    leaveRoom,
    on,
    off,
  ]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedChannelType !== 'voice') {
      previousVoiceChannelIdRef.current = '';
      return;
    }
    const currentVoiceId = String(selectedChannelId || '');
    const previousVoiceId = String(previousVoiceChannelIdRef.current || '');
    if (previousVoiceId && previousVoiceId !== currentVoiceId) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const now = ctx.currentTime;
          const o1 = ctx.createOscillator();
          const o2 = ctx.createOscillator();
          const gain = ctx.createGain();
          o1.type = 'sine';
          o2.type = 'sine';
          o1.frequency.setValueAtTime(740, now);
          o2.frequency.setValueAtTime(980, now + 0.06);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
          o1.connect(gain);
          o2.connect(gain);
          gain.connect(ctx.destination);
          o1.start(now);
          o1.stop(now + 0.08);
          o2.start(now + 0.06);
          o2.stop(now + 0.18);
          window.setTimeout(() => ctx.close().catch(() => {}), 260);
        }
      } catch {
        // Không chặn luồng đổi kênh nếu âm báo thất bại.
      }
    }
    previousVoiceChannelIdRef.current = currentVoiceId;
  }, [selectedChannelType, selectedChannelId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadWorkspaceTasks(selectedOrganizationId);
    }
  }, [selectedOrganizationId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (!on || !off) return;

    const refreshOrgData = () => {
      loadOrganizations();
      loadPendingInvitations();
      loadPendingJoinApplications();
      loadJoinApplicationsToReview();
    };

    const handleOrgEvent = () => {
      refreshOrgData();
    };

    on('organization:invitation_received', handleOrgEvent);
    on('organization:invitation_accepted', handleOrgEvent);
    on('organization:invitation_rejected', handleOrgEvent);
    on('organization:member_joined', handleOrgEvent);
    on('organization:member_removed', handleOrgEvent);
    on('organization:member_role_updated', handleOrgEvent);
    on('organization:updated', handleOrgEvent);
    on('organization:join_application_created', handleOrgEvent);
    on('organization:join_application_approved', handleOrgEvent);
    on('organization:join_application_rejected', handleOrgEvent);

    return () => {
      off('organization:invitation_received', handleOrgEvent);
      off('organization:invitation_accepted', handleOrgEvent);
      off('organization:invitation_rejected', handleOrgEvent);
      off('organization:member_joined', handleOrgEvent);
      off('organization:member_removed', handleOrgEvent);
      off('organization:member_role_updated', handleOrgEvent);
      off('organization:updated', handleOrgEvent);
      off('organization:join_application_created', handleOrgEvent);
      off('organization:join_application_approved', handleOrgEvent);
      off('organization:join_application_rejected', handleOrgEvent);
    };
  }, [on, off, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (!location.state?.refreshPendingJoin) return;
    void loadPendingJoinApplications();
    const rest = { ...location.state };
    delete rest.refreshPendingJoin;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: Object.keys(rest).length ? rest : undefined,
    });
  }, [location.state?.refreshPendingJoin]);

  useEffect(() => {
    if (!on || !off) return;
    const bump = () => setMemberListRefreshKey((k) => k + 1);
    on('organization:member_joined', bump);
    on('organization:member_removed', bump);
    on('organization:member_role_updated', bump);
    on('organization:join_application_approved', bump);
    return () => {
      off('organization:member_joined', bump);
      off('organization:member_removed', bump);
      off('organization:member_role_updated', bump);
      off('organization:join_application_approved', bump);
    };
  }, [on, off]);

  useEffect(() => {
    if (!on || !off || !selectedOrganizationId) return;
    const currentUid = String(user?.userId || user?._id || user?.id || '');
    const refreshIfMatchOrg = (evt) => {
      const payload = evt?.payload || evt || {};
      const eventOrgId = payload?.organizationId || evt?.organizationId || null;
      if (eventOrgId && String(eventOrgId) !== String(selectedOrganizationId)) return;
      const targetUserId = String(payload?.userId || evt?.userId || '');
      if (!targetUserId || targetUserId === currentUid) {
        loadChannelPermissions(selectedOrganizationId);
      }
    };
    on('organization:member_role_updated', refreshIfMatchOrg);
    on('organization:member_joined', refreshIfMatchOrg);
    on('organization:member_removed', refreshIfMatchOrg);
    return () => {
      off('organization:member_role_updated', refreshIfMatchOrg);
      off('organization:member_joined', refreshIfMatchOrg);
      off('organization:member_removed', refreshIfMatchOrg);
    };
  }, [on, off, selectedOrganizationId, user?.userId, user?._id, user?.id]);

  const orgCenterShell = isDarkMode
    ? 'flex h-full min-h-0 min-w-0 flex-col bg-[#0b0e14] text-slate-100'
    : `flex h-full min-h-0 min-w-0 flex-col ${appShellBg(false)} text-slate-900`;

  if (shouldRedirectEmptyOrganizations) {
    return null;
  }

  const sidebarDepartments = selectedDivisionId
    ? departments.filter((d) => String(d.division || '') === String(selectedDivisionId))
    : departments;
  const visibleBranches = membershipScope?.divisionId
    ? workspaceStructure
        .map((branch) => {
          const nextDivisions = (branch?.divisions || []).filter(
            (division) => String(division._id) === String(membershipScope.divisionId)
          );
          if (!nextDivisions.length) return null;
          return { ...branch, divisions: nextDivisions };
        })
        .filter(Boolean)
    : workspaceStructure;
  const branchOptions = Array.isArray(workspaceStructure) ? workspaceStructure : [];
  const divisionOptions = (branchId) => {
    const branch = branchOptions.find((b) => String(b._id) === String(branchId));
    return Array.isArray(branch?.divisions) ? branch.divisions : [];
  };
  const departmentOptions = (branchId, divisionId) => {
    const divs = divisionOptions(branchId);
    const division = divs.find((d) => String(d._id) === String(divisionId));
    return Array.isArray(division?.departments) ? division.departments : [];
  };
  const teamOptions = (branchId, divisionId, departmentId) => {
    const depts = departmentOptions(branchId, divisionId);
    const dept = depts.find((d) => String(d._id) === String(departmentId));
    return Array.isArray(dept?.teams) ? dept.teams : [];
  };

  return (
    <>
      <ThreeFrameLayout
        landingDemo={landingDemo}
        center={
          <div className={orgCenterShell}>
          <OrganizationMainPanel
            landingDemo={landingDemo}
            workspaceTabView={workspaceTabView}
            selectedOrganization={selectedOrganization}
            departments={sidebarDepartments}
            selectedDepartment={selectedDepartment}
            branches={visibleBranches}
            selectedBranchId={selectedBranchId}
            selectedDivisionId={selectedDivisionId}
            channelPermissionMatrix={channelPermissionMatrix}
            membershipScope={membershipScope}
            onSelectBranch={handleSelectBranch}
            onSelectDivision={handleSelectDivision}
            teams={teams.filter((team) => String(team.department) === String(selectedDepartmentId))}
            selectedTeamId={selectedTeamId}
            channels={channels}
            selectedChannelId={selectedChannelId}
            messages={messages}
            messageInput={messageInput}
            onChangeMessageInput={setMessageInput}
            onSendMessage={handleSendMessage}
            loadingMessages={loadingMessages}
            sendingMessage={sendingMessage}
            currentUserId={user?.userId || user?._id || user?.id}
            currentUser={user}
            onSelectChannel={handleSelectChannel}
            onSelectDepartment={handleSelectDepartment}
            onSelectTeam={setSelectedTeamId}
            onOpenNotificationsPage={openWorkspaceNotifications}
            onCreateDivision={handleCreateDivision}
            onCreateDepartment={handleCreateDepartment}
            onCreateTeam={handleCreateTeam}
            onCreateChannel={handleCreateChannel}
            onOpenChannelSettings={handleOpenChannelSettings}
            onRenameDivision={(division) => openRenameModal('division', division)}
            onRenameDepartment={(department) => openRenameModal('department', department)}
            onRenameTeam={(team) => openRenameModal('team', team)}
            onRenameChannel={(channel) => openRenameModal('channel', channel)}
            onSendChatOption={handleSendChatOption}
            chatContacts={chatContacts}
            loadingChatContacts={loadingChatContacts}
            loadingChannels={loadingChannels}
            loadingDepartments={loadingDepartments}
            channelUploadProgress={channelUploadProgress}
            replyingToMessage={replyingToMessage}
            onClearReply={() => setReplyingToMessage(null)}
            onReplyToMessage={(m) => setReplyingToMessage(m)}
            onSaveMessageEdit={handleSaveMessageEdit}
            onDeleteMessage={requestDeleteChannelMessage}
            onForwardMessage={handleForwardRequest}
            onQuickReactMessage={handleQuickReactMessage}
            workspaceOnlineUserIds={onlineUsers}
            workspaceSearchOpen={workspaceSearchOpen}
            onWorkspaceSearchOpenChange={setWorkspaceSearchOpen}
            onWorkspaceSearchJump={({ roomId, organizationId }) => {
              if (organizationId) setSelectedOrganizationId(String(organizationId));
              if (roomId) setSelectedChannelId(String(roomId));
              setWorkspaceSearchOpen(false);
            }}
            workspaceTasks={workspaceTasks}
            loadingWorkspaceTasks={loadingWorkspaceTasks}
            taskWorkspaceScope={taskWorkspaceScope}
            onMoveWorkspaceTask={handleMoveWorkspaceTask}
            onCreateWorkspaceTask={handleCreateWorkspaceTask}
            onOpenOrganizationSettings={handleOpenOrganizationSettingsModal}
            onInviteOrganization={handleInviteOrganization}
            canInviteMembers={['owner', 'admin', 'hr'].includes(
              String(selectedOrganization?.myRole || '').toLowerCase()
            )}
            canManageWorkspaceStructure={
              isOrgMembershipStructureAdmin(selectedOrganization?.myRole) ||
              Boolean(membershipScope?.canSeeAllStructure)
            }
            canSeeAllStructure={
              Boolean(membershipScope?.canSeeAllStructure) ||
              isOrgMembershipStructureAdmin(selectedOrganization?.myRole)
            }
            onWorkspaceTabChange={setWorkspaceTabView}
            onDisconnectVoice={() => setSelectedChannelId('')}
            organizationId={selectedOrganizationId}
            onVoiceRoomSessionEnd={handleVoiceRoomSessionEnd}
            onOpenVoiceChatSidebar={() => setVoiceChatDismissed(false)}
            voiceChatSidebarOpen={
              selectedChannelType === 'voice' && !workspaceSearchOpen && !voiceChatDismissed
            }
          />
          </div>
        }
        right={
          selectedOrganizationId ? (
            selectedChannelType === 'voice' && !workspaceSearchOpen && !voiceChatDismissed ? (
              <OrganizationVoiceChannelSidebar
                channelName={selectedChannel?.name || ''}
                messages={voiceRoomMessages}
                messageInput={voiceMessageInput}
                onChangeMessageInput={setVoiceMessageInput}
                onSendMessage={handleSendVoiceRoomMessage}
                sendingMessage={sendingMessage}
                currentUserId={user?.userId || user?._id || user?.id}
                onClose={() => setVoiceChatDismissed(true)}
              />
            ) : (
            <OrganizationMemberSidebar
              organizationId={selectedOrganizationId}
              organizationName={selectedOrganization?.name || ''}
              workspaceSearchOpen={workspaceSearchOpen}
              onWorkspaceSearchOpenChange={setWorkspaceSearchOpen}
              searchChannels={channels.filter((c) => c.type !== 'voice')}
              serverId={selectedOrganization?.serverId}
              onWorkspaceSearchJump={({ roomId, organizationId }) => {
                if (organizationId) setSelectedOrganizationId(String(organizationId));
                if (roomId) setSelectedChannelId(String(roomId));
                setWorkspaceSearchOpen(false);
              }}
              onlineUsers={onlineUsers}
              socketConnected={socketConnected}
              refreshKey={memberListRefreshKey}
              currentUserId={user?.userId || user?._id || user?.id}
              myRole={selectedOrganization?.myRole}
              canReviewJoinApplications={['owner', 'admin'].includes(
                String(selectedOrganization?.myRole || '').toLowerCase()
              )}
              joinApplicationsToReview={joinApplicationsToReview.filter(
                (app) => String(app.organizationId) === String(selectedOrganizationId)
              )}
              loadingJoinApplicationsToReview={loadingJoinApplicationsToReview}
              respondingJoinReviewKeys={respondingJoinReviewKeys}
              onApproveJoinApplication={handleApproveJoinApplication}
              onRejectJoinApplication={handleRejectJoinApplication}
              onMentionUser={(text) => {
                if (selectedChannelType === 'voice') {
                  setVoiceMessageInput((prev) => `${prev || ''}${text}`);
                } else {
                  setMessageInput((prev) => `${prev || ''}${text}`);
                }
              }}
              onMemberRemoved={() => setMemberListRefreshKey((k) => k + 1)}
            />
            )
          ) : null
        }
        rightWidth={
          selectedChannelType === 'voice' && !workspaceSearchOpen && !voiceChatDismissed
            ? 'w-[340px]'
            : 'w-[280px]'
        }
      />
      {workspaceNotificationsOpen && (
        <Modal
          isOpen={workspaceNotificationsOpen}
          onClose={() => setWorkspaceNotificationsOpen(false)}
          title={`Thong bao - ${selectedOrganization?.name || ''}`}
          size="lg"
        >
          <div className="space-y-3">
            {loadingWorkspaceNotifications ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300">
                Dang tai thong bao...
              </div>
            ) : workspaceNotifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-gray-400">
                Chua co thong bao trong to chuc nay.
              </div>
            ) : (
              workspaceNotifications.map((item) => (
                <button
                  key={item._id || item.id}
                  type="button"
                  onClick={() => {
                    const data = item.data || {};
                    if (item.type === 'document' || data.documentId) {
                      navigate(`/documents?organizationId=${encodeURIComponent(selectedOrganizationId)}`);
                    } else if (item.type === 'task_assigned' || item.type === 'task_completed' || data.taskId) {
                      navigate(`/w/${encodeURIComponent(selectedOrganization?.slug || selectedOrganizationId)}?tab=tasks`);
                    } else {
                      navigate(`/w/${encodeURIComponent(selectedOrganization?.slug || selectedOrganizationId)}`);
                    }
                    setWorkspaceNotificationsOpen(false);
                  }}
                  className="block w-full rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {item.title || t('notifications.defaultTitle')}
                      </div>
                      {(item.organizationName || item.data?.organizationName || item.data?.workspaceName) && (
                        <div className="mt-1 truncate text-[11px] uppercase tracking-wide text-cyan-300">
                          {item.organizationName || item.data?.workspaceName || item.data?.organizationName}
                        </div>
                      )}
                      <div className="mt-1 line-clamp-2 text-sm text-gray-400">
                        {item.content || item.message || ''}
                      </div>
                    </div>
                    {!item.isRead ? (
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-400" />
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
        </Modal>
      )}
      {leaveOrgModalOpen && (
        <Modal
          isOpen={leaveOrgModalOpen}
          onClose={leavingOrg ? () => {} : closeLeaveOrgModal}
          title={t('organizations.leaveTitle')}
          size="sm"
        >
          <p className="text-sm leading-relaxed text-gray-300">
            {t('organizations.leaveIntro')}{' '}
            <span className="font-semibold text-white">&quot;{leaveOrgPendingName}&quot;</span>.{' '}
            {t('organizations.leaveOutro')}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={closeLeaveOrgModal}
              disabled={leavingOrg}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmLeaveOrganization}
              disabled={leavingOrg}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(225,29,72,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {leavingOrg ? t('organizations.leaving') : t('organizations.leaveBtn')}
            </button>
          </div>
        </Modal>
      )}
      {inviteModalOpen && (
        <Modal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          title={t('organizations.inviteModalTitle', {
            name: inviteOrganization?.name || t('organizations.orgShort'),
          })}
          size="md"
        >
          <div className="space-y-4">
            <PageSearchBar
              value={inviteSearch}
              onChange={setInviteSearch}
              placeholder={t('organizations.searchFriendsPh')}
              isDarkMode={isDarkMode}
              size="sm"
              id="org-invite-friend-search"
            />

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-overlay">
              {loadingInviteFriends && (
                <div className="rounded-lg bg-white/5 p-3 text-sm text-gray-300">
                  {t('organizations.loadingFriends')}
                </div>
              )}
              {!loadingInviteFriends && filteredInviteFriends.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-gray-400">
                  {t('organizations.noFriendsInvite')}
                </div>
              )}
              {!loadingInviteFriends &&
                filteredInviteFriends.map((friend) => {
                  const inviting = invitingIds.includes(friend.id);
                  return (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{friend.name}</div>
                        <div className="truncate text-xs text-gray-400">{friend.username}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInviteFriendToOrganization(friend.id)}
                        disabled={inviting}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20 disabled:opacity-50"
                      >
                        {inviting ? t('organizations.inviting') : t('organizations.inviteBtn')}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">{t('organizations.inviteByLink')}</div>
                {isInviteLinkBeta && (
                  <span className="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">
                    Beta
                  </span>
                )}
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <select
                  value={inviteBranchId}
                  onChange={(event) => {
                    const nextBranchId = event.target.value;
                    const selectedBranch = inviteStructureBranches.find(
                      (b) => String(b._id) === String(nextBranchId)
                    );
                    const nextDivisionId = selectedBranch?.divisions?.[0]?._id
                      ? String(selectedBranch.divisions[0]._id)
                      : '';
                    setInviteBranchId(nextBranchId);
                    setInviteDivisionId(nextDivisionId);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-200"
                >
                  {inviteStructureBranches.map((branch) => (
                    <option key={branch._id} value={branch._id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <select
                  value={inviteDivisionId}
                  onChange={(event) => setInviteDivisionId(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-200"
                >
                  {(inviteStructureBranches.find((b) => String(b._id) === String(inviteBranchId))
                    ?.divisions || []
                  ).map((division) => (
                    <option key={division._id} value={division._id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] text-cyan-300">
                  {inviteContextLabel
                    ? `Link mời vào: ${inviteContextLabel}`
                    : 'Link mời toàn tổ chức (chưa chọn chi nhánh/khối)'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    regenerateInviteLinkWithContext(inviteOrgId, inviteBranchId, inviteDivisionId)
                  }
                  className="rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/10"
                >
                  Tạo lại link
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedInviteLink || (generatingInviteLink ? t('organizations.generatingLink') : '')}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  disabled={!generatedInviteLink || generatingInviteLink}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  {t('organizations.copyLinkBtn')}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {isInviteLinkBeta ? t('organizations.betaHttp') : t('organizations.betaHttps')}
              </p>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={createOrgModalOpen}
        onClose={() => setCreateOrgModalOpen(false)}
        title={`Create Workspace - Step ${createWorkspaceStep}/5`}
        size="sm"
      >
        <div className="space-y-3">
          {createWorkspaceStep === 1 ? (
            <input
              value={createOrgName}
              onChange={(event) => {
                const nextName = event.target.value;
                setCreateOrgName(nextName);
                setCreateWorkspaceSlug((prev) => prev || toWorkspaceSlug(nextName));
              }}
              placeholder="Workspace name"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
            />
          ) : null}
          {createWorkspaceStep === 2 ? (
            <div className="space-y-2">
              <input
                value={createWorkspaceSlug}
                onChange={(event) => setCreateWorkspaceSlug(toWorkspaceSlug(event.target.value))}
                placeholder="workspace-slug"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-400">Workspace URL: /w/{createWorkspaceSlug || 'your-slug'}</p>
            </div>
          ) : null}
          {createWorkspaceStep === 3 ? (
            <div className="space-y-2">
              <select
                value={createWorkspaceType}
                onChange={(event) => setCreateWorkspaceType(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
              >
                <option value="company" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Company</option>
                <option value="startup" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Startup</option>
                <option value="education" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Education</option>
                <option value="community" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Community</option>
              </select>
              <select
                value={createWorkspaceTeamSize}
                onChange={(event) => setCreateWorkspaceTeamSize(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
              >
                <option value="1-10" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>1-10</option>
                <option value="11-50" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>11-50</option>
                <option value="51-200" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>51-200</option>
                <option value="201-1000" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>201-1000</option>
                <option value="1000+" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>1000+</option>
              </select>
              <input
                value={createWorkspaceIndustry}
                onChange={(event) => setCreateWorkspaceIndustry(event.target.value)}
                placeholder="Industry (optional)"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
              />
            </div>
          ) : null}
          {createWorkspaceStep === 4 ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-400">Thiết kế cấu trúc tổ chức</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-300">
                  Số chi nhánh
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createBranchCountInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          20,
                          setCreateBranchCountInput,
                          setCreateBranchCount
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createBranchCountInput,
                          createBranchCount,
                          1,
                          20,
                          setCreateBranchCountInput,
                          setCreateBranchCount
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createBranchCount,
                            -1,
                            1,
                            20,
                            setCreateBranchCountInput,
                            setCreateBranchCount
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createBranchCount,
                            1,
                            1,
                            20,
                            setCreateBranchCountInput,
                            setCreateBranchCount
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-xs text-gray-300">
                  Khối / chi nhánh
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createDivisionPerBranchInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          20,
                          setCreateDivisionPerBranchInput,
                          setCreateDivisionPerBranch
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createDivisionPerBranchInput,
                          createDivisionPerBranch,
                          1,
                          20,
                          setCreateDivisionPerBranchInput,
                          setCreateDivisionPerBranch
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDivisionPerBranch,
                            -1,
                            1,
                            20,
                            setCreateDivisionPerBranchInput,
                            setCreateDivisionPerBranch
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDivisionPerBranch,
                            1,
                            1,
                            20,
                            setCreateDivisionPerBranchInput,
                            setCreateDivisionPerBranch
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-xs text-gray-300">
                  Phòng / khối
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createDepartmentPerDivisionInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          30,
                          setCreateDepartmentPerDivisionInput,
                          setCreateDepartmentPerDivision
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createDepartmentPerDivisionInput,
                          createDepartmentPerDivision,
                          1,
                          30,
                          setCreateDepartmentPerDivisionInput,
                          setCreateDepartmentPerDivision
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDepartmentPerDivision,
                            -1,
                            1,
                            30,
                            setCreateDepartmentPerDivisionInput,
                            setCreateDepartmentPerDivision
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDepartmentPerDivision,
                            1,
                            1,
                            30,
                            setCreateDepartmentPerDivisionInput,
                            setCreateDepartmentPerDivision
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-xs text-gray-300">
                  Team / phòng
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createTeamPerDepartmentInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          30,
                          setCreateTeamPerDepartmentInput,
                          setCreateTeamPerDepartment
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createTeamPerDepartmentInput,
                          createTeamPerDepartment,
                          1,
                          30,
                          setCreateTeamPerDepartmentInput,
                          setCreateTeamPerDepartment
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createTeamPerDepartment,
                            -1,
                            1,
                            30,
                            setCreateTeamPerDepartmentInput,
                            setCreateTeamPerDepartment
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createTeamPerDepartment,
                            1,
                            1,
                            30,
                            setCreateTeamPerDepartmentInput,
                            setCreateTeamPerDepartment
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
              </div>

              <div className="text-xs text-gray-400">Nhập tên cho từng nhánh/khối/phòng/team</div>
              <div className="max-h-[280px] overflow-y-auto pr-1 scrollbar-overlay space-y-3 rounded-xl border border-white/10 bg-black/20 p-2">
                {Array.from({ length: Math.max(1, Number(createBranchCount) || 1) }, (_, bIdx) => {
                  const divisionCount = Math.max(1, Number(createDivisionPerBranch) || 1);
                  const departmentCount = Math.max(1, Number(createDepartmentPerDivision) || 1);
                  const teamCount = Math.max(1, Number(createTeamPerDepartment) || 1);
                  return (
                    <div key={`branch-${bIdx}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-1 text-xs font-semibold text-white">Chi nhánh {bIdx + 1}</div>
                      <input
                        value={createBranchNames[bIdx] || ''}
                        onChange={(e) =>
                          setCreateBranchNames((prev) =>
                            prev.map((v, i) => (i === bIdx ? e.target.value : v))
                          )
                        }
                        className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                      />

                      <div className="mt-3 space-y-3 border-l border-white/10 pl-3">
                        {Array.from({ length: divisionCount }, (_, dIdx) => (
                          <div key={`branch-${bIdx}-div-${dIdx}`} className="space-y-2">
                            <div className="text-[11px] font-semibold text-gray-200">Khối {dIdx + 1}</div>
                            <input
                              value={createDivisionNames?.[bIdx]?.[dIdx] || ''}
                              onChange={(e) =>
                                setCreateDivisionNames((prev) =>
                                  prev.map((branch, bi) =>
                                    bi !== bIdx
                                      ? branch
                                      : branch.map((v, di) => (di === dIdx ? e.target.value : v))
                                  )
                                )
                              }
                              className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                            />

                            <div className="space-y-2 border-l border-white/10 pl-3">
                              {Array.from({ length: departmentCount }, (_, depIdx) => (
                                <div key={`branch-${bIdx}-div-${dIdx}-dept-${depIdx}`} className="space-y-2">
                                  <div className="text-[11px] font-semibold text-gray-200">Phòng {depIdx + 1}</div>
                                  <input
                                    value={createDepartmentNames?.[bIdx]?.[dIdx]?.[depIdx] || ''}
                                    onChange={(e) =>
                                      setCreateDepartmentNames((prev) =>
                                        prev.map((branch, bi) =>
                                          bi !== bIdx
                                            ? branch
                                            : branch.map((division, di) =>
                                                di !== dIdx
                                                  ? division
                                                  : division.map((v, dpt) =>
                                                      dpt === depIdx ? e.target.value : v
                                                    )
                                              )
                                        )
                                      )
                                    }
                                    className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                                  />

                                  <div className="space-y-2 border-l border-white/10 pl-3">
                                    {Array.from({ length: teamCount }, (_, tIdx) => (
                                      <div key={`branch-${bIdx}-div-${dIdx}-dept-${depIdx}-team-${tIdx}`} className="space-y-2">
                                        <div className="text-[11px] font-semibold text-gray-200">
                                          Team {depIdx + 1}.{tIdx + 1}
                                        </div>
                                        <input
                                          value={createTeamNames?.[bIdx]?.[dIdx]?.[depIdx]?.[tIdx] || ''}
                                          onChange={(e) =>
                                            setCreateTeamNames((prev) =>
                                              prev.map((branch, bi) =>
                                                bi !== bIdx
                                                  ? branch
                                                  : branch.map((division, di) =>
                                                      di !== dIdx
                                                        ? division
                                                        : division.map((dept, dpt) =>
                                                            dpt !== depIdx
                                                              ? dept
                                                              : dept.map((teamName, teamI) =>
                                                                  teamI === tIdx
                                                                    ? e.target.value
                                                                    : teamName
                                                                )
                                                          )
                                                    )
                                              )
                                            )
                                          }
                                          className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {createWorkspaceStep === 5 ? (
            <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-gray-200">
              <div>Name: {createOrgName || '-'}</div>
              <div>Slug: {toWorkspaceSlug(createWorkspaceSlug || createOrgName) || '-'}</div>
              <div>Type: {createWorkspaceType}</div>
              <div>Team size: {createWorkspaceTeamSize}</div>
              <div>Industry: {createWorkspaceIndustry || '-'}</div>
              <div>Branches: {createBranchCount}</div>
              <div>Divisions/Branch: {createDivisionPerBranch}</div>
              <div>Departments/Division: {createDepartmentPerDivision}</div>
              <div>Teams/Department: {createTeamPerDepartment}</div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOrgModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            {createWorkspaceStep > 1 ? (
              <button
                type="button"
                onClick={() => setCreateWorkspaceStep((step) => Math.max(1, step - 1))}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
              >
                Back
              </button>
            ) : null}
            {createWorkspaceStep < 5 ? (
              <button
                type="button"
                onClick={() => setCreateWorkspaceStep((step) => Math.min(5, step + 1))}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Next
              </button>
            ) : null}
            {createWorkspaceStep === 5 ? (
              <button
                type="button"
                onClick={handleSubmitCreateOrganization}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Create Workspace
              </button>
            ) : null}
          </div>
        </div>
      </Modal>

      <ForwardChannelModal
        isOpen={forwardModalOpen}
        onClose={() => {
          setForwardModalOpen(false);
          setForwardSourceMessage(null);
        }}
        organizationName={selectedOrganization?.name || ''}
        targets={forwardTargets}
        loading={forwardTargetsLoading}
        previewText={forwardPreviewText}
        onConfirm={handleForwardConfirm}
      />

      <Modal
        isOpen={createDivisionModalOpen}
        onClose={() => setCreateDivisionModalOpen(false)}
        title="Tạo khối"
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Chi nhánh
            <select
              value={createDivisionBranchId}
              onChange={(event) => setCreateDivisionBranchId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {branchOptions.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <input
            value={createDivisionName}
            onChange={(event) => setCreateDivisionName(event.target.value)}
            placeholder="Tên khối"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDivisionModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateDivision}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo khối
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createDeptModalOpen}
        onClose={() => setCreateDeptModalOpen(false)}
        title={t('organizations.createDeptTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Khối
            <select
              value={createDeptDivisionId}
              onChange={(event) => setCreateDeptDivisionId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {divisionOptions(selectedBranchId).map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <input
            value={createDeptName}
            onChange={(event) => setCreateDeptName(event.target.value)}
            placeholder={t('organizations.createDeptPh')}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDeptModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateDepartment}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {t('organizations.createDeptSubmit')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createTeamModalOpen}
        onClose={() => setCreateTeamModalOpen(false)}
        title="Tạo team"
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Phòng ban
            <select
              value={createTeamDepartmentId}
              onChange={(event) => setCreateTeamDepartmentId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {sidebarDepartments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <input
            value={createTeamName}
            onChange={(event) => setCreateTeamName(event.target.value)}
            placeholder="Tên team"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateTeamModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateTeam}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo team
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        title={
          createChannelType === 'voice'
            ? t('organizations.createVoiceTitle')
            : t('organizations.createChatTitle')
        }
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Chi nhánh
            <select
              value={createChannelBranchId}
              onChange={(event) => {
                const nextBranchId = event.target.value;
                const nextDivisions = divisionOptions(nextBranchId);
                const nextDivisionId = nextDivisions[0]?._id ? String(nextDivisions[0]._id) : '';
                const nextDepartments = departmentOptions(nextBranchId, nextDivisionId);
                const nextDepartmentId = nextDepartments[0]?._id ? String(nextDepartments[0]._id) : '';
                const nextTeams = teamOptions(nextBranchId, nextDivisionId, nextDepartmentId);
                const nextTeamId = nextTeams[0]?._id ? String(nextTeams[0]._id) : '';
                setCreateChannelBranchId(nextBranchId);
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {branchOptions.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-300">
            Khối
            <select
              value={createChannelDivisionId}
              onChange={(event) => {
                const nextDivisionId = event.target.value;
                const nextDepartments = departmentOptions(createChannelBranchId, nextDivisionId);
                const nextDepartmentId = nextDepartments[0]?._id ? String(nextDepartments[0]._id) : '';
                const nextTeams = teamOptions(createChannelBranchId, nextDivisionId, nextDepartmentId);
                const nextTeamId = nextTeams[0]?._id ? String(nextTeams[0]._id) : '';
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {divisionOptions(createChannelBranchId).map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-300">
            Phòng ban
            <select
              value={createChannelDepartmentId}
              onChange={(event) => {
                const nextDepartmentId = event.target.value;
                const nextTeams = teamOptions(
                  createChannelBranchId,
                  createChannelDivisionId,
                  nextDepartmentId
                );
                const nextTeamId = nextTeams[0]?._id ? String(nextTeams[0]._id) : '';
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {departmentOptions(createChannelBranchId, createChannelDivisionId).map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-300">
            Team
            <select
              value={createChannelTeamId}
              onChange={(event) => setCreateChannelTeamId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {teamOptions(createChannelBranchId, createChannelDivisionId, createChannelDepartmentId).map(
                (team) => (
                  <option key={team._id} value={team._id}>
                    {team.name}
                  </option>
                )
              )}
            </select>
          </label>
          <input
            value={createChannelName}
            onChange={(event) => setCreateChannelName(event.target.value)}
            placeholder={
              createChannelType === 'voice'
                ? t('organizations.voiceChannelPh')
                : t('organizations.chatChannelPh')
            }
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateChannelModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateChannel}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {t('organizations.createChannelSubmit')}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title="Đổi tên"
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={renameTargetName}
            onChange={(event) => setRenameTargetName(event.target.value)}
            placeholder="Tên mới"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitRenameEntity}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Lưu tên mới
            </button>
          </div>
        </div>
      </Modal>
      <OrganizationChannelRoleSettingsModal
        isOpen={channelSettingsOpen}
        onClose={() => {
          setChannelSettingsOpen(false);
          setChannelSettingsChannel(null);
        }}
        organizationId={selectedOrganizationId}
        channel={channelSettingsChannel}
        locale={locale}
        isDarkMode={isDarkMode}
        onSaved={() => {
          if (selectedOrganizationId) loadChannelPermissions(selectedOrganizationId);
        }}
      />
      <ConfirmDialog
        isOpen={deleteChannelMsgConfirmId != null}
        onClose={() => setDeleteChannelMsgConfirmId(null)}
        onConfirm={confirmDeleteChannelMessage}
        title={t('organizations.deleteMsgTitle')}
        message={t('organizations.deleteMsgMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
      />
    </>
  );
}

export default OrganizationsPage;
