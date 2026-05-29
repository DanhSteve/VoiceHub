import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { organizationAPI } from '../../services/api/organizationAPI';
import {
  taskAPI,
  unwrapTaskBoardDetailPayload,
  unwrapTaskBoardListPayload,
} from '../../services/api/taskAPI';
import roleAPI from '../../services/api/roleAPI';
import userService from '../../services/userService';
import friendService from '../../services/friendService';
import { ConfirmDialog } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { useTheme } from '../../context/ThemeContext';
import { shellNavRailBackdrop, shellNavRailMenuBackdropZ } from '../../theme/shellTheme';
import OrgWorkspaceSearchSidebar from '../../features/search/components/OrgWorkspaceSearchSidebar';
import OrgMemberSidebarAttachments from '../../features/orgAttachments/OrgMemberSidebarAttachments';
import UserAvatar from '../Shared/UserAvatar';
import { isAvatarImageUrl } from '../../utils/avatarDisplay';
import { usePresenceSubscribe } from '../../hooks/usePresenceSubscribe';

const unwrapBody = (payload) => payload?.data ?? payload;

const MEMBERSHIP_ROLE_ORDER = ['owner', 'admin', 'member'];

function canOrgResourceAction(permissions, resource, action = 'read') {
  if (!Array.isArray(permissions)) return false;
  for (const perm of permissions) {
    const res = perm?.resource;
    const actions = Array.isArray(perm?.actions) ? perm.actions : [];
    if (res !== resource && res !== '*') continue;
    if (
      actions.includes(action) ||
      actions.includes('*') ||
      actions.includes('admin')
    ) {
      return true;
    }
  }
  return false;
}

/** Fallback khi chưa lấy được RBAC từ role-permission-service */
function fallbackOrgTabFlags(myRole) {
  const role = String(myRole || 'member').toLowerCase();
  if (role === 'owner' || role === 'admin') {
    return { tasks: true, files: true };
  }
  if (role === 'hr') {
    return { tasks: true, files: false };
  }
  return { tasks: true, files: false };
}

function memberUserId(m) {
  const u = m?.user;
  if (u && typeof u === 'object') return String(u._id || u.id || '');
  return String(u || '');
}

async function fetchMembersWithRolesBundle(orgId) {
  const payload = await organizationAPI.getMembersWithRoles(orgId);
  const body = unwrapBody(payload);
  const bundle = body?.data ?? body;
  const list = Array.isArray(bundle?.members)
    ? bundle.members
    : normalizeApiList(payload);
  const roles = Array.isArray(bundle?.roles) ? bundle.roles : [];
  const members = list.filter((m) => String(m?.status || 'active') === 'active');
  return { members, roles };
}

async function enrichMembersWithProfiles(members, memberFallback) {
  const out = await Promise.all(
    members.map(async (m) => {
      const uid = memberUserId(m);
      let displayName = uid.slice(-6) || memberFallback;
      let avatar = null;
      let username = null;
      if (uid) {
        try {
          const res = await userService.getProfile(uid);
          const u = unwrapBody(res)?.data ?? unwrapBody(res);
          const profile = u?.data ?? u;
          displayName =
            profile?.displayName ||
            profile?.fullName ||
            profile?.username ||
            profile?.email?.split('@')[0] ||
            displayName;
          avatar = profile?.avatar || null;
          username = profile?.username || null;
        } catch {
          /* giữ mặc định */
        }
      }
      return {
        membershipId: String(m._id),
        userId: uid,
        role: String(m.role || 'member').toLowerCase(),
        divisionId: m?.division ? String(m.division) : '',
        departmentId: m?.department ? String(m.department) : '',
        teamId: m?.team ? String(m.team) : '',
        displayName,
        username,
        avatar,
      };
    })
  );
  return out;
}

/**
 * Danh sách thành viên tổ chức: theo vai trò (khi org có định nghĩa roles hệ thống)
 * hoặc Trực tuyến / Ngoại tuyến (mặc định).
 */
const CONTEXT_MENU_PAD = 8;

/**
 * Vị trí khởi tạo tại con trỏ; căn chính xác theo chiều cao thật của menu trong useLayoutEffect.
 */
function computeContextMenuPosition(clientX, clientY) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const menuW = Math.min(260, vw - 2 * CONTEXT_MENU_PAD);

  const left = Math.min(Math.max(CONTEXT_MENU_PAD, clientX), vw - menuW - CONTEXT_MENU_PAD);
  const top = Math.max(CONTEXT_MENU_PAD, clientY);

  return { left, top, menuW };
}

function canRemoveMember(myRole, targetRole, targetUserId, currentUserId) {
  if (!currentUserId || String(targetUserId) === String(currentUserId)) return false;
  const my = String(myRole || '').toLowerCase();
  const tr = String(targetRole || '').toLowerCase();
  if (my !== 'owner' && my !== 'admin') return false;
  if (tr === 'owner') return false;
  if (my === 'admin' && tr === 'admin') return false;
  return true;
}

function normalizeRoleRecord(role) {
  if (!role || typeof role !== 'object') return null;
  const roleId = String(role.id || role._id || '');
  if (!roleId) return null;
  const rawName = String(role.name || role.label || 'Role');
  const displayName = rawName
    .replace(/\s*[•·]\s*(div|dep|team|branch)_[a-z0-9_-]+$/i, '')
    .replace(
      /^\s*(khối|khoi|phòng ban|phong ban|team|chi nhánh|chi nhanh|division|department|branch)\s*:\s*/i,
      ''
    )
    .trim();
  return {
    roleId,
    name: rawName,
    displayName: displayName || rawName,
    raw: role,
  };
}

function normalizeApiList(payload) {
  const body = unwrapBody(payload);
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.members)) return body.members;
  return [];
}

function safeArray(input) {
  return Array.isArray(input) ? input : [];
}

function formatTaskDueDate(input) {
  if (!input) return '';
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('vi-VN');
}

function toLowerStr(input) {
  return String(input || '').trim().toLowerCase();
}

function OrganizationMemberSidebar({
  organizationId,
  workspaceSlug = '',
  organizationName = '',
  selectedTeamId = '',
  teams = [],
  onlineUsers = [],
  socketConnected = false,
  refreshKey = 0,
  currentUserId = null,
  myRole = 'member',
  canReviewJoinApplications = false,
  joinApplicationsToReview = [],
  loadingJoinApplicationsToReview = false,
  respondingJoinReviewKeys = [],
  onApproveJoinApplication,
  onRejectJoinApplication,
  onMentionUser,
  onMemberRemoved,
  /** Khi bọc trong OrganizationMemberPeekDock: false = panel đang thu → đóng menu portal */
  memberDockOpen,
  onMemberMenuOpenChange,
  onMemberMenuClosed,
  selectedChannelId = '',
  channelPermissionMatrix = {},
  workspaceSearchOpen = false,
  onWorkspaceSearchOpenChange,
  searchChannels = [],
  serverId,
  onWorkspaceSearchJump,
}) {
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [organizationRoles, setOrganizationRoles] = useState([]);
  const [groupMode, setGroupMode] = useState('role'); // 'presence' | 'role'
  const [menu, setMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    member: null,
    /** Chỉ đặt khi nội dung cao hơn viewport — lúc đó mới cần cuộn trong menu */
    menuMaxHeight: undefined,
  });
  const menuPanelRef = useRef(null);
  const rolesMenuBtnRef = useRef(null);
  const rolesSubmenuRef = useRef(null);
  const memberCardRef = useRef(null);
  const [rolesSubmenu, setRolesSubmenu] = useState({
    open: false,
    x: 0,
    y: 0,
    member: null,
    loading: false,
    busyRoleId: '',
    selectedRoleIds: {},
  });
  const [memberCard, setMemberCard] = useState({
    open: false,
    x: 0,
    y: 0,
    loading: false,
    member: null,
    profile: null,
    assignedRoleNames: [],
    quickMessage: '',
  });
  const [friendIdsSet, setFriendIdsSet] = useState(null);
  /** Xóa thành viên / Chặn — dùng modal thay cho window.confirm (tránh tiêu đề localhost) */
  const [memberConfirm, setMemberConfirm] = useState(null);
  /** Tab panel phải — mặc định danh sách thành viên */
  const [sidebarTab, setSidebarTab] = useState('people');
  const [orgPermissions, setOrgPermissions] = useState([]);
  const [orgPermissionsLoaded, setOrgPermissionsLoaded] = useState(false);
  const [teamTaskSections, setTeamTaskSections] = useState([]);
  const [loadingSidebarTasks, setLoadingSidebarTasks] = useState(false);
  const [sidebarTasksError, setSidebarTasksError] = useState('');
  const memberUserIds = useMemo(
    () => rows.map((m) => String(m.userId || '')).filter(Boolean),
    [rows]
  );
  usePresenceSubscribe(memberUserIds, {
    enabled: Boolean(organizationId) && sidebarTab === 'people' && memberDockOpen !== false,
  });

  const pendingReviewCount = canReviewJoinApplications ? joinApplicationsToReview.length : 0;
  const joinReviewKey = (orgId, applicationId) => `${orgId}:${applicationId}`;
  const [selectedJoinApplication, setSelectedJoinApplication] = useState(null);

  useEffect(() => {
    if (!organizationId || !currentUserId) {
      setOrgPermissions([]);
      setOrgPermissionsLoaded(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setOrgPermissionsLoaded(false);
      try {
        const payload = await api.get(
          `/permissions/user/${encodeURIComponent(String(currentUserId))}/server/${encodeURIComponent(String(organizationId))}`
        );
        const body = unwrapBody(payload);
        const list = Array.isArray(body?.data)
          ? body.data
          : Array.isArray(body)
            ? body
            : [];
        if (!cancelled) setOrgPermissions(list);
      } catch {
        if (!cancelled) setOrgPermissions([]);
      } finally {
        if (!cancelled) setOrgPermissionsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, currentUserId]);

  const hasReadableChannel = useMemo(() => {
    const matrix = channelPermissionMatrix || {};
    return Object.values(matrix).some((p) => p?.canRead || p?.canSee);
  }, [channelPermissionMatrix]);

  const { canShowTasksTab, canShowFilesTab } = useMemo(() => {
    const fallback = fallbackOrgTabFlags(myRole);
    if (!orgPermissionsLoaded || !orgPermissions.length) {
      return {
        canShowTasksTab: fallback.tasks,
        canShowFilesTab: fallback.files || hasReadableChannel,
      };
    }
    return {
      canShowTasksTab: canOrgResourceAction(orgPermissions, 'task', 'read'),
      canShowFilesTab:
        canOrgResourceAction(orgPermissions, 'document', 'read') || hasReadableChannel,
    };
  }, [orgPermissions, orgPermissionsLoaded, myRole, hasReadableChannel]);

  const showSidebarTabs = true;
  const teamNameById = useMemo(() => {
    const map = new Map();
    for (const row of safeArray(teams)) {
      const id = String(row?._id || '');
      if (!id) continue;
      map.set(id, String(row?.name || '').trim() || 'Team');
    }
    return map;
  }, [teams]);

  const currentUserIdStr = String(currentUserId || '').trim();

  useEffect(() => {
    if (sidebarTab !== 'tasks') return;
    if (!organizationId || !currentUserIdStr) {
      setTeamTaskSections([]);
      setSidebarTasksError('');
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadingSidebarTasks(true);
      setSidebarTasksError('');
      try {
        const boardRes = await taskAPI.getBoards({
          organizationId: String(organizationId),
          ...(selectedTeamId ? { teamId: String(selectedTeamId) } : {}),
          ...(workspaceSlug ? { workspaceSlug } : {}),
        });
        const boards = unwrapTaskBoardListPayload(boardRes);
        const boardDetailOpts = workspaceSlug ? { workspaceSlug } : {};
        const detailResults = await Promise.allSettled(
          boards.map(async (board) => {
            const detailRes = await taskAPI.getBoardDetail(
              String(board?._id || ''),
              boardDetailOpts
            );
            return {
              board,
              detail: unwrapTaskBoardDetailPayload(detailRes),
            };
          })
        );

        if (cancelled) return;

        const teamBuckets = new Map();
        for (const result of detailResults) {
          if (result.status !== 'fulfilled') continue;
          const board = result.value?.board || {};
          const detail = result.value?.detail || null;
          if (!detail?.board?._id) continue;

          const boardData = detail.board || board;
          const boardVisibility = toLowerStr(boardData.visibility);
          const isTeamPublicBoard = boardVisibility === 'workspace' || boardVisibility === 'public';
          const listsMap = new Map(
            safeArray(detail.lists).map((list) => [String(list?._id || ''), String(list?.title || '')])
          );
          const cards = safeArray(detail.cards)
            .filter((card) => {
              const assigneeId = String(card?.assigneeId || '');
              return assigneeId === currentUserIdStr || isTeamPublicBoard;
            })
            .map((card) => ({
              _id: String(card?._id || ''),
              title: String(card?.title || '').trim() || 'Untitled',
              status: String(card?.status || 'todo'),
              dueDate: card?.dueDate || null,
              listTitle: listsMap.get(String(card?.listId || '')) || '',
              boardTitle: String(boardData?.title || board?.title || '').trim(),
              assigneeId: String(card?.assigneeId || ''),
              createdAt: card?.createdAt || null,
            }))
            .filter((card) => Boolean(card._id));

          if (!cards.length) continue;
          const teamId = String(boardData?.teamId || board?.teamId || '') || 'no-team';
          const existing = teamBuckets.get(teamId) || [];
          teamBuckets.set(teamId, existing.concat(cards));
        }

        const nextSections = [...teamBuckets.entries()]
          .map(([teamId, tasks]) => {
            const sorted = [...tasks].sort((a, b) => {
              const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
              const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
              if (aDue !== bDue) return aDue - bDue;
              return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });
            return {
              teamId,
              teamName: teamNameById.get(teamId) || 'Team chưa xác định',
              tasks: sorted,
            };
          })
          .sort((a, b) => a.teamName.localeCompare(b.teamName, 'vi'));

        setTeamTaskSections(nextSections);
      } catch (err) {
        if (cancelled) return;
        setTeamTaskSections([]);
        setSidebarTasksError(err?.response?.data?.message || 'Không tải được danh sách việc cần làm');
      } finally {
        if (!cancelled) setLoadingSidebarTasks(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sidebarTab, organizationId, currentUserIdStr, selectedTeamId, teamNameById]);

  const activityFeedItems = useMemo(
    () => [
      { id: 'a1', kind: 'join', label: t('organizations.memberActivityJoined', { name: rows[0]?.displayName || '—' }) },
      { id: 'a2', kind: 'task', label: t('organizations.memberActivityTask') },
      { id: 'a3', kind: 'file', label: t('organizations.memberActivityFile') },
      { id: 'a4', kind: 'meet', label: t('organizations.memberActivityMeeting') },
    ],
    [rows, t]
  );

  useEffect(() => {
    if (sidebarTab === 'tasks' && !canShowTasksTab) setSidebarTab('people');
    if (sidebarTab === 'files' && !canShowFilesTab) setSidebarTab('people');
  }, [sidebarTab, canShowTasksTab, canShowFilesTab]);

  useEffect(() => {
    if (!organizationId || sidebarTab !== 'people') return;
    if (memberDockOpen === false) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { members: rawMembers, roles: rolesList } =
          await fetchMembersWithRolesBundle(organizationId);
        if (cancelled) return;

        const normalizedRoles = rolesList.map(normalizeRoleRecord).filter(Boolean);
        setOrganizationRoles(normalizedRoles);
        const hasCustomRoles = Array.isArray(rolesList) && rolesList.length > 0;
        setGroupMode(hasCustomRoles ? 'role' : 'presence');

        const enriched = await enrichMembersWithProfiles(rawMembers, t('organizations.memberFallbackShort'));
        if (cancelled) return;
        setRows(enriched);
      } catch (e) {
        if (!cancelled) {
          setError(t('organizations.loadMembersError'));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, refreshKey, sidebarTab, memberDockOpen, t]);

  useEffect(() => {
    if (!selectedJoinApplication) return;
    const stillExists = joinApplicationsToReview.some(
      (app) =>
        String(app.organizationId) === String(selectedJoinApplication.organizationId) &&
        String(app.applicationId) === String(selectedJoinApplication.applicationId)
    );
    if (!stillExists) {
      setSelectedJoinApplication(null);
    }
  }, [joinApplicationsToReview, selectedJoinApplication]);

  useEffect(() => {
    setMemberCard((prev) => ({ ...prev, open: false, member: null }));
    setRolesSubmenu((prev) => ({ ...prev, open: false, member: null }));
  }, [organizationId]);

  const onlineSet = useMemo(
    () => new Set((onlineUsers || []).map((id) => String(id))),
    [onlineUsers]
  );

  const checkOnline = (userId) => socketConnected && onlineSet.has(String(userId));

  const groupedByPresence = useMemo(() => {
    const on = [];
    const off = [];
    for (const r of rows) {
      const online = socketConnected && onlineSet.has(String(r.userId));
      if (online) on.push(r);
      else off.push(r);
    }
    return [
      { key: 'on', title: t('organizations.presenceOnline'), items: on },
      { key: 'off', title: t('organizations.presenceOffline'), items: off },
    ];
  }, [rows, onlineSet, socketConnected, t]);

  const groupedByMembershipRole = useMemo(() => {
    const roleLabel = {
      owner: t('organizations.memberGroupManagement'),
      admin: t('organizations.memberGroupLeads'),
      member: t('organizations.memberGroupMembers'),
    };
    const buckets = { owner: [], admin: [], member: [] };
    for (const r of rows) {
      const k = MEMBERSHIP_ROLE_ORDER.includes(r.role) ? r.role : 'member';
      buckets[k].push(r);
    }
    return MEMBERSHIP_ROLE_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
      key: k,
      title: roleLabel[k] || k,
      items: buckets[k],
    }));
  }, [rows, t]);

  const roleLabelMap = useMemo(
    () => ({
      owner: t('organizations.roleOwner'),
      admin: t('organizations.roleAdmin'),
      member: t('organizations.roleMember'),
    }),
    [t]
  );
  const canManageRoleAssignments = ['owner', 'admin'].includes(String(myRole || '').toLowerCase());

  const sections = groupMode === 'role' ? groupedByMembershipRole : groupedByPresence;

  const closeMenu = useCallback(() => {
    setMenu((prev) => ({ ...prev, open: false, member: null, menuMaxHeight: undefined }));
    setRolesSubmenu((prev) => ({
      ...prev,
      open: false,
      member: null,
      loading: false,
      busyRoleId: '',
      selectedRoleIds: {},
    }));
  }, []);

  useEffect(() => {
    closeMenu();
    setSelectedJoinApplication(null);
  }, [location.pathname, location.search, closeMenu]);

  const prevMenuOpenRef = useRef(false);

  useLayoutEffect(() => {
    onMemberMenuOpenChange?.(menu.open);
  }, [menu.open, onMemberMenuOpenChange]);

  useLayoutEffect(() => {
    if (memberDockOpen === false) closeMenu();
  }, [memberDockOpen, closeMenu]);

  useEffect(() => {
    if (prevMenuOpenRef.current && !menu.open) {
      onMemberMenuClosed?.();
    }
    prevMenuOpenRef.current = menu.open;
  }, [menu.open, onMemberMenuClosed]);

  const openMemberMenu = useCallback((e, member) => {
    e.preventDefault();
    e.stopPropagation();
    const { left, top, menuW } = computeContextMenuPosition(e.clientX, e.clientY);
    setMenu({ open: true, x: left, y: top, menuW, member, menuMaxHeight: undefined });
    setRolesSubmenu((prev) => ({ ...prev, open: false, member: null, selectedRoleIds: {} }));
  }, []);

  const fetchSelectedRoleIdsForUser = useCallback(
    async (userId) => {
      if (!userId || organizationRoles.length === 0) return {};
      if (!organizationId) return {};
      try {
        const payload = await roleAPI.getUserRoles(userId, organizationId);
        const rows = normalizeApiList(payload);
        const selectedSet = new Set(
          rows
            .map((item) =>
              String(
                item?.roleId ||
                item?.role?._id ||
                item?.role?.id ||
                item?._id ||
                item?.id ||
                ''
              )
            )
            .filter(Boolean)
        );
        return Object.fromEntries(organizationRoles.map((role) => [role.roleId, selectedSet.has(String(role.roleId))]));
      } catch {
        return {};
      }
    },
    [organizationId, organizationRoles]
  );

  const openRolesSubmenu = useCallback(
    async (member) => {
      if (!member?.userId) return;
      const rect = rolesMenuBtnRef.current?.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const panelW = Math.min(260, vw - 2 * CONTEXT_MENU_PAD);
      const approxH = Math.min(340, vh - 2 * CONTEXT_MENU_PAD);
      const fallbackLeft = (menu.x || 0) + (menu.menuW || 240) + 8;
      const left = rect
        ? rect.right + panelW + CONTEXT_MENU_PAD > vw
          ? Math.max(CONTEXT_MENU_PAD, rect.left - panelW - 8)
          : Math.min(vw - panelW - CONTEXT_MENU_PAD, rect.right + 8)
        : Math.min(vw - panelW - CONTEXT_MENU_PAD, fallbackLeft);
      const topBase = rect?.top ?? menu.y;
      const top = Math.max(
        CONTEXT_MENU_PAD,
        Math.min(topBase - 4, vh - approxH - CONTEXT_MENU_PAD)
      );

      setRolesSubmenu({
        open: true,
        x: left,
        y: top,
        member,
        loading: true,
        busyRoleId: '',
        selectedRoleIds: {},
      });
      const selectedRoleIds = await fetchSelectedRoleIdsForUser(member.userId);
      setRolesSubmenu((prev) => {
        if (!prev.open || String(prev.member?.userId || '') !== String(member.userId)) return prev;
        return { ...prev, loading: false, selectedRoleIds };
      });
    },
    [fetchSelectedRoleIdsForUser, menu.menuW, menu.x, menu.y]
  );

  /** Căn menu theo kích thước thật vào viewport — ưu tiên dịch lên góc dưới màn hình; chỉ cuộn trong menu khi nội dung cao hơn viewport */
  useLayoutEffect(() => {
    if (!menu.open || !menu.member || !menuPanelRef.current) return;

    const el = menuPanelRef.current;
    const pad = CONTEXT_MENU_PAD;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxAvailH = vh - 2 * pad;

    const rect = el.getBoundingClientRect();
    const naturalH = el.scrollHeight;
    const w = rect.width;

    let left = menu.x;
    let top = menu.y;
    let maxH = undefined;

    if (naturalH <= maxAvailH) {
      left = Math.max(pad, Math.min(menu.x, vw - pad - w));
      top = Math.max(pad, Math.min(menu.y, vh - pad - naturalH));
    } else {
      maxH = maxAvailH;
      left = Math.max(pad, Math.min(menu.x, vw - pad - w));
      top = pad;
    }

    setMenu((m) => {
      if (!m.open || !m.member) return m;
      const samePos = Math.abs(left - m.x) < 0.5 && Math.abs(top - m.y) < 0.5;
      const sameMax =
        (maxH === undefined && m.menuMaxHeight === undefined) ||
        (maxH !== undefined && Math.abs(maxH - (m.menuMaxHeight ?? 0)) < 0.5);
      if (samePos && sameMax) return m;
      return { ...m, x: left, y: top, menuMaxHeight: maxH };
    });
  }, [menu.open, menu.member, menu.x, menu.y, menu.menuW, menu.member?.membershipId]);

  useLayoutEffect(() => {
    if (!rolesSubmenu.open || !rolesSubmenuRef.current) return;
    const rect = rolesSubmenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextX = rolesSubmenu.x;
    let nextY = rolesSubmenu.y;
    if (rect.right > vw - CONTEXT_MENU_PAD) {
      nextX = Math.max(CONTEXT_MENU_PAD, vw - rect.width - CONTEXT_MENU_PAD);
    }
    if (rect.bottom > vh - CONTEXT_MENU_PAD) {
      nextY = Math.max(CONTEXT_MENU_PAD, vh - rect.height - CONTEXT_MENU_PAD);
    }
    if (Math.abs(nextX - rolesSubmenu.x) > 0.5 || Math.abs(nextY - rolesSubmenu.y) > 0.5) {
      setRolesSubmenu((prev) => ({ ...prev, x: nextX, y: nextY }));
    }
  }, [rolesSubmenu.open, rolesSubmenu.x, rolesSubmenu.y, rolesSubmenu.loading, organizationRoles.length]);

  useLayoutEffect(() => {
    if (!memberCard.open || !memberCardRef.current) return;
    const rect = memberCardRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nextX = memberCard.x;
    let nextY = memberCard.y;
    if (rect.right > vw - CONTEXT_MENU_PAD) {
      nextX = Math.max(CONTEXT_MENU_PAD, vw - rect.width - CONTEXT_MENU_PAD);
    }
    if (rect.bottom > vh - CONTEXT_MENU_PAD) {
      nextY = Math.max(CONTEXT_MENU_PAD, vh - rect.height - CONTEXT_MENU_PAD);
    }
    if (rect.left < CONTEXT_MENU_PAD) {
      nextX = CONTEXT_MENU_PAD;
    }
    if (rect.top < CONTEXT_MENU_PAD) {
      nextY = CONTEXT_MENU_PAD;
    }
    if (Math.abs(nextX - memberCard.x) > 0.5 || Math.abs(nextY - memberCard.y) > 0.5) {
      setMemberCard((prev) => ({ ...prev, x: nextX, y: nextY }));
    }
  }, [memberCard.open, memberCard.x, memberCard.y, memberCard.loading, memberCard.member?.userId]);

  useEffect(() => {
    if (!memberCard.open) return;
    const handlePointerDown = (event) => {
      const target = event.target;
      if (memberCardRef.current?.contains(target)) return;
      if (menuPanelRef.current?.contains(target)) return;
      if (rolesSubmenuRef.current?.contains(target)) return;
      setMemberCard((prev) => ({ ...prev, open: false }));
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setMemberCard((prev) => ({ ...prev, open: false }));
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [memberCard.open]);

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (ev) => {
      if (ev.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu.open, closeMenu]);

  const confirmMemberAction = useCallback(async () => {
    if (!memberConfirm?.member) return;
    const m = memberConfirm.member;
    try {
      if (memberConfirm.type === 'remove') {
        if (!organizationId || !m?.userId) return;
        await organizationAPI.removeMember(organizationId, m.userId);
        toast.success(t('organizations.toastMemberRemoved'));
        onMemberRemoved?.();
      } else {
        await friendService.blockUser(m.userId);
        toast.success(t('organizations.toastBlocked'));
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        (memberConfirm.type === 'remove' ? t('organizations.toastRemoveFail') : t('organizations.toastBlockFail'));
      toast.error(
        typeof msg === 'string'
          ? msg
          : memberConfirm.type === 'remove'
            ? t('organizations.toastRemoveFail')
            : t('organizations.toastBlockFail')
      );
    }
  }, [memberConfirm, organizationId, onMemberRemoved, t]);

  const mentionText = (m) => {
    const tag = m.username || String(m.displayName || 'user').replace(/\s+/g, '_');
    return `@${tag} `;
  };

  const ensureFriendIdsLoaded = useCallback(async () => {
    if (friendIdsSet instanceof Set) return friendIdsSet;
    try {
      const payload = await friendService.getFriends();
      const list = normalizeApiList(payload);
      const next = new Set();
      for (const item of list) {
        const raw = item?.friendId || item;
        const id = raw?._id || raw?.userId || raw?.id || item?.userId || item?.id;
        if (id) next.add(String(id));
      }
      setFriendIdsSet(next);
      return next;
    } catch {
      const empty = new Set();
      setFriendIdsSet(empty);
      return empty;
    }
  }, [friendIdsSet]);

  const openMemberCard = useCallback(
    async (member, anchorRect = null) => {
      if (!member?.userId) return;
      closeMenu();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const popupW = Math.min(340, vw - 2 * CONTEXT_MENU_PAD);
      const popupH = 410;
      const left = anchorRect
        ? anchorRect.right + popupW + CONTEXT_MENU_PAD > vw
          ? Math.max(CONTEXT_MENU_PAD, anchorRect.left - popupW - 8)
          : Math.min(vw - popupW - CONTEXT_MENU_PAD, anchorRect.right + 8)
        : Math.min(vw - popupW - CONTEXT_MENU_PAD, (menu.x || 0) + (menu.menuW || 240) + 8);
      const top = anchorRect
        ? Math.max(
            CONTEXT_MENU_PAD,
            Math.min(anchorRect.top - 6, vh - popupH - CONTEXT_MENU_PAD)
          )
        : Math.max(
            CONTEXT_MENU_PAD,
            Math.min(menu.y || CONTEXT_MENU_PAD, vh - popupH - CONTEXT_MENU_PAD)
          );
      setMemberCard({
        open: true,
        x: left,
        y: top,
        loading: true,
        member,
        profile: null,
        assignedRoleNames: [],
        quickMessage: '',
      });
      const [profilePayload, selectedRoleIds] = await Promise.all([
        userService.getProfile(member.userId).catch(() => null),
        fetchSelectedRoleIdsForUser(member.userId).catch(() => ({})),
        ensureFriendIdsLoaded(),
      ]);
      const profileBody = profilePayload ? unwrapBody(profilePayload) : null;
      const profile = profileBody?.data ?? profileBody ?? null;
      const assignedRoleNames = organizationRoles
        .filter((role) => selectedRoleIds[role.roleId])
        .map((role) => role.displayName || role.name);
      setMemberCard((prev) => {
        if (!prev.open || String(prev.member?.userId || '') !== String(member.userId)) return prev;
        return {
          ...prev,
          loading: false,
          profile,
          assignedRoleNames,
        };
      });
    },
    [closeMenu, ensureFriendIdsLoaded, fetchSelectedRoleIdsForUser, menu.menuW, menu.x, menu.y, organizationRoles]
  );

  const toggleMemberRole = useCallback(
    async (role) => {
      if (!canManageRoleAssignments) return;
      if (!rolesSubmenu.member?.userId || !organizationId) return;
      if (rolesSubmenu.busyRoleId) return;
      const roleId = role.roleId;
      const member = rolesSubmenu.member;
      const isSelected = Boolean(rolesSubmenu.selectedRoleIds?.[roleId]);
      setRolesSubmenu((prev) => ({ ...prev, busyRoleId: roleId }));
      try {
        let roleRes = null;
        if (isSelected) {
          roleRes = await roleAPI.removeRoleFromUser(roleId, member.userId, organizationId);
        } else {
          roleRes = await roleAPI.assignRoleToUser(roleId, member.userId, organizationId);
        }
        const rolePayload = unwrapBody(roleRes);
        const roleData = rolePayload?.data ?? rolePayload ?? {};
        const placementSync = roleData?.placementSync || null;
        setRolesSubmenu((prev) => ({
          ...prev,
          busyRoleId: '',
          selectedRoleIds: {
            ...prev.selectedRoleIds,
            [roleId]: !isSelected,
          },
        }));
        setMemberCard((prev) => {
          if (!prev.open || String(prev.member?.userId || '') !== String(member.userId)) return prev;
          const before = Array.isArray(prev.assignedRoleNames) ? prev.assignedRoleNames : [];
          const nameSet = new Set(before);
          const displayName = role.displayName || role.name;
          if (isSelected) nameSet.delete(displayName);
          else nameSet.add(displayName);
          return { ...prev, assignedRoleNames: Array.from(nameSet) };
        });
        if (placementSync?.attempted) {
          if (placementSync?.success) {
            toast.success(
              isSelected
                ? 'Đã gỡ vai trò và cập nhật danh sách member theo scope'
                : 'Đã gán vai trò và thêm member vào scope tương ứng'
            );
          } else {
            toast.error(
              isSelected
                ? 'Đã gỡ vai trò nhưng chưa đồng bộ member theo scope'
                : 'Đã gán vai trò nhưng chưa đồng bộ member theo scope'
            );
          }
        } else {
          toast.success(isSelected ? 'Đã gỡ vai trò thành công' : 'Đã gán vai trò thành công');
        }
      } catch (err) {
        setRolesSubmenu((prev) => ({ ...prev, busyRoleId: '' }));
        const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Không thể cập nhật vai trò';
        toast.error(typeof msg === 'string' ? msg : 'Không thể cập nhật vai trò');
      }
    },
    [canManageRoleAssignments, organizationId, rolesSubmenu]
  );

  const handleQuickMessageSubmit = useCallback(() => {
    const target = memberCard.member;
    if (!target?.userId) return;
    const text = String(memberCard.quickMessage || '').trim();
    setMemberCard((prev) => ({ ...prev, open: false }));
    navigate('/chat/friends', {
      state: {
        openDmUserId: target.userId,
        composeText: text,
      },
    });
  }, [memberCard.member, memberCard.quickMessage, navigate]);

  const menuPortal =
    menu.open &&
    menu.member &&
    createPortal(
      <>
        <div
          className={`${shellNavRailBackdrop} ${shellNavRailMenuBackdropZ}`}
          aria-hidden
          onClick={closeMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeMenu();
          }}
        />
        <div
          ref={menuPanelRef}
          className={`fixed z-[9998] rounded-xl border border-white/10 bg-[#2b2d31] py-1.5 text-sm shadow-2xl ${
            menu.menuMaxHeight != null ? 'overflow-y-auto scrollbar-overlay' : 'overflow-hidden'
          }`}
          style={{
            left: menu.x,
            top: menu.y,
            width: menu.menuW ?? Math.min(260, typeof window !== 'undefined' ? window.innerWidth - 16 : 260),
            maxWidth: 'min(260px, calc(100vw - 16px))',
            ...(menu.menuMaxHeight != null ? { maxHeight: menu.menuMaxHeight } : {}),
          }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              const m = menu.member;
              const sourceRect = menuPanelRef.current?.getBoundingClientRect() || null;
              closeMenu();
              openMemberCard(m, sourceRect);
            }}
          >
            {t('organizations.memberMenuProfile')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              const m = menu.member;
              const mention = mentionText(m);
              onMentionUser?.(mention);
              closeMenu();
              toast.success(t('organizations.toastMentionOk'));
            }}
          >
            {t('organizations.memberMenuMention')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              const m = menu.member;
              closeMenu();
              navigate('/chat/friends', { state: { openDmUserId: m?.userId } });
            }}
          >
            {t('organizations.memberMenuMessage')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              navigate('/voice');
            }}
          >
            {t('organizations.memberMenuCall')}
          </button>
          <div className="px-3 py-2">
            <button
              type="button"
              className="w-full rounded-lg px-0 py-1 text-left text-gray-100 hover:bg-white/10"
              onClick={() => {
                closeMenu();
                toast(t('organizations.toastNoteSoon'), { icon: '📝' });
              }}
            >
              <div>{t('organizations.memberMenuNoteTitle')}</div>
              <div className="text-xs text-gray-500">{t('organizations.memberMenuNoteSub')}</div>
            </button>
          </div>
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              toast(t('organizations.toastAppsSoon'), { icon: '🧩' });
            }}
          >
            <span>{t('organizations.memberMenuApps')}</span>
            <span className="text-gray-500">›</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              toast(t('organizations.toastInviteServerSoon'), { icon: '🔗' });
            }}
          >
            <span>{t('organizations.memberMenuInviteServer')}</span>
            <span className="text-gray-500">›</span>
          </button>
          <div className="my-1 border-t border-white/10" />
          {String(menu.member.userId) !== String(currentUserId) && (
            <>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
                onClick={async () => {
                  const m = menu.member;
                  closeMenu();
                  try {
                    await friendService.sendRequest(m.userId);
                    toast.success(t('organizations.toastFriendSent'));
                  } catch (err) {
                    const msg =
                      err?.response?.data?.message || err?.response?.data?.error || err?.message;
                    toast.error(typeof msg === 'string' ? msg : t('organizations.toastFriendFail'));
                  }
                }}
              >
                {t('organizations.memberMenuAddFriend')}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
                onClick={() => {
                  closeMenu();
                  toast(t('organizations.toastIgnoreSoon'), { icon: '👁' });
                }}
              >
                {t('organizations.memberMenuIgnore')}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-orange-300 hover:bg-white/10"
                onClick={() => {
                  const m = menu.member;
                  closeMenu();
                  setMemberConfirm({ type: 'block', member: m });
                }}
              >
                {t('organizations.memberMenuBlock')}
              </button>
            </>
          )}
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              if (!canManageRoleAssignments) {
                closeMenu();
                toast('Bạn không có quyền gán vai trò', { icon: '🔒' });
                return;
              }
              openRolesSubmenu(menu.member);
            }}
            ref={rolesMenuBtnRef}
          >
            <span>{t('organizations.memberMenuRoles')}</span>
            <span className="text-gray-500">›</span>
          </button>
          {menu.member &&
            canRemoveMember(myRole, menu.member.role, menu.member.userId, currentUserId) && (
              <>
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-500/15"
                  onClick={() => {
                    closeMenu();
                    setMemberConfirm({ type: 'remove', member: menu.member });
                  }}
                >
                  {t('organizations.memberMenuRemove')}
                </button>
              </>
            )}
        </div>
        {rolesSubmenu.open && rolesSubmenu.member && (
          <div
            ref={rolesSubmenuRef}
            className="fixed z-[9999] w-[250px] overflow-hidden rounded-xl border border-white/10 bg-[#1f2126] py-1.5 text-sm shadow-2xl"
            style={{ left: rolesSubmenu.x, top: rolesSubmenu.y, maxHeight: 'min(70vh, 360px)' }}
          >
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#9ca3af]">
              Vai trò của {rolesSubmenu.member.displayName}
            </div>
            <div className="my-1 border-t border-white/10" />
            {!canManageRoleAssignments ? (
              <p className="px-3 py-2 text-xs text-gray-400">Bạn không có quyền gán vai trò.</p>
            ) : organizationRoles.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">Chưa có vai trò tùy chỉnh.</p>
            ) : rolesSubmenu.loading ? (
              <p className="px-3 py-2 text-xs text-gray-400">Đang tải danh sách vai trò...</p>
            ) : (
              <div className="max-h-[290px] overflow-y-auto scrollbar-overlay">
                {organizationRoles.map((role) => {
                  const checked = Boolean(rolesSubmenu.selectedRoleIds?.[role.roleId]);
                  const busy = rolesSubmenu.busyRoleId === role.roleId;
                  return (
                    <button
                      key={role.roleId}
                      type="button"
                      disabled={busy}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-gray-100 transition hover:bg-white/10 disabled:opacity-60"
                      onClick={() => toggleMemberRole(role)}
                    >
                      <span
                        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                          checked ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-gray-500 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="truncate">{role.displayName || role.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </>,
      document.body
    );

  const selectedJoinReviewKey = selectedJoinApplication
    ? joinReviewKey(selectedJoinApplication.organizationId, selectedJoinApplication.applicationId)
    : '';
  const selectedJoinReviewBusy =
    !!selectedJoinReviewKey && respondingJoinReviewKeys.includes(selectedJoinReviewKey);
  const joinApplicationDetailPortal =
    selectedJoinApplication &&
    createPortal(
      <>
        <div
          className={`${shellNavRailBackdrop} ${shellNavRailMenuBackdropZ} bg-black/40`}
          onClick={() => setSelectedJoinApplication(null)}
          aria-hidden
        />
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-xl border p-4 shadow-2xl ${
              isDarkMode ? 'border-white/10 bg-[#161a22] text-white' : 'border-slate-200 bg-white text-slate-900'
            }`}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-semibold">Chi tiết đơn xét duyệt</h4>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}>
                  {selectedJoinApplication.submittedAt
                    ? new Date(selectedJoinApplication.submittedAt).toLocaleString()
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJoinApplication(null)}
                className={`rounded-md px-2 py-1 text-xs ${isDarkMode ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                Đóng
              </button>
            </div>

            <div className={`space-y-2 rounded-lg border p-3 text-xs ${
              isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
            }`}>
              <div><span className="font-semibold">Tên:</span>{' '}
                {selectedJoinApplication?.applicantSnapshot?.fullName ||
                  selectedJoinApplication?.applicantSnapshot?.username ||
                  selectedJoinApplication?.applicantSnapshot?.email ||
                  selectedJoinApplication?.applicantUser ||
                  'Unknown'}
              </div>
              {!!selectedJoinApplication?.applicantSnapshot?.email && (
                <div><span className="font-semibold">Email:</span> {selectedJoinApplication.applicantSnapshot.email}</div>
              )}
              {!!selectedJoinApplication?.applicantSnapshot?.username && (
                <div><span className="font-semibold">Username:</span> {selectedJoinApplication.applicantSnapshot.username}</div>
              )}
              <div className={isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}>
                <span className="font-semibold">ID:</span> {selectedJoinApplication?.applicantUser || 'Unknown'}
              </div>
            </div>

            {selectedJoinApplication?.answers && Object.keys(selectedJoinApplication.answers).length > 0 && (
              <div className="mt-3">
                <div className={`mb-1 text-xs font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                  Câu trả lời
                </div>
                <div className={`max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2 text-xs ${
                  isDarkMode ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-white'
                }`}>
                  {Object.entries(selectedJoinApplication.answers).map(([key, value]) => (
                    <div key={key}>
                      <span className="font-semibold">{key}:</span>{' '}
                      {Array.isArray(value) ? value.join(', ') : String(value ?? '')}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={selectedJoinReviewBusy}
                onClick={() =>
                  onRejectJoinApplication?.(
                    selectedJoinApplication.organizationId,
                    selectedJoinApplication.applicationId,
                    ''
                  )
                }
                className="rounded-md border border-rose-500/60 px-3 py-1.5 text-xs font-semibold text-rose-300 disabled:opacity-50"
              >
                Từ chối
              </button>
              <button
                type="button"
                disabled={selectedJoinReviewBusy}
                onClick={() =>
                  onApproveJoinApplication?.(
                    selectedJoinApplication.organizationId,
                    selectedJoinApplication.applicationId
                  )
                }
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Duyệt
              </button>
            </div>
          </div>
        </div>
      </>,
      document.body
    );

  const memberCardPortal =
    memberCard.open &&
    memberCard.member &&
    createPortal(
      <div
        ref={memberCardRef}
        className={`fixed z-[9999] w-[min(340px,calc(100vw-16px))] overflow-hidden rounded-2xl border shadow-2xl ${
          isDarkMode ? 'border-white/10 bg-[#1d1f28] text-white' : 'border-slate-200 bg-white text-slate-900'
        }`}
        style={{ left: memberCard.x, top: memberCard.y }}
      >
        <div className={`h-16 ${isDarkMode ? 'bg-slate-700/70' : 'bg-slate-200'}`} />
        <div className="px-3 pb-3">
          <div className="-mt-8 flex items-end justify-between">
            <UserAvatar
              avatar={memberCard.member.avatar}
              userId={memberCard.member.userId || memberCard.member.id}
              name={memberCard.member.displayName}
              size="profile"
              ringClassName={`border-4 ${isDarkMode ? 'border-[#1d1f28]' : 'border-white'}`}
            />
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-xs ${isDarkMode ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-100 hover:bg-slate-200'}`}
              onClick={() => setMemberCard((prev) => ({ ...prev, open: false }))}
            >
              Đóng
            </button>
          </div>
          <div className="mt-2.5">
            <h4 className="text-[24px] font-bold leading-none">{memberCard.member.displayName}</h4>
            <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              {memberCard.profile?.username || memberCard.member.username || ''}
            </p>
            <p className={`mt-1 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
              {memberCard.loading
                ? 'Đang tải hồ sơ...'
                : memberCard.profile?.pronouns || memberCard.profile?.pronoun || 'Chưa đặt đại từ danh xưng'}
            </p>
            <p className={`mt-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {(Number(memberCard.profile?.mutualFriendsCount) || 0)} bạn chung •{' '}
              {(Number(memberCard.profile?.mutualOrganizationsCount) || 1)} máy chủ chung
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                isDarkMode ? 'bg-white/10 text-slate-100' : 'bg-slate-100 text-slate-800'
              }`}>
                {roleLabelMap[memberCard.member.role] || memberCard.member.role}
              </span>
              {memberCard.assignedRoleNames.map((name) => (
                <span
                  key={name}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    isDarkMode ? 'bg-indigo-500/25 text-indigo-100' : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  {name}
                </span>
              ))}
              {!memberCard.loading && memberCard.assignedRoleNames.length === 0 && (
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Chưa gán role tùy chỉnh</span>
              )}
            </div>
          </div>
          <div className="mt-4">
            {String(memberCard.member.userId) === String(currentUserId) ? (
              <button
                type="button"
                onClick={() => {
                  setMemberCard((prev) => ({ ...prev, open: false }));
                  navigate('/profile');
                }}
                className="w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Sửa hồ sơ
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  value={memberCard.quickMessage}
                  onChange={(e) => setMemberCard((prev) => ({ ...prev, quickMessage: e.target.value }))}
                  placeholder={`Nhắn tin @${memberCard.member.displayName}`}
                  className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    isDarkMode
                      ? 'border-white/10 bg-white/5 text-white placeholder:text-slate-500 focus:border-indigo-400/70'
                      : 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={handleQuickMessageSubmit}
                  className="w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Chat nhanh
                </button>
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    );

  const tabBtn = (id, label, badgeCount = 0) => (
    <button
      key={id}
      type="button"
      onClick={() => setSidebarTab(id)}
      className={`min-w-0 flex-1 rounded-lg px-1.5 py-2 text-[10px] font-semibold leading-tight transition sm:text-[11px] ${
        sidebarTab === id
          ? isDarkMode
            ? 'bg-[#4F6BED]/15 text-[#F3F4F6] ring-1 ring-[#4F6BED]/30'
            : 'bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200'
          : isDarkMode
            ? 'text-[#8e9297] hover:bg-white/[0.04] hover:text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <span className="inline-flex items-center gap-1">
        <span>{label}</span>
        {badgeCount > 0 && (
          <span
            className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
              isDarkMode ? 'bg-rose-500/25 text-rose-100' : 'bg-rose-100 text-rose-800'
            }`}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </span>
    </button>
  );

  if (workspaceSearchOpen && organizationId) {
    return (
      <div
        className={`flex h-full min-h-0 flex-col ${isDarkMode ? 'bg-[#11141C]' : 'bg-slate-50'}`}
      >
        <OrgWorkspaceSearchSidebar
          organizationId={organizationId}
          serverId={serverId}
          channels={searchChannels}
          isDarkMode={isDarkMode}
          onClose={() => onWorkspaceSearchOpenChange?.(false)}
          onJumpToResult={(payload) => {
            onWorkspaceSearchJump?.(payload);
            onWorkspaceSearchOpenChange?.(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl ${isDarkMode ? 'bg-[#11141C]' : 'bg-white'}`}
    >
      <div
        className={`shrink-0 rounded-t-xl border-b px-3 py-2.5 ${isDarkMode ? 'border-white/[0.06]' : 'border-slate-200/80'}`}
      >
        <div
          className={`truncate text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
          title={organizationName}
        >
          {organizationName || t('organizations.memberSidebarOrgFallback')}
        </div>
        <p
          className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
        >
          {t('organizations.memberSidebarSubtitle')}
        </p>
      </div>

      {showSidebarTabs ? (
        <div
          className={`grid shrink-0 grid-cols-2 gap-1 border-b px-2 py-2 sm:grid-cols-4 ${
            isDarkMode ? 'border-white/[0.06] bg-[#0F1117]' : 'border-slate-200 bg-slate-50'
          }`}
        >
          {tabBtn('people', t('organizations.memberSidebarTabPeople'), pendingReviewCount)}
          {tabBtn('activity', t('organizations.memberSidebarTabActivity'))}
          {canShowTasksTab && tabBtn('tasks', t('organizations.memberSidebarTabTasks'))}
          {canShowFilesTab && tabBtn('files', t('organizations.memberSidebarTabFiles'))}
        </div>
      ) : null}

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto rounded-b-xl px-2 py-2 pb-4">
        {sidebarTab === 'activity' && (
          <ul className="space-y-2 px-1">
            {activityFeedItems.map((item) => (
              <li
                key={item.id}
                className={`rounded-lg border px-2.5 py-2 text-xs ${
                  isDarkMode
                    ? 'border-white/[0.06] bg-[#171B24] text-[#A1A8B3]'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                {item.label}
              </li>
            ))}
          </ul>
        )}
        {sidebarTab === 'tasks' && canShowTasksTab && (
          <div className="space-y-3 px-1">
            {loadingSidebarTasks ? (
              <div className="space-y-2 pt-1">
                <div className={`h-8 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-16 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`} />
                <div className={`h-16 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`} />
              </div>
            ) : sidebarTasksError ? (
              <p className="py-2 text-xs text-rose-300">{sidebarTasksError}</p>
            ) : teamTaskSections.length === 0 ? (
              <p
                className={`py-6 text-center text-xs ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
              >
                Không có việc cần làm phù hợp. Bạn chỉ thấy task được giao cho bạn hoặc task public của team.
              </p>
            ) : (
              teamTaskSections.map((section) => (
                <div key={section.teamId}>
                  <div
                    className={`mb-1.5 text-[11px] font-bold uppercase tracking-wide ${
                      isDarkMode ? 'text-[#8e9297]' : 'text-slate-600'
                    }`}
                  >
                    {section.teamName} ({section.tasks.length})
                  </div>
                  <ul className="space-y-1.5">
                    {section.tasks.map((task) => {
                      const isMine = String(task.assigneeId || '') === currentUserIdStr;
                      return (
                        <li
                          key={task._id}
                          className={`rounded-lg border px-2 py-2 ${
                            isDarkMode
                              ? 'border-white/[0.08] bg-[#171B24]'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <p
                            className={`line-clamp-2 text-xs font-semibold ${
                              isDarkMode ? 'text-white' : 'text-slate-900'
                            }`}
                          >
                            {task.title}
                          </p>
                          <div
                            className={`mt-1 flex items-center justify-between gap-2 text-[10px] ${
                              isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'
                            }`}
                          >
                            <span className="truncate">{task.boardTitle || 'Task Board'}</span>
                            <span className={isMine ? 'text-emerald-400' : ''}>
                              {isMine ? 'Được giao cho bạn' : 'Public team'}
                            </span>
                          </div>
                          <div
                            className={`mt-0.5 flex items-center justify-between gap-2 text-[10px] ${
                              isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'
                            }`}
                          >
                            <span className="truncate">{task.listTitle || 'Không có danh sách'}</span>
                            <span>{formatTaskDueDate(task.dueDate) || 'Không hạn'}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
        {sidebarTab === 'files' && canShowFilesTab && organizationId && (
          <OrgMemberSidebarAttachments
            organizationId={organizationId}
            channels={searchChannels}
            selectedChannelId={selectedChannelId}
            channelPermissionMatrix={channelPermissionMatrix}
            isDarkMode={isDarkMode}
            onJumpToChannel={({ organizationId: orgId, roomId }) => {
              if (orgId && roomId) {
                onWorkspaceSearchJump?.({ organizationId: orgId, roomId });
              }
            }}
          />
        )}
        {sidebarTab === 'people' && loading && (
          <div className="space-y-2">
            <div
              className={`h-9 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/10' : 'bg-slate-200/90'}`}
            />
            <div
              className={`h-9 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}
            />
            <div
              className={`h-9 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}
            />
          </div>
        )}
        {sidebarTab === 'people' && !loading && error && (
          <p className="px-1 text-xs text-rose-300">{error}</p>
        )}
        {sidebarTab === 'people' && !loading && !error && rows.length === 0 && (
          <p className="px-1 text-xs text-gray-500">{t('organizations.membersEmpty')}</p>
        )}
        {!loading &&
          !error &&
          sidebarTab === 'people' &&
          sections.map((section) => (
            <div key={section.key} className="mb-4">
              <div
                className={`sticky top-0 z-[1] px-1 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm ${
                  isDarkMode
                    ? 'bg-[#11141C]/95 text-[#6B7280]'
                    : 'bg-slate-50/95 text-slate-500'
                }`}
              >
                {section.key === 'on'
                  ? `ĐANG ONLINE - ${section.items.length}`
                  : section.key === 'off'
                    ? `NGOẠI TUYẾN - ${section.items.length}`
                    : t('organizations.memberSidebarMemberLine', {
                        title: section.title,
                        count: section.items.length,
                      })}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((m) => {
                  const online = checkOnline(m.userId);
                  const dim = groupMode === 'presence' && !online;
                  const statusLabel = online ? t('organizations.presenceOnline') : t('organizations.presenceOffline');
                  return (
                    <li
                      key={m.membershipId}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl px-1.5 py-2 transition ${
                        isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100/90'
                      } ${dim ? 'opacity-55' : ''}`}
                      onContextMenu={(e) => openMemberMenu(e, m)}
                      onClick={(e) => openMemberCard(m, e.currentTarget.getBoundingClientRect())}
                    >
                      <UserAvatar
                        avatar={m.avatar}
                        userId={m.userId}
                        name={m.displayName}
                        size="sm"
                        showOnline
                        status={online ? 'online' : 'offline'}
                        ringClassName={isDarkMode ? 'border-[#11141C]' : 'border-white'}
                      />
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                        >
                          {m.displayName}
                        </div>
                        {groupMode === 'role' && (
                          <div
                            className={`truncate text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                          >
                            {roleLabelMap[m.role] || m.role}
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-medium ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}
                      >
                        {statusLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        {!loading && !error && sidebarTab === 'people' && canReviewJoinApplications && (
          <div className="mb-4">
            <div
              className={`sticky top-0 z-[1] px-1 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm ${
                isDarkMode ? 'bg-[#0a0c12]/95 text-[#6d7380]' : 'bg-sky-50/95 text-slate-500'
              }`}
            >
              Danh sách đang chờ xét duyệt ({pendingReviewCount})
            </div>
            {loadingJoinApplicationsToReview ? (
              <div className="space-y-2">
                <div className={`h-10 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
                <div className={`h-10 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`} />
              </div>
            ) : pendingReviewCount === 0 ? (
              <p className={`px-1 py-2 text-xs ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}>
                Không có đơn chờ xét duyệt.
              </p>
            ) : (
              <ul className="space-y-2">
                {joinApplicationsToReview.map((app) => {
                  const key = joinReviewKey(app.organizationId, app.applicationId);
                  const applicantName =
                    app?.applicantSnapshot?.fullName ||
                    app?.applicantSnapshot?.username ||
                    app?.applicantSnapshot?.email ||
                    app?.applicantUser ||
                    'Unknown';
                  return (
                    <li
                      key={key}
                      className={`rounded-lg border px-2 py-2 transition ${
                        isDarkMode
                          ? 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedJoinApplication(app)}
                        className="w-full text-left"
                      >
                        <div className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {applicantName}
                        </div>
                        <div className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}>
                          {app.submittedAt ? new Date(app.submittedAt).toLocaleString() : ''}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      {menuPortal}
      {memberCardPortal}
      {joinApplicationDetailPortal}
      <ConfirmDialog
        isOpen={memberConfirm != null}
        onClose={() => setMemberConfirm(null)}
        onConfirm={confirmMemberAction}
        title={
          memberConfirm?.type === 'remove'
            ? t('organizations.confirmRemoveMemberTitle')
            : t('organizations.confirmBlockUserTitle')
        }
        message={
          memberConfirm?.type === 'remove'
            ? t('organizations.confirmRemoveMemberMsg', {
                name: memberConfirm?.member?.displayName || t('organizations.memberFallbackRemove'),
              })
            : t('organizations.confirmBlockUserMsg', {
                name: memberConfirm?.member?.displayName || t('organizations.memberFallbackBlock'),
              })
        }
        confirmText={
          memberConfirm?.type === 'remove' ? t('common.delete') : t('organizations.confirmBlockBtn')
        }
        cancelText={t('nav.cancel')}
      />
    </div>
  );
}

export default OrganizationMemberSidebar;
