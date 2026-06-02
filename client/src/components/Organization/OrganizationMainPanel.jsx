import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import CreateTaskFromAiModal from '../Chat/CreateTaskFromAiModal';
import { getAiTaskEligibility, AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';
import { shellNavRailBackdrop } from '../../theme/shellTheme';
import OrganizationDocumentsWorkspacePanel from '../../features/orgDocuments/OrganizationDocumentsWorkspacePanel';
import OrganizationNotificationsWorkspacePanel from '../../features/orgNotifications/OrganizationNotificationsWorkspacePanel';
import { isWorkspaceAuxTab, normalizeWorkspaceTab } from '../../utils/workspaceTabUtils';

import {
  Bell,
  ChevronsDown,
  Filter,
  Hash,
  Home,
  LayoutGrid,
  List,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Zap,
} from 'lucide-react';

import { Modal } from '../Shared';
import UserAvatar from '../Shared/UserAvatar';
import UnifiedChatComposer from '../Chat/UnifiedChatComposer';
import ChatUploadProgressBar from '../Chat/ChatUploadProgressBar';
import { ChatMessageAttachmentBody } from '../Chat/ChatFileAttachment';
import ChannelMessageToolbar from './ChannelMessageToolbar';
import OrgMessageInlineEditor from './OrgMessageInlineEditor';
import ChannelMessageMoreMenu from './ChannelMessageMoreMenu';
import TasksKanbanDnd, { COL_DONE, COL_PROGRESS, COL_TODO } from '../Tasks/TasksKanbanDnd';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { displayDepartmentName, channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

import OrganizationVoiceChannelView from './OrganizationVoiceChannelView';
import OrganizationWorkspaceStructureSidebar from './OrganizationWorkspaceStructureSidebar';
import OrganizationSidebarAudioBar from './OrganizationSidebarAudioBar';
import OrganizationVoiceConnectionPanel from './OrganizationVoiceConnectionPanel';
import VoiceAudioSettingsPanel from '../../pages/Voice/VoiceAudioSettingsPanel';
import { loadVoiceAudioPrefs } from '../../pages/Voice/voiceAudioPrefs';
import { entShell, roleBadgeClass, roleBadgeLabel } from '../../theme/enterpriseWorkspace';
import { parseMessageMentions } from '../../utils/parseMessageMentions';
import { collectMentionLabelsFromContacts } from '../../utils/tokenizeMessageMentions';
import {
  taskAPI,
  unwrapTaskApiPayload,
  unwrapTaskBoardDetailPayload,
  unwrapTaskBoardListPayload,
} from '../../services/api/taskAPI';
import CreateTaskBoardModal from './CreateTaskBoardModal';
import TaskBoardWorkspacePanel from './TaskBoardWorkspacePanel';

function messageDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function senderInitials(message) {
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    const n = u.displayName || u.username || u.fullName || '';
    if (typeof n === 'string' && n.trim()) {
      const p = n.trim().split(/\s+/);
      if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
  }
  return 'TV';
}

function senderDisplayName(message, isMine, currentUser, fallback) {
  if (isMine) {
    return (
      currentUser?.displayName ||
      currentUser?.fullName ||
      currentUser?.username ||
      currentUser?.email?.split?.('@')?.[0] ||
      fallback
    );
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    return u.displayName || u.username || u.fullName || fallback;
  }
  return fallback;
}

function senderAvatarUrl(message, isMine, currentUser) {
  if (isMine) {
    return currentUser?.avatar || currentUser?.profile?.avatar || null;
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    return u.avatar || u.profile?.avatar || null;
  }
  return null;
}

function senderUserId(message, isMine, currentUser) {
  if (isMine) {
    const id = currentUser?.id || currentUser?._id || currentUser?.userId;
    return id != null ? String(id) : null;
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    const id = u._id || u.id || u.userId;
    return id != null ? String(id) : null;
  }
  if (u != null && u !== '') return String(u);
  return null;
}

function userInitialsFromProfile(user) {
  const name =
    user?.displayName || user?.fullName || user?.username || user?.email?.split?.('@')?.[0] || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

const OrganizationMainPanel = ({
  landingDemo = false,
  workspaceTabView = 'chat',
  workspaceDocFiles = [],
  loadingWorkspaceDocuments = false,
  workspaceDocumentsError = '',
  onWorkspaceDocumentsReload,
  notificationsFetchEnabled = false,
  selectedOrganization,
  departments = [],
  selectedDepartment,
  branches = [],
  selectedBranchId = '',
  selectedDivisionId = '',
  onSelectBranch,
  onSelectDivision,
  channels = [],
  channelPermissionMatrix = {},
  membershipScope = null,
  teams = [],
  selectedTeamId = '',
  selectedChannelId,
  messages = [],
  messageInput = '',
  onChangeMessageInput,
  onSendMessage,
  loadingMessages = false,
  hasMoreOlderMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages,
  sendingMessage = false,
  currentUserId,
  currentUser = null,
  onSelectChannel,
  onSelectDepartment,
  onSelectTeam,
  onOpenNotificationsPage,
  onOpenDocumentInWorkspace,
  onCreateDepartment,
  onCreateChannel,
  onOpenChannelSettings,
  onOpenDivisionSettings,
  onOpenDepartmentSettings,
  onOpenTeamSettings,
  onSendChatOption,
  chatContacts = [],
  loadingChatContacts = false,
  loadingChannels = false,
  loadingDepartments = false,
  channelUploadProgress = null,
  /** Trả lời tin (Discord-like) */
  replyingToMessage = null,
  onClearReply,
  onReplyToMessage,
  onSaveMessageEdit,
  onDeleteMessage,
  onForwardMessage,
  onQuickReactMessage,
  /** ID user đang socket online — avatar stack + số đếm ở header workspace */
  workspaceOnlineUserIds = [],
  /** Kết quả tìm kiếm workspace: chuyển kênh / nhảy tin */
  onWorkspaceSearchJump,
  workspaceSearchOpen = false,
  onWorkspaceSearchOpenChange,
  workspaceTasks = [],
  loadingWorkspaceTasks = false,
  taskWorkspaceScope = null,
  onMoveWorkspaceTask,
  onCreateWorkspaceTask,
  onWorkspaceTasksRefresh,
  onOpenOrganizationSettings,
  onInviteOrganization,
  canInviteMembers = false,
  canManageWorkspaceStructure = false,
  canManageChannelRoleAccess = false,
  canSeeAllStructure = false,
  onWorkspaceTabChange,
  onDisconnectVoice,
  organizationId = '',
  onVoiceRoomSessionEnd,
  onOpenVoiceChatSidebar,
  voiceChatSidebarOpen = true,
  /** Đăng ký mở poll/danh thiếp cho composer chat voice (sidebar phải) */
  onRegisterVoiceComposerHelpers,
  /** Gắn emoji vào ô nhập đang active (text hoặc voice sidebar) */
  onAppendComposerEmoji,
  onCreateTaskBoardFromTeamMenu,
  initialTaskBoardTeam = null,
}) => {
  const { locale } = useLocale();
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const location = useLocation();

  useEffect(() => {
    setShowEmojiPicker(false);
    setMoreMenu({ open: false, anchorRect: null, message: null });
  }, [location.pathname]);

  const formatDateDividerLabel = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const t0 = startOf(d);
    const now = new Date();
    const today0 = startOf(now);
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yesterday0 = startOf(y);
    const loc = locale === 'en' ? 'en-US' : 'vi-VN';
    const dd = d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
    if (t0 === today0) return `${t('orgPanel.dateToday')} — ${dd}`;
    if (t0 === yesterday0) return `${t('orgPanel.dateYesterday')} — ${dd}`;
    return d.toLocaleDateString(loc, {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState('24h');
  const [allowMultiAnswer, setAllowMultiAnswer] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactCategory, setContactCategory] = useState('all');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [useManualContactEntry, setUseManualContactEntry] = useState(false);
  const [manualContactFullName, setManualContactFullName] = useState('');
  const [manualContactPhone, setManualContactPhone] = useState('');
  const [manualContactEmail, setManualContactEmail] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const forceScrollOnChannelRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null, message: null });
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskSourceMessage, setCreateTaskSourceMessage] = useState(null);
  const [createTaskMentions, setCreateTaskMentions] = useState([]);
  /** Hover: thanh công cụ phía trên bubble hoặc phía dưới (tránh cắt khi tin ở đầu khung chat) */
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});
  const [workspaceTab, setWorkspaceTab] = useState(() => normalizeWorkspaceTab(workspaceTabView));
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskDepartmentFilter, setTaskDepartmentFilter] = useState('all');
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskBoardCreateOpen, setTaskBoardCreateOpen] = useState(false);
  const [creatingTaskBoard, setCreatingTaskBoard] = useState(false);
  const [taskBoards, setTaskBoards] = useState([]);
  const [loadingTaskBoards, setLoadingTaskBoards] = useState(false);
  const [selectedTaskBoardId, setSelectedTaskBoardId] = useState('');
  const [taskBoardDetail, setTaskBoardDetail] = useState(null);
  const [accessibleTaskBoards, setAccessibleTaskBoards] = useState([]);
  const [loadingTaskBoardDetail, setLoadingTaskBoardDetail] = useState(false);
  const [taskBoardTeam, setTaskBoardTeam] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium',
    assigneeId: '',
    departmentId: '',
  });
  const [voiceConnectionState, setVoiceConnectionState] = useState('idle'); // idle | connecting | connected | error
  const orgVoiceUserId = String(currentUserId || currentUser?.id || currentUser?._id || '').trim();
  const initialVoiceTogglePrefs = loadVoiceAudioPrefs(orgVoiceUserId);
  const [voiceAudioState, setVoiceAudioState] = useState({
    isMuted: Boolean(initialVoiceTogglePrefs.micMuted),
    isSpeakerOff: Boolean(initialVoiceTogglePrefs.speakerOff),
    canToggleMute: false,
  });
  const voiceControlActionsRef = useRef({
    disconnect: null,
    toggleMute: null,
    toggleSpeaker: null,
  });
  const initialOrgVoiceAudio = loadVoiceAudioPrefs(orgVoiceUserId);
  const [orgVoiceSettingsOpen, setOrgVoiceSettingsOpen] = useState(false);
  const [orgMicId, setOrgMicId] = useState(initialOrgVoiceAudio.micDeviceId);
  const [orgSpeakerId, setOrgSpeakerId] = useState(initialOrgVoiceAudio.speakerDeviceId);
  const [orgMicVolume, setOrgMicVolume] = useState(initialOrgVoiceAudio.micVolume);
  const [orgSpeakerVolume, setOrgSpeakerVolume] = useState(initialOrgVoiceAudio.speakerVolume);

  // Sidebar trái (cấu trúc): kéo thu tối đa 100px, rộng tối đa mặc định + 100px.
  const LEFT_ASIDE_BASE_W = 252;
  const LEFT_ASIDE_MIN_W = 100;
  const LEFT_ASIDE_MAX_W = LEFT_ASIDE_BASE_W + 100;
  const [leftAsideW, setLeftAsideW] = useState(LEFT_ASIDE_BASE_W);
  const leftAsideResizeRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const st = leftAsideResizeRef.current;
      if (!st || !st.active) return;
      const x = e?.clientX ?? 0;
      const dx = x - st.startX; // kéo sang phải => tăng width
      const next = Math.round(st.startW + dx);
      const clamped = Math.max(st.minW, Math.min(st.maxW, next));
      setLeftAsideW(clamped);
      e?.preventDefault?.();
    };
    const onUp = () => {
      const st = leftAsideResizeRef.current;
      if (!st || !st.active) return;
      leftAsideResizeRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const openWorkspaceChat = () => {
    setWorkspaceTab('chat');
    onWorkspaceTabChange?.('chat');
  };

  useEffect(() => {
    const nextTab = normalizeWorkspaceTab(workspaceTabView);
    setWorkspaceTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [workspaceTabView]);

  const auxWorkspaceTab = isWorkspaceAuxTab(workspaceTab);

  const scopedChannels = selectedTeamId
    ? channels.filter((channel) => String(channel.team || '') === String(selectedTeamId))
    : channels;
  const chatChannels = scopedChannels.filter((channel) => channel.type !== 'voice');
  const voiceChannels = scopedChannels.filter((channel) => channel.type === 'voice');
  const getChannelPerm = (channelId) => {
    const row = channelPermissionMatrix?.[String(channelId)] || null;
    const canSee = Boolean(row?.canSee ?? row?.canRead);
    return {
      canSee,
      canRead: Boolean(row?.canRead),
      canWrite: Boolean(row?.canWrite),
      canDelete: Boolean(row?.canDelete),
      canVoice: Boolean(row?.canVoice),
    };
  };
  const selectedChannel =
    channels.find((channel) => String(channel._id) === String(selectedChannelId)) || null;
  const selectedChannelPerm = getChannelPerm(selectedChannelId);
  const canWriteInChannel = Boolean(selectedChannelPerm.canWrite);
  const channelReadOnly =
    Boolean(selectedChannelId) &&
    Boolean(selectedChannelPerm.canSee || selectedChannelPerm.canRead) &&
    !canWriteInChannel;
  const isVoiceChannel = selectedChannel?.type === 'voice';
  const canVoiceChannel = Boolean(getChannelPerm(selectedChannelId).canVoice);
  const selectedTeam = teams.find((team) => String(team._id) === String(selectedTeamId)) || null;
  const voiceConnVisible = isVoiceChannel && canVoiceChannel;
  const voiceConnConnected = voiceConnectionState === 'connected';
  const currentUserName =
    currentUser?.displayName ||
    currentUser?.fullName ||
    currentUser?.username ||
    currentUser?.email?.split?.('@')?.[0] ||
    t('orgPanel.you');
  const currentUserAvatar = currentUser?.avatar || currentUser?.profile?.avatar || null;
  useEffect(() => {
    if (!isVoiceChannel || !canVoiceChannel) {
      setVoiceConnectionState('idle');
      const prefs = loadVoiceAudioPrefs(orgVoiceUserId);
      setVoiceAudioState((prev) => ({
        isMuted: prefs.micMuted,
        isSpeakerOff: prefs.speakerOff,
        canToggleMute: false,
      }));
      voiceControlActionsRef.current = { toggleMute: null, toggleSpeaker: null, disconnect: null };
    }
  }, [isVoiceChannel, canVoiceChannel, selectedChannelId]);

  const handleOrgAudioPrefChange = ({ micMuted, speakerOff }) => {
    setVoiceAudioState((prev) => ({
      ...prev,
      isMuted: micMuted ?? prev.isMuted,
      isSpeakerOff: speakerOff ?? prev.isSpeakerOff,
    }));
  };
  const canTeamReadAnyChannel = (teamId) =>
    channels.some(
      (channel) =>
        String(channel.team || '') === String(teamId) && getChannelPerm(channel._id).canRead
    );

  const sortedWorkspaceMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const CHAT_NEAR_BOTTOM_PX = 64;

  const updateNearBottomState = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) {
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScroll <= 4) {
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
      return;
    }
    const distFromBottom = maxScroll - el.scrollTop;
    const near = distFromBottom <= CHAT_NEAR_BOTTOM_PX;
    isNearBottomRef.current = near;
    setShowJumpToLatest(!near);
  }, []);

  const handleChatScroll = useCallback(() => {
    updateNearBottomState();
  }, [updateNearBottomState]);

  const scrollChatToLatest = useCallback((behavior = 'auto') => {
    const el = chatScrollRef.current;
    if (!el) return;
    const apply = () => {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxScroll > 0) {
        if (behavior === 'smooth') {
          el.scrollTo({ top: maxScroll, behavior: 'smooth' });
        } else {
          el.scrollTop = maxScroll;
        }
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
      }
      isNearBottomRef.current = true;
      setShowJumpToLatest(false);
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(updateNearBottomState);
      });
    });
  }, [updateNearBottomState]);

  useEffect(() => {
    if (auxWorkspaceTab || isVoiceChannel) return;
    forceScrollOnChannelRef.current = true;
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    const el = chatScrollRef.current;
    if (el) el.scrollTop = 0;
  }, [selectedChannelId, workspaceTab, isVoiceChannel, auxWorkspaceTab]);

  useEffect(() => {
    if (auxWorkspaceTab || isVoiceChannel || loadingMessages) return;

    if (forceScrollOnChannelRef.current) {
      forceScrollOnChannelRef.current = false;
      scrollChatToLatest('auto');
      return;
    }

    if (!isNearBottomRef.current) return;
    scrollChatToLatest(sortedWorkspaceMessages.length > 0 ? 'smooth' : 'auto');
  }, [
    selectedChannelId,
    sortedWorkspaceMessages,
    loadingMessages,
    workspaceTab,
    isVoiceChannel,
    auxWorkspaceTab,
    scrollChatToLatest,
  ]);

  const filteredWorkspaceTasks = useMemo(() => {
    const q = String(taskSearchQuery || '').trim().toLowerCase();
    return (workspaceTasks || []).filter((task) => {
      const byQuery =
        !q ||
        `${task?.title || ''} ${task?.description || ''} ${task?.departmentName || ''}`
          .toLowerCase()
          .includes(q);
      const taskDeptId = String(task?.departmentId || task?.department?._id || '');
      const byDepartment = taskDepartmentFilter === 'all' || taskDeptId === taskDepartmentFilter;
      return byQuery && byDepartment;
    });
  }, [workspaceTasks, taskSearchQuery, taskDepartmentFilter]);

  const taskColumns = useMemo(() => {
    const todo = [];
    const inProgress = [];
    const done = [];
    for (const task of filteredWorkspaceTasks) {
      const status = String(task?.status || 'todo');
      if (status === 'done') done.push(task);
      else if (status === 'in_progress' || status === 'review') inProgress.push(task);
      else todo.push(task);
    }
    return { todo, inProgress, done };
  }, [filteredWorkspaceTasks]);

  const taskSummary = useMemo(() => {
    const total = (workspaceTasks || []).length;
    const inProgressCount = (workspaceTasks || []).filter((t) => {
      const status = String(t?.status || '');
      return status === 'in_progress' || status === 'review';
    }).length;
    const reviewCount = (workspaceTasks || []).filter((t) => String(t?.status || '') === 'review').length;
    const doneCount = (workspaceTasks || []).filter((t) => String(t?.status || '') === 'done').length;
    const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    return { total, inProgressCount, reviewCount, doneCount, progressPercent };
  }, [workspaceTasks]);


  const orgIdForTask =
    organizationId || selectedOrganization?._id || selectedOrganization?.id || null;
  const workspaceSlugForTask = String(selectedOrganization?.slug || '').trim();
  const taskBoardApiCtx = useMemo(
    () => ({
      organizationId: orgIdForTask ? String(orgIdForTask) : '',
      workspaceSlug: workspaceSlugForTask,
    }),
    [orgIdForTask, workspaceSlugForTask]
  );
  useEffect(() => {
    if (!initialTaskBoardTeam) return;
    setTaskBoardTeam(initialTaskBoardTeam);
    setTaskBoardCreateOpen(true);
  }, [initialTaskBoardTeam]);

  const loadTaskBoards = useCallback(async () => {
    if (!orgIdForTask) {
      setTaskBoards([]);
      setSelectedTaskBoardId('');
      setTaskBoardDetail(null);
      return;
    }
    setLoadingTaskBoards(true);
    try {
      const filters = { ...taskBoardApiCtx };
      if (selectedTeamId) filters.teamId = String(selectedTeamId);
      const res = await taskAPI.getBoards(filters);
      const list = unwrapTaskBoardListPayload(res);
      setTaskBoards(list);
      if (!list.some((b) => String(b._id) === String(selectedTaskBoardId))) {
        setSelectedTaskBoardId(list[0]?._id ? String(list[0]._id) : '');
      }
    } catch (err) {
      setTaskBoards([]);
      toast.error(resolveApiErrorMessage(err, 'Không tải được Task Board'));
    } finally {
      setLoadingTaskBoards(false);
    }
  }, [taskBoardApiCtx, selectedTeamId, organizationId, selectedTaskBoardId]);

  const loadTaskBoardDetail = useCallback(async (boardId, options = {}) => {
    const silent = Boolean(options?.silent);
    if (!boardId) {
      setTaskBoardDetail(null);
      return;
    }
    if (!silent) setLoadingTaskBoardDetail(true);
    try {
      const res = await taskAPI.getBoardDetail(String(boardId), taskBoardApiCtx);
      setTaskBoardDetail(unwrapTaskBoardDetailPayload(res));
    } catch (err) {
      setTaskBoardDetail(null);
      toast.error(resolveApiErrorMessage(err, 'Không tải được chi tiết Task Board'));
    } finally {
      if (!silent) setLoadingTaskBoardDetail(false);
    }
  }, [taskBoardApiCtx]);

  const loadAccessibleTaskBoards = useCallback(async () => {
    if (!orgIdForTask) {
      setAccessibleTaskBoards([]);
      return;
    }
    try {
      const res = await taskAPI.getBoards({ ...taskBoardApiCtx });
      setAccessibleTaskBoards(unwrapTaskBoardListPayload(res));
    } catch {
      setAccessibleTaskBoards([]);
    }
  }, [taskBoardApiCtx]);

  useEffect(() => {
    if (workspaceTab !== 'tasks') return;
    loadTaskBoards();
    loadAccessibleTaskBoards();
  }, [workspaceTab, loadTaskBoards, loadAccessibleTaskBoards]);

  useEffect(() => {
    if (workspaceTab !== 'tasks') return;
    loadTaskBoardDetail(selectedTaskBoardId);
  }, [workspaceTab, selectedTaskBoardId, loadTaskBoardDetail]);

  const refreshTaskBoardView = useCallback(async () => {
    if (!selectedTaskBoardId) return;
    await loadTaskBoardDetail(selectedTaskBoardId, { silent: true });
  }, [selectedTaskBoardId, loadTaskBoardDetail]);

  const handleReorderBoardList = useCallback(
    async (listId, position) => {
      if (!selectedTaskBoardId || !listId) return;
      let rollbackLists = null;
      try {
        setTaskBoardDetail((prev) => {
          if (!prev?.lists) return prev;
          const source = [...prev.lists];
          rollbackLists = source;
          const ids = source.map((l) => String(l._id));
          const fromIdx = ids.indexOf(String(listId));
          if (fromIdx < 0) return prev;
          const next = source.filter((l) => String(l._id) !== String(listId));
          const targetIdx = Math.max(0, Math.min(Number(position || 1) - 1, next.length));
          next.splice(targetIdx, 0, source[fromIdx]);
          return {
            ...prev,
            lists: next.map((l, idx) => ({ ...l, order: (idx + 1) * 1000 })),
          };
        });
        await taskAPI.reorderBoardList(
          String(selectedTaskBoardId),
          String(listId),
          { position },
          taskBoardApiCtx
        );
      } catch (err) {
        if (rollbackLists) {
          setTaskBoardDetail((prev) => (prev ? { ...prev, lists: rollbackLists } : prev));
        }
        toast.error(resolveApiErrorMessage(err, 'Không thể sắp xếp danh sách'));
      }
    },
    [selectedTaskBoardId, taskBoardApiCtx]
  );

  const handleCreateTaskBoard = async (payload) => {
    if (!orgIdForTask || !taskBoardTeam?._id) return;
    setCreatingTaskBoard(true);
    try {
      const scopeType = String(taskBoardTeam.scopeType || 'team').toLowerCase();
      const res = await taskAPI.createBoard({
        ...taskBoardApiCtx,
        ...(scopeType === 'team'
          ? { teamId: String(taskBoardTeam._id) }
          : { scopeType, scopeId: String(taskBoardTeam._id) }),
        ...payload,
      });
      const board = unwrapTaskApiPayload(res);
      setTaskBoardCreateOpen(false);
      await loadTaskBoards();
      if (board?._id) setSelectedTaskBoardId(String(board._id));
      onCreateTaskBoardFromTeamMenu?.(null);
      toast.success('Tạo Task Board thành công');
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, 'Không tạo được Task Board'));
    } finally {
      setCreatingTaskBoard(false);
    }
  };

  const handleAddBoardList = async (title) => {
    if (!selectedTaskBoardId) return null;
    try {
      const res = await taskAPI.createBoardList(selectedTaskBoardId, { title }, taskBoardApiCtx);
      const list = unwrapTaskApiPayload(res);
      if (list?._id) {
        setTaskBoardDetail((prev) => {
          if (!prev) return prev;
          const lists = [...(Array.isArray(prev.lists) ? prev.lists : []), list].sort(
            (a, b) => Number(a.order || 0) - Number(b.order || 0)
          );
          return { ...prev, lists };
        });
        return list;
      }
      await loadTaskBoardDetail(selectedTaskBoardId);
      return null;
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, 'Không thêm được danh sách'));
      throw err;
    }
  };

  const handleAddBoardCard = async (listId, cardData) => {
    if (!selectedTaskBoardId) return;
    try {
      const res = await taskAPI.createBoardCard(selectedTaskBoardId, cardData, taskBoardApiCtx);
      const card = unwrapTaskApiPayload(res);
      if (!card?._id) return;
      setTaskBoardDetail((prev) => {
        if (!prev) return prev;
        const cards = Array.isArray(prev.cards) ? [...prev.cards, card] : [card];
        const lists = Array.isArray(prev.lists)
          ? prev.lists.map((l) =>
              String(l._id) === String(listId)
                ? { ...l, cardCount: Number(l.cardCount || 0) + 1 }
                : l
            )
          : prev.lists;
        return { ...prev, cards, lists };
      });
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, 'Không thêm được công việc'));
    }
  };

  const handleMoveBoardCard = async (cardId, toListId, index) => {
    if (!cardId || !toListId || !selectedTaskBoardId) return;
    try {
      const payload = { toListId: String(toListId) };
      if (index != null && Number.isFinite(Number(index))) {
        payload.index = Number(index);
      }
      await taskAPI.moveBoardCard(String(cardId), payload, taskBoardApiCtx);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, 'Không thể chuyển card'));
      throw err;
    }
  };

  const handleUpdateBoardCard = async (cardId, updates) => {
    if (!cardId || !selectedTaskBoardId) return;
    try {
      const res = await taskAPI.updateBoardCard(String(cardId), updates || {}, taskBoardApiCtx);
      const updated = unwrapTaskApiPayload(res);
      setTaskBoardDetail((prev) => {
        if (!prev?.cards) return prev;
        const cards = prev.cards.map((c) =>
          String(c._id) === String(cardId)
            ? {
                ...c,
                ...(updates || {}),
                ...(updated && typeof updated === 'object' ? updated : {}),
              }
            : c
        );
        return { ...prev, cards };
      });
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, 'Không thể cập nhật card'));
      throw err;
    }
  };
  const canCreateWorkspaceTask = Boolean(taskWorkspaceScope?.canCreateTask);
  const canUseAiWorkspaceTask = Boolean(taskWorkspaceScope?.canUseAiTask ?? taskWorkspaceScope?.canCreateTask);

  const taskAssigneeLabel = (task) =>
    task?.assignee?.displayName ||
    task?.assignee?.username ||
    (task?.assigneeId ? String(task.assigneeId).slice(-6) : 'Chưa gán');

  const taskAssignerLabel = (task) =>
    task?.createdByUser?.displayName ||
    task?.createdByUser?.username ||
    (task?.createdBy ? String(task.createdBy).slice(-6) : '—');

  const menuCreateTaskCheck = useMemo(() => {
    const base = getAiTaskEligibility(moreMenu.message, {
      organizationId: orgIdForTask ? String(orgIdForTask) : null,
    });
    if (!base.ok) return base;
    if (!canUseAiWorkspaceTask) {
      return {
        ok: false,
        reason: 'Chỉ trưởng phòng, team leader, quản trị viên hoặc chủ sở hữu mới được tạo task tự động',
      };
    }
    return base;
  }, [moreMenu.message, orgIdForTask, canUseAiWorkspaceTask, t]);

  /** Workspace (kênh tổ chức): luôn gọi hook trước mọi return sớm. */
  const workspace = useMemo(() => {
    const ent = entShell(isDarkMode);
    return {
      ...ent,
      composerBar: isDarkMode
        ? 'relative mt-auto shrink-0 rounded-b-xl border-t border-white/[0.06] bg-transparent px-4 pb-3 pt-2.5'
        : 'relative mt-auto shrink-0 rounded-b-xl border-t border-slate-200/80 bg-white px-4 pb-3 pt-2.5',
      composerWrap: 'shrink-0 bg-transparent p-0',
    };
  }, [isDarkMode]);

  const formatTime = (isoDate) => {
    if (!isoDate) return '';
    return new Date(isoDate).toLocaleTimeString('vi-VN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const plainTextForMessage = (msg) => {
    if (!msg) return '';
    const mt = msg.messageType || 'text';
    if (mt === 'text') return String(msg.content || '');
    if (mt === 'file' || mt === 'image')
      return msg.fileMeta?.originalName || String(msg.content || '').slice(0, 200) || t('orgPanel.attachment');
    return String(msg.content || '');
  };

  /** Ảnh / file: không hiện sao chép. Còn lại: có nội dung chuỗi (kể cả link) là cho phép. */
  const canShowCopyTextInMenu = (msg) => {
    if (!msg) return false;
    const mt = String(msg.messageType || 'text').toLowerCase();
    if (mt === 'image' || mt === 'file') return false;
    if (msg.fileMeta) return false;
    const raw = msg.content;
    if (raw == null) return false;
    const s = typeof raw === 'string' ? raw : String(raw);
    return s.trim().length > 0;
  };

  const handleMessageRowMouseEnter = (messageId, event) => {
    const el = event?.currentTarget;
    if (!el) return;
    const needBelow = shouldPlaceToolbarBelowBubble(el);
    const next = needBelow ? 'below' : 'above';
    setToolbarPlacementById((prev) => {
      const key = String(messageId);
      if (prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
  };

  const canEditOrgMessage = (msg) => {
    const mt = msg?.messageType || 'text';
    if (mt !== 'text') return false;
    if (msg?.fileMeta) return false;
    return true;
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    setEditingMessageId(null);
    setEditDraft('');
  };

  const beginEditMessage = (msg) => {
    const id = msg?._id || msg?.id;
    if (!id || !canEditOrgMessage(msg)) return;
    setEditingMessageId(id);
    setEditDraft(plainTextForMessage(msg));
  };

  const submitEdit = async (messageId) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !messageId || savingEdit) return;
    if (!onSaveMessageEdit) {
      toast.error(t('organizations.editFail'));
      return;
    }
    setSavingEdit(true);
    try {
      await onSaveMessageEdit(messageId, trimmed);
      cancelEdit();
    } catch {
      /* toast ở OrganizationsPage */
    } finally {
      setSavingEdit(false);
    }
  };

  const replyToLabel = (msg) => {
    const sid = msg?.senderId?._id || msg?.senderId;
    if (String(sid || '') === String(currentUserId || '')) return t('orgPanel.you');
    return t('orgPanel.member');
  };

  const handleCreateContactCard = () => {
    setContactSearch('');
    setContactCategory('all');
    setSelectedContactId('');
    setUseManualContactEntry(false);
    setManualContactFullName('');
    setManualContactPhone('');
    setManualContactEmail('');
    setIsContactModalOpen(true);
  };

  const handleCreatePoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollDuration('24h');
    setAllowMultiAnswer(false);
    setIsPollModalOpen(true);
  };

  useEffect(() => {
    if (!onRegisterVoiceComposerHelpers) return undefined;
    onRegisterVoiceComposerHelpers({
      openPoll: handleCreatePoll,
      openContact: handleCreateContactCard,
      openEmoji: () => {
        setEmojiPickerTab('emoji');
        setShowEmojiPicker((prev) => !prev);
      },
    });
    return () => onRegisterVoiceComposerHelpers(null);
  }, [onRegisterVoiceComposerHelpers]);

  const handleFileSelected = (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canWriteInChannel) return;
    onSendChatOption?.({ kind, file });
  };

  const normalizedContacts = chatContacts.map((item) => {
    const id = item.id || item._id;
    return {
      id,
      name: item.name || item.displayName || item.username || t('organizations.userFallback'),
      username: item.username || '',
      role: item.role || '',
      phone: item.phone || item.phoneNumber || item.mobile || '',
      email: item.email || '',
      avatar: item.avatar || null,
      category: item.category || 'friend',
    };
  });

  const mentionLabelsForChat = useMemo(
    () => collectMentionLabelsFromContacts(chatContacts),
    [chatContacts]
  );

  const assignableContactOptions = useMemo(() => {
    const list = Array.isArray(normalizedContacts) ? normalizedContacts : [];
    if (!taskWorkspaceScope || taskWorkspaceScope.visibility === 'org') return list;
    const allowed = new Set((taskWorkspaceScope.assignableUserIds || []).map(String));
    if (!allowed.size) return list;
    return list.filter((c) => allowed.has(String(c.id)));
  }, [normalizedContacts, taskWorkspaceScope]);

  const filteredContacts = normalizedContacts.filter((contact) => {
    const byCategory = contactCategory === 'all' || contact.category === contactCategory;
    const bySearch =
      !contactSearch.trim() ||
      `${contact.name} ${contact.phone} ${contact.email}`
        .toLowerCase()
        .includes(contactSearch.trim().toLowerCase());
    return byCategory && bySearch;
  });

  const filteredComposerEmojis = COMPOSER_EMOJI_LIST.filter((emoji) => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return true;
    return emoji.toLowerCase().includes(keyword);
  });

  const addPollOption = () => {
    if (pollOptions.length >= 6) return;
    setPollOptions((prev) => [...prev, '']);
  };

  const updatePollOption = (index, value) => {
    setPollOptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const removePollOption = (index) => {
    if (pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmitPoll = () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((item) => item.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    onSendChatOption?.({
      kind: 'poll',
      payload: {
        question,
        options,
        duration: pollDuration,
        allowMultiAnswer,
      },
    });
    setIsPollModalOpen(false);
  };

  const handleSubmitContact = () => {
    let payload = {};
    
    if (useManualContactEntry) {
      // Manual entry mode
      const fullName = manualContactFullName.trim();
      if (!fullName) return;
      payload = {
        userId: `manual-${Date.now()}`, // Generate a temporary ID for manual entries
        fullName,
        phone: manualContactPhone.trim(),
        email: manualContactEmail.trim(),
      };
    } else {
      // List selection mode
      const selected = normalizedContacts.find((item) => item.id === selectedContactId);
      if (!selected) return;
      payload = {
        userId: selected.id,
        fullName: selected.name,
        phone: selected.phone,
        email: selected.email,
        avatar: selected.avatar,
        username: selected.username,
        role: selected.role,
      };
    }
    
    onSendChatOption?.({
      kind: 'contact',
      payload,
    });
    setIsContactModalOpen(false);
  };

  const openTaskCreateModal = () => {
    const firstDepartmentId =
      taskDepartmentFilter !== 'all'
        ? taskDepartmentFilter
        : String(selectedDepartment?._id || departments?.[0]?._id || '');
    setTaskForm({
      title: '',
      description: '',
      dueDate: '',
      priority: 'medium',
      assigneeId: '',
      departmentId: firstDepartmentId,
    });
    setTaskCreateOpen(true);
  };

  const submitWorkspaceTask = async () => {
    const title = String(taskForm.title || '').trim();
    if (!title || creatingTask) return;
    setCreatingTask(true);
    try {
      const department = departments.find(
        (item) => String(item._id) === String(taskForm.departmentId)
      );
      await onCreateWorkspaceTask?.({
        title,
        description: String(taskForm.description || '').trim(),
        dueDate: taskForm.dueDate
          ? new Date(`${taskForm.dueDate}T23:59:00`).toISOString()
          : undefined,
        priority: taskForm.priority || 'medium',
        assigneeId: taskForm.assigneeId || undefined,
        departmentId: taskForm.departmentId || undefined,
        departmentName: department?.name || undefined,
        teamId: taskWorkspaceScope?.teamId || undefined,
      });
      setTaskCreateOpen(false);
    } finally {
      setCreatingTask(false);
    }
  };

  const appendEmoji = (emoji) => {
    if (onAppendComposerEmoji) {
      onAppendComposerEmoji(emoji);
    } else {
      onChangeMessageInput?.(`${messageInput || ''}${emoji}`);
    }
    setShowEmojiPicker(false);
    setEmojiSearch('');
  };

  const orgName = selectedOrganization?.name || t('orgPanel.orgFallback');
  const deptName = selectedDepartment?.name
    ? displayDepartmentName(selectedDepartment.name, locale)
    : '—';
  const selectedBranch = branches.find((b) => String(b._id) === String(selectedBranchId)) || null;
  const selectedDivision = selectedBranch?.divisions?.find((d) => String(d._id) === String(selectedDivisionId)) || null;
  const branchName = selectedBranch?.name ? displayDepartmentName(selectedBranch.name, locale) : '—';
  const divisionName = selectedDivision?.name ? displayDepartmentName(selectedDivision.name, locale) : '—';
  const teamName = selectedTeam?.name || '—';
  const chSlug = selectedChannel
    ? channelNameToDisplaySlug(selectedChannel.name || 'chat', locale)
    : '';
  const onlinePreviewIds = (workspaceOnlineUserIds || []).slice(0, 5);
  const mapDropColumnToStatus = (colId) => {
    if (colId === COL_DONE) return 'done';
    if (colId === COL_PROGRESS) return 'in_progress';
    return 'todo';
  };

  return (
    <>
    <div className={`${workspace.shell} h-full min-h-0`}>
      <div className={workspace.shellInner || 'flex h-full min-h-0 flex-1 gap-2 overflow-hidden'}>
        <aside
          className={`${workspace.aside} relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden`}
          style={{ width: leftAsideW, minWidth: LEFT_ASIDE_MIN_W, maxWidth: LEFT_ASIDE_MAX_W }}
        >
          <div
            className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize"
            title={`Kéo để đổi độ rộng (${LEFT_ASIDE_MIN_W}px – ${LEFT_ASIDE_MAX_W}px)`}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              leftAsideResizeRef.current = {
                active: true,
                startX: e.clientX,
                startW: leftAsideW,
                minW: LEFT_ASIDE_MIN_W,
                maxW: LEFT_ASIDE_MAX_W,
              };
              e.preventDefault();
            }}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="scrollbar-overlay flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 py-2.5">
            <div
              className={`mb-2.5 rounded-xl border p-2.5 ${isDarkMode ? 'border-white/10 bg-[#171B24]' : 'border-slate-200 bg-slate-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!canInviteMembers) return;
                    if (selectedOrganization?._id) onInviteOrganization?.(selectedOrganization._id);
                  }}
                  className="min-w-0 text-left"
                  title={canInviteMembers ? 'Mời vào tổ chức' : 'Bạn không có quyền mời thành viên'}
                >
                  <div className={`truncate text-lg font-semibold ${workspace.textPrimary}`}>
                    {orgName}
                  </div>
                  <div className={`mt-0.5 text-xs ${isDarkMode ? 'text-emerald-400/90' : 'text-emerald-700'}`}>
                    ● {t('orgPanel.onlineCount', { n: workspaceOnlineUserIds?.length || 0 })}
                  </div>
                </button>
                {canInviteMembers ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedOrganization?._id) onInviteOrganization?.(selectedOrganization._id);
                    }}
                    className={`rounded-lg px-2 py-1 text-[10px] font-semibold ${
                      isDarkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Mời
                  </button>
                ) : null}
              </div>
            </div>

            <OrganizationWorkspaceStructureSidebar
              isDarkMode={isDarkMode}
              locale={locale}
              t={t}
              branches={branches}
              selectedBranchId={selectedBranchId}
              onSelectBranch={onSelectBranch}
              selectedDivisionId={selectedDivisionId}
              onSelectDivision={onSelectDivision}
              selectedDepartment={selectedDepartment}
              selectedTeamId={selectedTeamId}
              selectedChannelId={selectedChannelId}
              teams={teams}
              channels={channels}
              channelPermissionMatrix={channelPermissionMatrix}
              membershipScope={membershipScope}
              loadingDepartments={loadingDepartments}
              onSelectDepartment={onSelectDepartment}
              onSelectTeam={onSelectTeam}
              onSelectChannel={onSelectChannel}
              onCreateChannel={onCreateChannel}
              onOpenChannelSettings={onOpenChannelSettings}
              onOpenDivisionSettings={onOpenDivisionSettings}
              onOpenDepartmentSettings={onOpenDepartmentSettings}
              onOpenTeamSettings={onOpenTeamSettings}
              canManageWorkspaceStructure={canManageWorkspaceStructure}
              canManageChannelRoleAccess={canManageChannelRoleAccess}
              canSeeAllStructure={canSeeAllStructure}
              canCreateTaskBoard={canCreateWorkspaceTask}
              onCreateTaskBoard={(team) => {
                setTaskBoardTeam(team ? { ...team, scopeType: team.scopeType || 'team' } : null);
                setTaskBoardCreateOpen(true);
              }}
            />
          </div>

          {voiceConnVisible && voiceConnectionState !== 'idle' ? (
            <OrganizationVoiceConnectionPanel
              isDarkMode={isDarkMode}
              t={t}
              connected={voiceConnConnected}
              channelLabel={
                selectedChannel?.name
                  ? channelNameToDisplaySlug(selectedChannel.name, locale)
                  : ''
              }
              orgName={orgName}
              onDisconnect={() => voiceControlActionsRef.current.disconnect?.()}
            />
          ) : null}
          </div>

          <div
            className={`shrink-0 rounded-b-xl ${isDarkMode ? 'bg-[#11141C]' : 'bg-white'}`}
          >
            <OrganizationSidebarAudioBar
              isDarkMode={isDarkMode}
              t={t}
              voiceUserId={orgVoiceUserId}
              voiceInChannel={voiceConnVisible}
              voiceAudioState={voiceAudioState}
              onToggleMute={() => voiceControlActionsRef.current.toggleMute?.()}
              onToggleSpeaker={() => voiceControlActionsRef.current.toggleSpeaker?.()}
              onAudioPrefChange={handleOrgAudioPrefChange}
              onOpenOrganizationSettings={() => onOpenOrganizationSettings?.(selectedOrganization)}
              onOpenVoiceSettings={() => setOrgVoiceSettingsOpen(true)}
            />
          </div>
        </aside>

        <div className={`${workspace.main} h-full min-h-0 overflow-hidden ${isDarkMode ? '!bg-transparent' : ''}`}>
          <header className={`${workspace.header} ${isDarkMode ? '!bg-transparent' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <nav
                  aria-label={t('orgPanel.workspaceBreadcrumbAria')}
                  className={`mb-0.5 flex flex-wrap items-center gap-1 text-[11px] ${
                    isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'
                  }`}
                >
                  <span className="truncate">{branchName}</span>
                  <span className="opacity-50">/</span>
                  <span className="truncate">{divisionName}</span>
                  {selectedTeamId && teamName !== '—' ? (
                    <>
                      <span className="opacity-50">/</span>
                      <span className="truncate">{teamName}</span>
                    </>
                  ) : deptName !== '—' && !selectedTeamId ? (
                    <>
                      <span className="opacity-50">/</span>
                      <span className="truncate">{deptName}</span>
                    </>
                  ) : null}
                  {selectedChannelId ? (
                    <>
                      <span className="opacity-50">/</span>
                      <span
                        className={`truncate font-medium ${isDarkMode ? 'text-[#A1A8B3]' : 'text-slate-700'}`}
                      >
                        #{chSlug || t('organizations.channelNameFallback')}
                      </span>
                    </>
                  ) : null}
                </nav>
                <h2
                  className={`truncate text-base font-semibold ${workspace.textPrimary}`}
                >
                  {workspaceTab === 'tasks'
                    ? t('nav.tasks.label')
                    : workspaceTab === 'documents'
                      ? t('documents.orgTitle')
                      : workspaceTab === 'notifications'
                        ? t('notifications.titleOrganization')
                        : selectedChannelId
                          ? `#${chSlug || t('organizations.channelNameFallback')}`
                          : deptName}
                </h2>
                {workspaceTab === 'chat' && !isVoiceChannel && sortedWorkspaceMessages.length > 0 ? (
                  <p className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}>
                    {t('orgPanel.msgCountLine', { n: sortedWorkspaceMessages.length })}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {workspaceTab === 'tasks' ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedTaskBoardId}
                      onChange={(e) => setSelectedTaskBoardId(e.target.value)}
                      className={`max-w-[200px] rounded-lg border px-2.5 py-1.5 text-xs font-medium outline-none sm:max-w-[240px] sm:text-sm ${
                        isDarkMode
                          ? 'border-white/15 bg-[#1a1d26] text-white'
                          : 'border-slate-200 bg-white text-slate-900'
                      }`}
                      aria-label="Chọn Task Board"
                    >
                      <option value="">Chọn Task Board</option>
                      {taskBoards.map((b) => (
                        <option key={b._id} value={String(b._id)}>
                          {b.title}
                        </option>
                      ))}
                    </select>
                    {loadingTaskBoards ? (
                      <span className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Đang tải...
                      </span>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title={t('orgPanel.workspaceSearchAria')}
                  aria-label={t('orgPanel.workspaceSearchAria')}
                  onClick={() => onWorkspaceSearchOpenChange?.(true)}
                  className={`rounded-lg p-2 transition ${
                    workspaceSearchOpen
                      ? isDarkMode
                        ? 'bg-[#5865F2]/25 text-white'
                        : 'bg-indigo-100 text-indigo-700'
                      : isDarkMode
                        ? 'text-[#b4b8c4] hover:bg-white/[0.06] hover:text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Search className="h-5 w-5" strokeWidth={2} />
                </button>
                <button
                  type="button"
                  title={t('orgPanel.notifTitle')}
                  aria-label={t('orgPanel.notifTitle')}
                  onClick={() => onOpenNotificationsPage?.()}
                  className={`rounded-lg p-2 transition ${
                    isDarkMode
                      ? 'text-[#b4b8c4] hover:bg-white/[0.06] hover:text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Bell className="h-5 w-5" strokeWidth={2} />
                </button>
                </div>
              </div>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={chatScrollRef}
            className="scrollbar-chat min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
            onScroll={handleChatScroll}
          >
            {workspaceTab === 'documents' ? (
              <OrganizationDocumentsWorkspacePanel
                files={workspaceDocFiles}
                loading={loadingWorkspaceDocuments}
                error={workspaceDocumentsError}
                onReload={onWorkspaceDocumentsReload}
                isDarkMode={isDarkMode}
                onOpenInWorkspace={onOpenDocumentInWorkspace}
              />
            ) : workspaceTab === 'notifications' ? (
              <OrganizationNotificationsWorkspacePanel
                organizationId={organizationId ? String(organizationId) : ''}
                organizationSlug={String(selectedOrganization?.slug || '').trim()}
                isDarkMode={isDarkMode}
                fetchEnabled={notificationsFetchEnabled}
              />
            ) : workspaceTab === 'tasks' ? (
              <TaskBoardWorkspacePanel
                isDarkMode={isDarkMode}
                workspaceSlug={workspaceSlugForTask}
                boards={taskBoards}
                accessibleBoards={accessibleTaskBoards}
                selectedBoardId={selectedTaskBoardId}
                boardDetail={taskBoardDetail}
                boardBackground={
                  taskBoardDetail?.board?.background ||
                  taskBoards.find((b) => String(b._id) === String(selectedTaskBoardId))?.background ||
                  ''
                }
                loadingBoards={loadingTaskBoards}
                loadingBoardDetail={loadingTaskBoardDetail}
                onAddList={handleAddBoardList}
                onAddCard={handleAddBoardCard}
                onMoveCard={handleMoveBoardCard}
                onUpdateCard={handleUpdateBoardCard}
                onReorderList={handleReorderBoardList}
                onRefresh={refreshTaskBoardView}
              />
            ) : isVoiceChannel ? (
                selectedChannelId && (
                  <OrganizationVoiceChannelView
                    channelId={String(selectedChannelId)}
                    channelDisplayName={
                      selectedChannel?.name
                        ? channelNameToDisplaySlug(selectedChannel.name, locale)
                        : ''
                    }
                    organizationId={organizationId ? String(organizationId) : ''}
                    channelLabel={selectedChannel?.name || ''}
                    isDarkMode={isDarkMode}
                    canVoice={canVoiceChannel}
                    micDeviceId={orgMicId}
                    speakerDeviceId={orgSpeakerId}
                    speakerVolume={orgSpeakerVolume}
                    landingDemo={landingDemo}
                    onConnectionStateChange={setVoiceConnectionState}
                    onAudioStateChange={setVoiceAudioState}
                    onRoomSessionEnd={onVoiceRoomSessionEnd}
                    onDisconnect={onDisconnectVoice}
                    onControlActionsReady={(actions) => {
                      voiceControlActionsRef.current = actions || {
                        toggleMute: null,
                        toggleSpeaker: null,
                        disconnect: null,
                      };
                    }}
                  />
                )
              ) : (
              <div className="flex min-h-full flex-col px-4 py-3">
              <div className="mt-auto flex flex-col gap-3">
              <>
              {hasMoreOlderMessages && onLoadOlderMessages && (
                <div className="flex justify-center pb-1">
                  <button
                    type="button"
                    disabled={loadingOlderMessages}
                    onClick={onLoadOlderMessages}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      isDarkMode
                        ? 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 disabled:opacity-50'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50'
                    }`}
                  >
                    {loadingOlderMessages
                      ? t('friendChat.loadingOlder')
                      : t('friendChat.loadOlder')}
                  </button>
                </div>
              )}
              {loadingMessages && (
                <div
                  className={`rounded-xl p-4 text-sm ${
                    isDarkMode ? 'bg-white/5 text-gray-300' : 'bg-white/80 text-slate-600 shadow-sm'
                  }`}
                >
                  {t('orgPanel.loadingMsgs')}
                </div>
              )}

              {!loadingMessages && messages.length === 0 && (
                <div
                  className={`rounded-xl p-4 text-sm ${
                    isDarkMode ? 'bg-white/5 text-gray-300' : 'bg-white/80 text-slate-600 shadow-sm'
                  }`}
                >
                  {t('orgPanel.emptyChannelMsgs')}
                </div>
              )}

              {!loadingMessages &&
                sortedWorkspaceMessages.map((message, idx) => {
                  const mid = message._id || message.id;
                  const senderId = message?.senderId?._id || message?.senderId;
                  const isMine = String(senderId || '') === String(currentUserId || '');
                  const type = message?.messageType || 'text';
                  const typeLabel =
                    type === 'image'
                      ? t('orgPanel.msgTypeImage')
                      : type === 'file'
                        ? t('orgPanel.msgTypeFile')
                        : type === 'system'
                          ? t('orgPanel.msgTypeSystem')
                          : t('orgPanel.msgTypeText');
                  const replyId = message.replyToMessageId;
                  const parentMsg = replyId
                    ? sortedWorkspaceMessages.find((m) => String(m._id || m.id) === String(replyId))
                    : null;
                  const replyPreview = parentMsg
                    ? plainTextForMessage(parentMsg).slice(0, 160)
                    : t('orgPanel.threadRoot');
                  const isEditing = editingMessageId && String(editingMessageId) === String(mid);
                  const showToolbar =
                    !isEditing && !sendingMessage && type !== 'system';

                  const toolbarPlace = toolbarPlacementById[String(mid)] ?? 'above';

                  const prev = idx > 0 ? sortedWorkspaceMessages[idx - 1] : null;
                  const showDayDivider =
                    !prev || messageDayKey(message.createdAt) !== messageDayKey(prev.createdAt);

                  const displayName = senderDisplayName(
                    message,
                    isMine,
                    currentUser,
                    t('orgPanel.member')
                  );
                  const avatarUrl = senderAvatarUrl(message, isMine, currentUser);
                  const avatarInitials = isMine
                    ? userInitialsFromProfile(currentUser)
                    : senderInitials(message);
                  const messageRoleKey =
                    type === 'system'
                      ? 'system'
                      : String(message?.senderOrgRole || message?.membershipRole || 'member').toLowerCase();
                  const roleCapsule = roleBadgeLabel(messageRoleKey, t);

                  const contentTextCls = isDarkMode ? 'text-[#dcddde]' : 'text-slate-800';

                  return (
                    <Fragment key={mid}>
                      {showDayDivider && (
                        <div className="flex justify-center py-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                              isDarkMode
                                ? 'border-white/[0.06] bg-[#12151f] text-[#8e9297]'
                                : 'border-slate-200 bg-white text-slate-500 shadow-sm'
                            }`}
                          >
                            {formatDateDividerLabel(message.createdAt)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`group/msg relative -mx-4 px-4 py-0.5 transition-colors ${
                          isDarkMode ? 'hover:bg-white/[0.035]' : 'hover:bg-slate-100/90'
                        }`}
                        onMouseEnter={(e) => handleMessageRowMouseEnter(mid, e)}
                      >
                        {showToolbar && (
                          <div
                            className={`pointer-events-none absolute right-4 z-30 opacity-0 transition-opacity duration-150 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 ${
                              toolbarPlace === 'below'
                                ? 'top-full mt-1'
                                : '-top-1 -translate-y-full'
                            }`}
                          >
                            <ChannelMessageToolbar
                              compact
                              isMine={isMine}
                              showEdit={isMine && canEditOrgMessage(message)}
                              disabled={sendingMessage}
                              onQuickReact={(emoji) => onQuickReactMessage?.(message, emoji)}
                              onOpenEmojiPicker={() => {}}
                              onMiddleAction={() => {
                                if (isMine && canEditOrgMessage(message)) {
                                  beginEditMessage(message);
                                } else {
                                  onReplyToMessage?.(message);
                                }
                              }}
                              onForward={() => onForwardMessage?.(message)}
                              onMore={(e) => {
                                const r = e?.currentTarget?.getBoundingClientRect?.();
                                if (r) {
                                  setMoreMenu({
                                    open: true,
                                    anchorRect: r,
                                    message,
                                  });
                                }
                              }}
                            />
                          </div>
                        )}
                        <div className="flex w-full items-start justify-start gap-3">
                        <UserAvatar
                          avatar={avatarUrl}
                          userId={senderUserId(message, isMine, currentUser)}
                          name={displayName}
                          size="md"
                          className="mt-0.5"
                          title={displayName}
                          ringClassName="shadow-inner"
                        />
                        <div className="min-w-0 max-w-[min(100%,42rem)] flex-1">
                          <div
                            className="mb-1 flex flex-wrap items-center gap-2 justify-start"
                          >
                            <span
                              className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                            >
                              {displayName}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${roleBadgeClass(messageRoleKey, isDarkMode)}`}
                            >
                              {roleCapsule}
                            </span>
                            {type !== 'text' && type !== 'system' ? (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                isDarkMode ? 'bg-white/[0.06] text-[#6B7280]' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {typeLabel}
                            </span>
                            ) : null}
                            <span
                              className={`text-[11px] tabular-nums ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                            >
                              {formatTime(message.createdAt)}
                            </span>
                            {message.editedAt && (
                              <span
                                className={`text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                              >
                                {t('orgPanel.edited')}
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-sm leading-relaxed text-left ${contentTextCls}`}
                          >
                            {replyId && (
                              <div
                                className={`mb-2 border-l-2 pl-2 text-[11px] text-left ${isMine ? 'border-[#5865F2]/50 text-[#949ba4]' : 'border-[#5865F2]/40 text-[#8e9297]'}`}
                              >
                                <span className={`font-semibold ${isMine ? 'text-[#a29bfe]' : 'text-[#a29bfe]'}`}>
                                  @{replyToLabel(parentMsg || {})}{' '}
                                </span>
                                <span className="line-clamp-2">{replyPreview}</span>
                              </div>
                            )}
                            {isEditing ? (
                              <OrgMessageInlineEditor
                                value={editDraft}
                                onChange={setEditDraft}
                                onSave={() => submitEdit(mid)}
                                onCancel={cancelEdit}
                                isDarkMode={isDarkMode}
                                saving={savingEdit}
                                escapeHint={t('orgPanel.editEscape')}
                                enterHint={t('orgPanel.editEnter')}
                                cancelLabel={t('orgPanel.editCancelShort')}
                                saveLabel={t('orgPanel.editSaveShort')}
                              />
                            ) : (
                              <ChatMessageAttachmentBody
                                message={message}
                                mentionVariant="org"
                                mentionLabels={mentionLabelsForChat}
                              />
                            )}
                          </div>
                        </div>
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </>
              <div ref={messagesEndRef} className="h-px w-full shrink-0" aria-hidden />
              </div>
              </div>
              )}

          </div>

          {showJumpToLatest &&
            sortedWorkspaceMessages.length > 0 &&
            workspaceTab === 'chat' &&
            !isVoiceChannel &&
            !loadingMessages && (
            <button
              type="button"
              title={t('orgPanel.scrollToLatest')}
              aria-label={t('orgPanel.scrollToLatest')}
              onClick={() => scrollChatToLatest('smooth')}
              className={`pointer-events-auto absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
                isDarkMode
                  ? 'border border-white/10 bg-[#171B24] text-[#A1A8B3] hover:bg-[#1D2330] hover:text-[#F3F4F6]'
                  : 'border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ChevronsDown className="h-5 w-5" strokeWidth={2.25} />
            </button>
          )}

          {isVoiceChannel && (
            <button
              type="button"
              title="Mở chat kênh voice"
              aria-label="Mở chat kênh voice"
              onClick={() => onOpenVoiceChatSidebar?.()}
              className={`pointer-events-auto absolute bottom-4 right-4 z-20 inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold shadow-lg transition hover:scale-[1.02] active:scale-[0.98] ${
                voiceChatSidebarOpen
                  ? isDarkMode
                    ? 'border-[#5865F2]/40 bg-[#5865F2]/20 text-[#cdd2ff]'
                    : 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : isDarkMode
                    ? 'border-white/10 bg-[#141821] text-white hover:bg-[#1a2230]'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          )}

          </div>

          {workspaceTab === 'chat' && !isVoiceChannel && (
            <div className={workspace.composerBar}>
              {channelReadOnly ? (
                <p
                  className={`mb-2 rounded-lg border px-3 py-2 text-xs ${
                    isDarkMode
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-100/90'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  {t('orgPanel.composerReadOnly')}
                </p>
              ) : null}
              <ChatUploadProgressBar
                percent={channelUploadProgress}
                label={t('orgPanel.uploadChannel')}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => handleFileSelected(event, 'file')}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleFileSelected(event, 'image')}
              />
              <UnifiedChatComposer
                richToolbar
                flatInner
                showSendButton={false}
                mentionItems={normalizedContacts.slice(0, 30).map((contact) => ({
                  value: contact.id,
                  label: contact.name,
                  avatar: contact.avatar,
                }))}
                wrapperClassName={workspace.composerWrap}
                topSlot={
                  replyingToMessage ? (
                    <div
                      className={`mb-2 flex items-center justify-between gap-2 rounded-t-xl border px-3 py-2 text-sm ${
                        isDarkMode
                          ? 'border-slate-700/80 bg-[#1a1d21]'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <span className={isDarkMode ? 'text-gray-500' : 'text-slate-500'}>
                          {t('orgPanel.replying')}
                        </span>
                        <span
                          className={`font-semibold ${isDarkMode ? 'text-[#a29bfe]' : 'text-cyan-700'}`}
                        >
                          {replyToLabel(replyingToMessage)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onClearReply?.()}
                        className={`rounded-full p-1.5 transition ${
                          isDarkMode
                            ? 'text-gray-400 hover:bg-white/10 hover:text-white'
                            : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                        }`}
                        aria-label={t('orgPanel.cancelReplyAria')}
                      >
                        ✕
                      </button>
                    </div>
                  ) : null
                }
                value={messageInput}
                onChange={onChangeMessageInput}
                onSend={onSendMessage}
                placeholder={
                  channelReadOnly
                    ? t('orgPanel.composerReadOnlyHint')
                    : selectedChannelId
                      ? t('orgPanel.composerHint', {
                          ch: chSlug || t('organizations.channelNameFallback'),
                        })
                      : t('orgPanel.composerPlaceholder')
                }
                disabled={!selectedChannelId || sendingMessage || channelReadOnly}
                sendDisabled={!messageInput.trim() || channelReadOnly}
                plusItems={
                  canWriteInChannel
                    ? [
                        {
                          key: 'upload-file',
                          icon: '📁',
                          label: t('orgPanel.menuUploadFile'),
                          onClick: () => fileInputRef.current?.click(),
                        },
                        {
                          key: 'upload-image',
                          icon: '🖼️',
                          label: t('orgPanel.menuUploadImage'),
                          onClick: () => imageInputRef.current?.click(),
                        },
                        {
                          key: 'topic',
                          icon: '🧵',
                          label: t('orgPanel.menuTopic'),
                          onClick: () => onSendChatOption?.({ kind: 'topic' }),
                        },
                        {
                          key: 'poll',
                          icon: '🗳️',
                          label: t('orgPanel.menuPoll'),
                          onClick: handleCreatePoll,
                        },
                        {
                          key: 'contact',
                          icon: '👤',
                          label: t('orgPanel.menuContact'),
                          onClick: handleCreateContactCard,
                        },
                      ]
                    : []
                }
                actionItems={[
                  {
                    key: 'emoji',
                    title: 'Emoji',
                    content: '🙂',
                    className: 'w-8 text-lg',
                    onClick: () => {
                      setEmojiPickerTab('emoji');
                      setShowEmojiPicker((prev) => !prev);
                    },
                  },
                ]}
              />

            </div>
            )}
          </div>
        </div>
      </div>

      {workspaceTab === 'chat' && showEmojiPicker && (
        <>
          <button
            type="button"
            aria-label={t('orgPanel.closeEmoji')}
            onClick={() => setShowEmojiPicker(false)}
            className={`${shellNavRailBackdrop} z-40 cursor-default bg-black/30`}
          />
          <div className="fixed bottom-24 right-8 z-50 h-[420px] w-[520px] overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
              {[
                { id: 'gif', label: t('orgPanel.gifTab') },
                { id: 'sticker', label: t('orgPanel.stickerTab') },
                { id: 'emoji', label: t('orgPanel.emojiTab') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEmojiPickerTab(tab.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    emojiPickerTab === tab.id
                      ? 'bg-slate-700 text-white'
                      : 'text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="border-b border-slate-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <input
                  value={emojiSearch}
                  onChange={(event) => setEmojiSearch(event.target.value)}
                  placeholder={t('orgPanel.emojiSearchPh')}
                  className="h-11 flex-1 rounded-xl border border-blue-500/70 bg-[#0d1525] px-3 text-sm text-white outline-none placeholder:text-gray-400"
                />
                <button
                  type="button"
                  onClick={() => onSendChatOption?.({ kind: 'add-emoji-beta' })}
                  className="h-11 rounded-xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-600"
                >
                  {t('orgPanel.addEmojiBtn')}
                </button>
              </div>
            </div>
            <div className="h-[calc(100%-126px)] overflow-y-auto p-3 scrollbar-overlay">
              {emojiPickerTab !== 'emoji' ? (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  {t('orgPanel.emojiBetaMsg')}
                </div>
              ) : (
                <div className="grid grid-cols-9 gap-2">
                  {filteredComposerEmojis.map((emoji, idx) => (
                    <button
                      key={`${emoji}-${idx}`}
                      type="button"
                      onClick={() => appendEmoji(emoji)}
                      className="h-11 rounded-lg bg-[#111a2c] text-2xl transition hover:bg-slate-700/80"
                    >
                      {emoji}
                    </button>
                  ))}
                  {filteredComposerEmojis.length === 0 && (
                    <div className="col-span-9 rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-gray-400">
                      {t('orgPanel.emojiNoMatch')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <ChannelMessageMoreMenu
        open={moreMenu.open}
        anchorRect={moreMenu.anchorRect}
        onClose={() => setMoreMenu({ open: false, anchorRect: null, message: null })}
        isMine={
          moreMenu.message
            ? String(moreMenu.message?.senderId?._id || moreMenu.message?.senderId || '') ===
              String(currentUserId || '')
            : false
        }
        canCopy={canShowCopyTextInMenu(moreMenu.message)}
        onCopyText={() => {
          const t = plainTextForMessage(moreMenu.message);
          if (t) navigator.clipboard.writeText(t);
        }}
        onReply={() => moreMenu.message && onReplyToMessage?.(moreMenu.message)}
        onForward={() => moreMenu.message && onForwardMessage?.(moreMenu.message)}
        onEdit={
          moreMenu.message && canEditOrgMessage(moreMenu.message)
            ? () => beginEditMessage(moreMenu.message)
            : undefined
        }
        onDelete={() => {
          const m = moreMenu.message;
          if (m) onDeleteMessage?.(m._id || m.id);
        }}
        onCreateTask={() => {
          const m = moreMenu.message;
          if (!m) return;
          const content = plainTextForMessage(m);
          setCreateTaskMentions(parseMessageMentions(content, normalizedContacts));
          setCreateTaskSourceMessage(m);
          setCreateTaskModalOpen(true);
        }}
        createTaskDisabled={!menuCreateTaskCheck.ok}
        createTaskHoverTitle={
          menuCreateTaskCheck.ok ? AI_TASK_TOOLTIP_SHORT : menuCreateTaskCheck.reason
        }
      />

      <CreateTaskFromAiModal
        isOpen={createTaskModalOpen}
        onClose={() => {
          setCreateTaskModalOpen(false);
          setCreateTaskSourceMessage(null);
          setCreateTaskMentions([]);
        }}
        messageId={createTaskSourceMessage?._id || createTaskSourceMessage?.id}
        organizationId={orgIdForTask ? String(orgIdForTask) : null}
        workspaceSlug={workspaceSlugForTask}
        currentUserId={currentUserId}
        mentions={createTaskMentions}
        channelId={selectedChannelId ? String(selectedChannelId) : null}
        teamId={selectedTeamId ? String(selectedTeamId) : null}
        messagePreview={
          createTaskSourceMessage ? plainTextForMessage(createTaskSourceMessage).slice(0, 500) : ''
        }
        onConfirmed={() => {
          toast.success(t('orgPanel.taskFromAiOk'));
          onWorkspaceTasksRefresh?.();
          if (selectedTaskBoardId) loadTaskBoardDetail(selectedTaskBoardId);
        }}
      />

      <CreateTaskBoardModal
        isOpen={taskBoardCreateOpen}
        onClose={() => {
          if (creatingTaskBoard) return;
          setTaskBoardCreateOpen(false);
          setTaskBoardTeam(null);
          onCreateTaskBoardFromTeamMenu?.(null);
        }}
        defaultTeamName={taskBoardTeam?.name || ''}
        defaultScopeLabel={
          taskBoardTeam?.scopeType && taskBoardTeam?.name
            ? `${taskBoardTeam.scopeType}: ${taskBoardTeam.name}`
            : taskBoardTeam?.name || ''
        }
        creating={creatingTaskBoard}
        onSubmit={handleCreateTaskBoard}
      />

      <Modal
        isOpen={orgVoiceSettingsOpen}
        onClose={() => setOrgVoiceSettingsOpen(false)}
        title={t('voiceRoom.voiceSettingsTitle')}
        size="md"
      >
        <p className={`mb-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          {t('voiceRoom.voiceSettingsDesc')}
        </p>
        <VoiceAudioSettingsPanel
          t={t}
          isDarkMode={isDarkMode}
          micId={orgMicId}
          speakerId={orgSpeakerId}
          micVolume={orgMicVolume}
          speakerVolume={orgSpeakerVolume}
          onMicIdChange={setOrgMicId}
          onSpeakerIdChange={setOrgSpeakerId}
          onMicVolumeChange={setOrgMicVolume}
          onSpeakerVolumeChange={setOrgSpeakerVolume}
          active={orgVoiceSettingsOpen}
          voiceSessionActive={voiceConnConnected}
        />
      </Modal>

      <Modal
        isOpen={taskCreateOpen}
        onClose={() => setTaskCreateOpen(false)}
        title="Tạo task mới"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-semibold text-white">Tên task</div>
            <input
              value={taskForm.title}
              maxLength={180}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Nhập tên task"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
            />
          </div>
          <div>
            <div className="mb-1 text-sm font-semibold text-white">Mô tả</div>
            <textarea
              value={taskForm.description}
              rows={3}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Nội dung công việc"
              className="w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-white">Hạn xử lý</span>
              <input
                type="date"
                value={taskForm.dueDate}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-white">Ưu tiên</span>
              <select
                value={taskForm.priority}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, priority: event.target.value }))}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-white">Phòng ban</span>
              <select
                value={taskForm.departmentId}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, departmentId: event.target.value }))}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="">General</option>
                {departments.map((department) => (
                  <option key={department._id} value={String(department._id)}>
                    {displayDepartmentName(department.name, locale)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-white">Gán cho</span>
              <select
                value={taskForm.assigneeId}
                onChange={(event) => setTaskForm((prev) => ({ ...prev, assigneeId: event.target.value }))}
                className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="">Chưa gán</option>
                {assignableContactOptions.map((contact) => (
                  <option key={contact.id} value={String(contact.id)}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTaskCreateOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={submitWorkspaceTask}
              disabled={!taskForm.title.trim() || creatingTask}
              className="rounded-xl bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {creatingTask ? 'Đang tạo...' : 'Tạo task'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        title={t('orgPanel.pollModalTitle')}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-semibold text-white">{t('orgPanel.pollQuestion')}</div>
            <input
              value={pollQuestion}
              maxLength={300}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder={t('orgPanel.pollQuestionPh')}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
            />
            <div className="mt-1 text-right text-xs text-gray-400">{pollQuestion.length} / 300</div>
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold text-white">{t('orgPanel.pollAnswers')}</div>
            <div className="space-y-2">
              {pollOptions.map((option, index) => (
                <div key={`poll-option-${index}`} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(event) => updatePollOption(index, event.target.value)}
                    placeholder={t('orgPanel.pollAnswerPh')}
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => removePollOption(index)}
                    disabled={pollOptions.length <= 2}
                    className="rounded-lg border border-white/15 px-2 py-1 text-sm text-white transition hover:bg-white/10 disabled:opacity-40"
                  >
                    🗑
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addPollOption}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {t('orgPanel.pollAddAnswer')}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold text-white">{t('orgPanel.pollDuration')}</div>
            <select
              value={pollDuration}
              onChange={(event) => setPollDuration(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="1h">{t('orgPanel.dur1h')}</option>
              <option value="6h">{t('orgPanel.dur6h')}</option>
              <option value="24h">{t('orgPanel.dur24h')}</option>
              <option value="3d">{t('orgPanel.dur3d')}</option>
              <option value="7d">{t('orgPanel.dur7d')}</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={allowMultiAnswer}
              onChange={(event) => setAllowMultiAnswer(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            {t('orgPanel.pollMultiAnswer')}
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPollModalOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitPoll}
              disabled={!pollQuestion.trim() || pollOptions.map((item) => item.trim()).filter(Boolean).length < 2}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t('orgPanel.pollPost')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
        title={t('orgPanel.contactModalTitle')}
        size="lg"
      >
        <div className="space-y-3">
          {/* Toggle between list and manual entry */}
          <div className="flex gap-2 border-b border-white/10 pb-3">
            <button
              type="button"
              onClick={() => {
                setUseManualContactEntry(false);
                setSelectedContactId('');
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                !useManualContactEntry
                  ? 'bg-blue-600 text-white'
                  : 'border border-white/15 text-gray-300 hover:bg-white/10'
              }`}
            >
              Chọn từ danh sách
            </button>
            <button
              type="button"
              onClick={() => {
                setUseManualContactEntry(true);
                setContactSearch('');
                setContactCategory('all');
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                useManualContactEntry
                  ? 'bg-blue-600 text-white'
                  : 'border border-white/15 text-gray-300 hover:bg-white/10'
              }`}
            >
              Nhập thủ công
            </button>
          </div>

          {!useManualContactEntry ? (
            <>
              <input
                value={contactSearch}
                onChange={(event) => setContactSearch(event.target.value)}
                placeholder={t('orgPanel.contactSearchPh')}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
              />

              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: t('orgPanel.catAll') },
                  { key: 'friend', label: t('orgPanel.catFriend') },
                  { key: 'work', label: t('orgPanel.catWork') },
                  { key: 'family', label: t('orgPanel.catFamily') },
                ].map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => setContactCategory(category.key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      contactCategory === category.key
                        ? 'bg-blue-500 text-white'
                        : 'border border-white/15 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-2">
                {loadingChatContacts && (
                  <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300">{t('orgPanel.loadingContacts')}</div>
                )}
                {!loadingChatContacts && filteredContacts.length === 0 && (
                  <div className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-gray-400">
                    {t('orgPanel.contactNoMatch')}
                  </div>
                )}
                {!loadingChatContacts &&
                  filteredContacts.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/5"
                    >
                      <input
                        type="radio"
                        name="contact-card"
                        checked={selectedContactId === contact.id}
                        onChange={() => setSelectedContactId(contact.id)}
                        className="h-4 w-4"
                      />
                      <UserAvatar name={contact.name || 'U'} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{contact.name}</div>
                        <div className="truncate text-xs text-gray-400">{contact.phone || contact.email || '-'}</div>
                      </div>
                    </label>
                  ))}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Tên *</label>
                <input
                  type="text"
                  value={manualContactFullName}
                  onChange={(e) => setManualContactFullName(e.target.value)}
                  placeholder="Ví dụ: danh cong do"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  value={manualContactPhone}
                  onChange={(e) => setManualContactPhone(e.target.value)}
                  placeholder="Ví dụ: 0123456789 hoặc -"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">Email</label>
                <input
                  type="text"
                  value={manualContactEmail}
                  onChange={(e) => setManualContactEmail(e.target.value)}
                  placeholder="Ví dụ: user@example.com hoặc -"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsContactModalOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitContact}
              disabled={useManualContactEntry ? !manualContactFullName.trim() : !selectedContactId}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {t('orgPanel.menuContact')}
            </button>
          </div>
        </div>
      </Modal>

    </>
  );
};

export default OrganizationMainPanel;
