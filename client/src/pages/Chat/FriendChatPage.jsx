import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import toast from 'react-hot-toast';
import { Archive, Ban, Bell, BellOff, Calendar, ChevronsDown, Phone, Pin, Search, Video } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import UnifiedChatComposer from '../../components/Chat/UnifiedChatComposer';
import {
  ChatMessageAttachmentBody,
  downloadToDisk,
  guessNameFromUrl,
} from '../../components/Chat/ChatFileAttachment';
import ChatMediaViewer from '../../components/Chat/ChatMediaViewer';
import FriendProfileModal from '../../components/Chat/FriendProfileModal';
import ChannelMessageToolbar from '../../components/Organization/ChannelMessageToolbar';
import ChannelMessageMoreMenu from '../../components/Organization/ChannelMessageMoreMenu';
import ForwardToFriendModal from '../../components/Organization/ForwardToFriendModal';
import CreateTaskFromAiModal from '../../components/Chat/CreateTaskFromAiModal';
import FriendChatRightPanel from '../../components/Chat/FriendChatRightPanel';
import UserAvatar from '../../components/Shared/UserAvatar';
import userService from '../../services/userService';
import { buildFriendChatAttachments, findViewerIndex } from '../../utils/friendChatMedia';
import {
  buildDmSnippetMapFromMessages,
  formatRailTime,
  mergeDmSnippetMap,
  sortFriendsForDmRail,
} from '../../utils/dmConversationList';
import { copyImageToClipboard } from '../../utils/copyMediaToClipboard';
import { formatMessagePreview } from '../../features/search/formatMessagePreview';
import { useQueryClient } from '@tanstack/react-query';
import { useFriendsList, useOrganizationsMy } from '../../hooks/queries';
import { queryKeys } from '../../lib/queryKeys';
import { parseMessageListPage } from '../../lib/parseMessageListPage';
import { STALE_TIME_FRIENDS_MS } from '../../lib/queryClient';
import { useWorkspace } from '../../context/WorkspaceContext';
import { getAiTaskEligibility, AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import Modal from '../../components/Shared/Modal';
import Toast from '../../components/Shared/Toast';
import friendService from '../../services/friendService';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import ChatUploadProgressBar from '../../components/Chat/ChatUploadProgressBar';
import ChatUploadPreviewModal from '../../components/Chat/ChatUploadPreviewModal';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { useSocket } from '../../context/SocketContext';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import friendCallService from '../../services/friendCallService';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import { entShell } from '../../theme/enterpriseWorkspace';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import {
  ConversationSearchPanel,
  DM_SCOPE,
  messageMatchesDmScope,
  PageSearchBar,
} from '../../features/search';
import dmMessageService from '../../services/dmMessageService';
import { isOutgoing } from '../../utils/dmChatHelpers';
import { useFriendDmRealtime } from '../../hooks/useFriendDmRealtime';

function messageDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DM_MUTE_STORAGE_KEY = 'voicehub:dm-muted';
const DM_PIN_STORAGE_KEY = 'voicehub:dm-pinned';
const DM_PINNED_MESSAGES_STORAGE_KEY = 'voicehub:dm-pinned-messages';
const DM_ARCHIVE_STORAGE_KEY = 'voicehub:dm-archived';
const DM_DRAFT_PREFIX = 'voicehub:dm-draft:';
const DM_PAGE_SIZE = dmMessageService.pageSize;

function loadIdList(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveIdList(storageKey, ids) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...new Set(ids.map(String).filter(Boolean))]));
  } catch {
    /* ignore */
  }
}

function loadIdMap(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [String(k), Array.isArray(v) ? v.map(String).filter(Boolean) : []])
    );
  } catch {
    return {};
  }
}

function saveIdMap(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value || {}));
  } catch {
    /* ignore */
  }
}

function FriendChatPage({ landingDemo = false } = {}) {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { setActiveWorkspace } = useWorkspace();
  const [searchParams] = useSearchParams();
  const [friends, setFriends] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteMsgConfirmId, setDeleteMsgConfirmId] = useState(null);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockingFriend, setBlockingFriend] = useState(false);
  const [unblockConfirmOpen, setUnblockConfirmOpen] = useState(false);
  const [unblockingFriend, setUnblockingFriend] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  /** Snippet tin DM cuối theo bạn: { at, preview, isMine } */
  const [lastDmByFriendId, setLastDmByFriendId] = useState({});
  /** Đang gọi API để chọn hội thoại mặc định (tránh nháy "chọn bạn") */
  const [resolvingDefaultChat, setResolvingDefaultChat] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  /** Lọc danh sách bạn trong rail (PageSearchBar) */
  const [friendRailSearch, setFriendRailSearch] = useState('');
  /** Tìm trong tin DM + bộ lọc loại tin (SearchFilterChips) */
  const [dmMessageSearch, setDmMessageSearch] = useState('');
  const [dmScope, setDmScope] = useState(DM_SCOPE.ALL);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  /** null = không upload; 0–100 khi đang gửi file/ảnh */
  const [uploadProgress, setUploadProgress] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null, message: null });
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [forwarding, setForwarding] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskSourceMessage, setCreateTaskSourceMessage] = useState(null);
  const [defaultOrgIdForTask, setDefaultOrgIdForTask] = useState(null);
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});
  const [inlineToast, setInlineToast] = useState(null);
  const [mutedFriendIds, setMutedFriendIds] = useState(() => loadIdList(DM_MUTE_STORAGE_KEY));
  const [pinnedFriendIds, setPinnedFriendIds] = useState(() => loadIdList(DM_PIN_STORAGE_KEY));
  const [pinnedMessageIdsByFriend, setPinnedMessageIdsByFriend] = useState(() =>
    loadIdMap(DM_PINNED_MESSAGES_STORAGE_KEY)
  );
  const [archivedFriendIds, setArchivedFriendIds] = useState(() => loadIdList(DM_ARCHIVE_STORAGE_KEY));
  const [unreadByPeer, setUnreadByPeer] = useState({});
  const [peerTyping, setPeerTyping] = useState(false);
  const [nextOlderPageToken, setNextOlderPageToken] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pendingSendsRef = useRef(new Map());
  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showJumpToDmLatest, setShowJumpToDmLatest] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [failedUpload, setFailedUpload] = useState(null);
  const [dmServerSearchResults, setDmServerSearchResults] = useState(null);
  const [dmServerSearching, setDmServerSearching] = useState(false);
  const [showArchivedRail, setShowArchivedRail] = useState(false);
  const [pinnedMessagesModalOpen, setPinnedMessagesModalOpen] = useState(false);
  const [blockedByPeer, setBlockedByPeer] = useState(false);
  const { user } = useAuth();
  const { openFriendCall } = useFriendCallSession();
  const { emit, on, off, onlineUsers, connected: socketConnected } = useSocket();
  /** Cuộc gọi đi: chờ accept / reject / timeout */
  const [outboundCall, setOutboundCall] = useState(null);
  const outboundCallRef = useRef(null);
  const routedDmUserId = String(
    location.state?.openDmUserId || searchParams.get('openDmUserId') || ''
  );
  const routedComposeText = String(
    location.state?.composeText || searchParams.get('composeText') || ''
  );

  const formatDateDividerLabel = useCallback(
    (iso) => {
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
      if (t0 === today0) return t('friendChat.dateToday', { date: dd });
      if (t0 === yesterday0) return t('friendChat.dateYesterday', { date: dd });
      return d.toLocaleDateString(loc, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    },
    [locale, t]
  );

  // Trong hệ thống hiện tại, ID đăng nhập lưu ở field userId (Auth service),
  // còn _id là của profile. Tin nhắn lưu senderId theo userId.
  const currentUserId = user?.userId || user?._id || user?.id;
  const currentUserName = getUserDisplayName(user) || t('common.you');
  const currentUserAvatar = user?.avatar || null;
  const [friendProfiles, setFriendProfiles] = useState({});
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState({ open: false, index: 0 });
  const currentFriendKey = selectedFriendId ? String(selectedFriendId) : '';
  const isCurrentFriendMuted = currentFriendKey ? mutedFriendIds.includes(currentFriendKey) : false;
  const isCurrentFriendPinned = currentFriendKey ? pinnedFriendIds.includes(currentFriendKey) : false;
  const pinnedMessageIdsCurrentFriend = currentFriendKey
    ? pinnedMessageIdsByFriend[currentFriendKey] || []
    : [];

  const showToast = (message, type = 'success') => {
    setInlineToast({ message, type });
    setTimeout(() => setInlineToast(null), 3000);
  };

  const clearOutboundCall = useCallback(() => {
    setOutboundCall(null);
    outboundCallRef.current = null;
  }, []);

  const toggleMuteCurrentFriend = useCallback(() => {
    if (!currentFriendKey) return;
    const next = isCurrentFriendMuted
      ? mutedFriendIds.filter((id) => id !== currentFriendKey)
      : [...mutedFriendIds, currentFriendKey];
    saveIdList(DM_MUTE_STORAGE_KEY, next);
    setMutedFriendIds(next);
    toast.success(
      isCurrentFriendMuted ? t('friendChat.muteOn') : t('friendChat.muteOff')
    );
  }, [currentFriendKey, isCurrentFriendMuted, mutedFriendIds]);

  const togglePinCurrentFriend = useCallback(() => {
    if (!currentFriendKey) return;
    const next = isCurrentFriendPinned
      ? pinnedFriendIds.filter((id) => id !== currentFriendKey)
      : [...pinnedFriendIds, currentFriendKey];
    saveIdList(DM_PIN_STORAGE_KEY, next);
    setPinnedFriendIds(next);
    toast.success(isCurrentFriendPinned ? t('friendChat.pinOff') : t('friendChat.pinOn'));
  }, [currentFriendKey, isCurrentFriendPinned, pinnedFriendIds]);

  const togglePinMessage = useCallback(
    (msg) => {
      if (!currentFriendKey || !msg) return;
      const messageId = msg._id || msg.id;
      if (messageId == null) return;
      const idKey = String(messageId);
      const prevIds = Array.isArray(pinnedMessageIdsByFriend[currentFriendKey])
        ? pinnedMessageIdsByFriend[currentFriendKey]
        : [];
      const hasPinned = prevIds.includes(idKey);
      const nextIds = hasPinned ? prevIds.filter((id) => id !== idKey) : [...prevIds, idKey];
      const nextMap = { ...pinnedMessageIdsByFriend, [currentFriendKey]: nextIds };
      setPinnedMessageIdsByFriend(nextMap);
      saveIdMap(DM_PINNED_MESSAGES_STORAGE_KEY, nextMap);
      toast.success(hasPinned ? 'Đã bỏ ghim tin nhắn' : 'Đã ghim tin nhắn');
    },
    [currentFriendKey, pinnedMessageIdsByFriend]
  );

  const openMutualOrganization = useCallback(
    (org) => {
      if (!org?._id) return;
      setActiveWorkspace({
        organizationId: String(org._id),
        name: org.name,
        slug: org.slug,
      });
      navigate('/workspaces', { state: { selectOrganizationId: String(org._id) } });
    },
    [navigate, setActiveWorkspace]
  );

  const cancelOutboundCall = useCallback(async () => {
    const id = outboundCallRef.current;
    if (!id) return;
    outboundCallRef.current = null;
    setOutboundCall(null);
    try {
      await friendCallService.cancel(id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    outboundCallRef.current = outboundCall?.callId || null;
  }, [outboundCall?.callId]);

  useEffect(() => {
    return () => {
      const id = outboundCallRef.current;
      if (!id || landingDemo) return;
      friendCallService.cancel(id).catch(() => {});
      outboundCallRef.current = null;
    };
  }, [landingDemo]);

  const startFriendCall = useCallback(
    async (media) => {
      if (landingDemo) {
        toast(t('friendChat.callVideoSoon'), { icon: '📞' });
        return;
      }
      if (!selectedFriendId) return;
      if (outboundCall?.callId) {
        toast.error(t('friendChat.callConflict'));
        return;
      }
      const calleeId = String(selectedFriendId);
      try {
        const res = await friendCallService.initiate({ calleeId, media });
        const data = res?.data?.data ?? res?.data;
        const callId = data?.callId;
        const roomId = data?.roomId;
        if (!callId || !roomId) {
          toast.error(t('friendChat.callStartFail'));
          return;
        }
        setOutboundCall({ callId, roomId, media });
        toast.success(t('friendChat.callRinging'));
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.message || err.message;
        if (status === 409) toast.error(t('friendChat.callConflict'));
        else if (status === 403) toast.error(t('friendChat.callDenied'));
        else toast.error(msg || t('friendChat.callStartFail'));
      }
    },
    [landingDemo, selectedFriendId, outboundCall?.callId, t]
  );

  const queryClient = useQueryClient();
  const { data: myOrganizations = [] } = useOrganizationsMy({ enabled: !landingDemo });
  const acceptedFriendsQuery = useFriendsList({ status: 'accepted', enabled: !landingDemo });
  const blockedFriendsQuery = useFriendsList({ status: 'blocked', enabled: !landingDemo });

  const refreshFriendsCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
  }, [queryClient]);

  useEffect(() => {
    if (landingDemo || !myOrganizations.length) return;
    const first = myOrganizations[0];
    const oid = first?._id || first?.id;
    if (oid) setDefaultOrgIdForTask(String(oid));
  }, [landingDemo, myOrganizations]);

  const mergedFriendsFromQuery = useMemo(() => {
    const tag = (rows, relationshipStatus) =>
      (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, relationshipStatus }));
    return [
      ...tag(acceptedFriendsQuery.data, 'accepted'),
      ...tag(blockedFriendsQuery.data, 'blocked'),
    ];
  }, [acceptedFriendsQuery.data, blockedFriendsQuery.data]);

  useEffect(() => {
    if (landingDemo) {
      const fid = 'demo-friend-1';
      setFriends([
        {
          friendId: {
            _id: fid,
            userId: fid,
            displayName: 'Lan Anh',
            username: 'lananh',
            status: 'online',
            avatar: '👩',
          },
        },
      ]);
      setFriendsLoading(false);
      setSelectedFriendId(fid);
      setMessages([
        {
          _id: 'dm1',
          senderId: fid,
          receiverId: currentUserId,
          content: t('friendChat.demoMsg1'),
          createdAt: new Date().toISOString(),
        },
        {
          _id: 'dm2',
          senderId: currentUserId,
          receiverId: fid,
          content: t('friendChat.demoMsg2'),
          createdAt: new Date().toISOString(),
        },
      ]);
      return;
    }
    if (acceptedFriendsQuery.isError || blockedFriendsQuery.isError) {
      const err = acceptedFriendsQuery.error || blockedFriendsQuery.error;
      toast.error(
        err?.response?.data?.message || err?.message || t('friendChat.loadFriendsFail')
      );
      setFriends([]);
      setFriendsLoading(false);
      return;
    }
    setFriends(mergedFriendsFromQuery);
    setFriendsLoading(acceptedFriendsQuery.isLoading || blockedFriendsQuery.isLoading);
  }, [
    landingDemo,
    currentUserId,
    t,
    mergedFriendsFromQuery,
    acceptedFriendsQuery.isLoading,
    blockedFriendsQuery.isLoading,
    acceptedFriendsQuery.isError,
    blockedFriendsQuery.isError,
    acceptedFriendsQuery.error,
    blockedFriendsQuery.error,
  ]);

  // Map friends + sắp xếp theo tin nhắn gần nhất; presence realtime khớp Dashboard (onlineUsers từ socket)
  const viewFriends = useMemo(() => {
    const rows = friends.map((f, index) => {
      const u = f.friendId || f;
      const uname = typeof u?.username === 'string' ? u.username.trim() : '';
      const title =
        typeof u?.title === 'string'
          ? u.title.trim()
          : typeof u?.headline === 'string'
            ? u.headline.trim()
            : '';
      const subtitle = title || t('friendChat.dmSubtitle');
      const id = u?._id || u?.userId || u?.id || f.id;
      const isBlockedByMe = String(f.relationshipStatus || '') === 'blocked';
      /** Luôn unique để tránh cảnh báo key khi thiếu user (id trùng undefined). */
      const listKey =
        id != null && id !== ''
          ? String(id)
          : f._id != null
            ? `friendship-${String(f._id)}`
            : `friend-row-${index}`;
      const rawFriendId = f.friendId;
      const presenceKeys = [
        id,
        u?.userId,
        u?._id,
        u?.id,
        typeof rawFriendId === 'string' || typeof rawFriendId === 'number' ? rawFriendId : null,
        rawFriendId && typeof rawFriendId === 'object' ? rawFriendId._id || rawFriendId.userId : null,
      ]
        .filter((x) => x != null && typeof x !== 'object')
        .map(String);
      const uniqueKeys = [...new Set(presenceKeys)];
      return {
        id,
        listKey,
        name: u?.displayName || u?.username || 'Người dùng',
        avatar: u?.avatar || null,
        status: String(u?.status || 'offline').toLowerCase(),
        subtitle,
        isBlockedByMe,
        _presenceKeys: uniqueKeys,
      };
    });
    const sorted = sortFriendsForDmRail(rows, lastDmByFriendId, pinnedFriendIds);
    const onlineSet = new Set((onlineUsers || []).map(String));
    return sorted.map((row) => {
      const { _presenceKeys, ...rest } = row;
      const snippet = lastDmByFriendId[String(rest.id)];
      const inLiveList = (_presenceKeys || [String(rest.id)]).some((k) => onlineSet.has(String(k)));
      const withSnippet = {
        ...rest,
        lastAt: snippet?.at ?? null,
        lastPreview: snippet?.preview ?? '',
        lastIsMine: Boolean(snippet?.isMine),
      };
      /** Khi socket đã nối: chỉ tin danh sách online từ server (khớp Dashboard). */
      if (rest.isBlockedByMe) {
        return { ...withSnippet, status: 'offline' };
      }
      if (socketConnected) {
        return { ...withSnippet, status: inLiveList ? 'online' : 'offline' };
      }
      return {
        ...withSnippet,
        status: inLiveList ? 'online' : rest.status,
      };
    });
  }, [friends, lastDmByFriendId, pinnedFriendIds, onlineUsers, socketConnected, t]);

  const viewFriendsEnriched = useMemo(() => {
    return viewFriends.map((f) => {
      const p = friendProfiles[String(f.id)];
      if (!p) return f;
      return {
        ...f,
        name: p.name || f.name,
        avatar: p.avatar ?? f.avatar,
        phone: p.phone ?? f.phone,
        email: p.email ?? f.email,
        username: p.username ?? f.username,
      };
    });
  }, [viewFriends, friendProfiles]);

  const dmServerSearchFiltered = useMemo(() => {
    if (!Array.isArray(dmServerSearchResults)) return null;
    return dmServerSearchResults.filter((m) => messageMatchesDmScope(m, dmScope));
  }, [dmServerSearchResults, dmScope]);

  useEffect(() => {
    if (!conversationSearchOpen || !selectedFriendId) {
      setDmServerSearchResults(null);
      setDmServerSearching(false);
      return undefined;
    }
    const q = dmMessageSearch.trim();
    if (q.length < 2) {
      setDmServerSearchResults(null);
      setDmServerSearching(false);
      return undefined;
    }
    let cancelled = false;
    setDmServerSearching(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await dmMessageService.searchConversation(selectedFriendId, q);
        const data = dmMessageService.unwrap(resp);
        if (!cancelled) setDmServerSearchResults(data?.messages || []);
      } catch {
        if (!cancelled) setDmServerSearchResults([]);
      } finally {
        if (!cancelled) setDmServerSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversationSearchOpen, selectedFriendId, dmMessageSearch]);

  const filteredViewFriends = useMemo(() => {
    const visible = viewFriendsEnriched.filter((f) => {
      const archived = archivedFriendIds.includes(String(f.id));
      return showArchivedRail ? archived : !archived;
    });
    const q = friendRailSearch.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((f) => {
      const previewLine = f.lastPreview
        ? `${f.lastIsMine ? t('friendChat.railYouPrefix') : ''}${f.lastPreview}`
        : '';
      const hay = `${f.name || ''} ${f.subtitle || ''} ${previewLine}`.toLowerCase();
      return hay.includes(q);
    });
  }, [viewFriendsEnriched, friendRailSearch, archivedFriendIds, showArchivedRail, t]);

  const dmScopeOptions = useMemo(
    () => [
      { id: DM_SCOPE.ALL, label: t('friendChat.dmScopeAll'), icon: '📋' },
      { id: DM_SCOPE.TEXT, label: t('friendChat.dmScopeMessages'), icon: '💬' },
      { id: DM_SCOPE.FILE, label: t('friendChat.dmScopeFiles'), icon: '📎' },
      { id: DM_SCOPE.IMAGE, label: t('friendChat.dmScopeImages'), icon: '🖼️' },
      { id: DM_SCOPE.LINK, label: t('friendChat.dmScopeLinks'), icon: '🔗' },
      { id: DM_SCOPE.CALENDAR, label: t('friendChat.dmScopeCalendar'), icon: '📅' },
    ],
    [t]
  );

  /** Lấy snippet tin DM gần nhất với mỗi bạn (từ API /messages). */
  const fetchLastDmActivity = useCallback(async () => {
    if (!currentUserId) return {};
    try {
      const resp = await api.get('/messages', { params: { limit: 500, page: 1 } });
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.messages || [];
      if (!Array.isArray(list)) return {};
      return buildDmSnippetMapFromMessages(list, currentUserId, t);
    } catch {
      return {};
    }
  }, [currentUserId, t]);

  // Khi có danh sách bạn: tự chọn người đã nhắn gần nhất (không ghi đè nếu user đã chọn)
  useEffect(() => {
    if (landingDemo) return;
    if (!currentUserId) return;
    if (friends.length === 0) {
      setSelectedFriendId(null);
      setResolvingDefaultChat(false);
      return;
    }
    let cancelled = false;
    setResolvingDefaultChat(true);
    (async () => {
      try {
        const lastMap = await fetchLastDmActivity();
        if (cancelled) return;
        setLastDmByFriendId((prev) => {
          const next = { ...prev };
          Object.entries(lastMap).forEach(([k, v]) => {
            const key = String(k);
            const existing = next[key];
            if (!existing || (v?.at || 0) >= (existing?.at || 0)) {
              next[key] = v;
            }
          });
          return next;
        });
        setSelectedFriendId((prev) => {
          if (prev) return prev;
          const rows = friends.map((f) => {
            const u = f.friendId || f;
            return {
              id: u?._id || u?.userId || u?.id || f.id,
              name: u?.displayName || u?.username || t('common.user'),
              avatar: u?.avatar || null,
              status: u?.status || 'offline',
            };
          });
          const sorted = sortFriendsForDmRail(rows, lastMap, pinnedFriendIds);
          const withDm = sorted.find((f) => lastMap[String(f.id)]?.at);
          if (withDm) return withDm.id;
          return rows[0]?.id ?? null;
        });
      } finally {
        if (!cancelled) setResolvingDefaultChat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [friends, currentUserId, fetchLastDmActivity, landingDemo, pinnedFriendIds, t]);

  const parseMessagesResponse = useCallback((resp) => {
    const page = parseMessageListPage(resp);
    return {
      arr: page.messages,
      totalPages: page.totalPages ?? 1,
      currentPage: page.currentPage ?? 1,
      nextPageToken: page.nextPageToken,
      hasMore: page.hasMore,
    };
  }, []);

  // Load messages khi chọn bạn (trang mới nhất trước)
  const loadMessages = useCallback(
    async (friendId) => {
      if (!friendId) return;
      setLoadingMessages(true);
      setNextOlderPageToken(null);
      try {
        const draftRaw = localStorage.getItem(`${DM_DRAFT_PREFIX}${friendId}`);
        if (draftRaw != null) setMessage(draftRaw);
        else setMessage('');

        const cacheKey = queryKeys.dm.messages(friendId);
        const parsed = await queryClient.fetchQuery({
          queryKey: cacheKey,
          queryFn: async () => {
            const resp = await dmMessageService.getConversation(friendId, {
              limit: DM_PAGE_SIZE,
            });
            return parseMessagesResponse(resp);
          },
          staleTime: STALE_TIME_FRIENDS_MS,
        });

        const { arr, totalPages, currentPage, nextPageToken, hasMore } = parsed;
        setMessages(arr);
        setNextOlderPageToken(nextPageToken || null);
        setHasMoreOlder(
          Boolean(hasMore || (currentPage != null && totalPages != null && currentPage < totalPages))
        );
        if (arr.length && currentUserId) {
          const sorted = [...arr].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
          );
          const last = sorted[sorted.length - 1];
          setLastDmByFriendId((prev) => mergeDmSnippetMap(prev, last, currentUserId, t));
        }
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || t('friendChat.loadMessagesFail'));
        setMessages([]);
        setHasMoreOlder(false);
      } finally {
        setLoadingMessages(false);
      }
    },
    [currentUserId, parseMessagesResponse, t, queryClient]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!selectedFriendId || loadingOlder || !hasMoreOlder || !nextOlderPageToken) return;
    setLoadingOlder(true);
    try {
      const parsed = await queryClient.fetchQuery({
        queryKey: [...queryKeys.dm.messages(selectedFriendId), 'token', nextOlderPageToken],
        queryFn: async () => {
          const resp = await dmMessageService.getConversation(selectedFriendId, {
            pageToken: nextOlderPageToken,
            limit: DM_PAGE_SIZE,
          });
          return parseMessagesResponse(resp);
        },
        staleTime: STALE_TIME_FRIENDS_MS,
      });
      const { arr, totalPages, currentPage, nextPageToken, hasMore } = parsed;
      setMessages((prev) => {
        const ids = new Set(prev.map((x) => String(x._id || x.id)));
        const older = arr.filter((m) => !ids.has(String(m._id || m.id)));
        return [...older, ...prev];
      });
      setNextOlderPageToken(nextPageToken || null);
      setHasMoreOlder(
        Boolean(hasMore || (currentPage != null && totalPages != null && currentPage < totalPages))
      );
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('friendChat.loadOlderFail'));
    } finally {
      setLoadingOlder(false);
    }
  }, [
    selectedFriendId,
    loadingOlder,
    hasMoreOlder,
    nextOlderPageToken,
    parseMessagesResponse,
    t,
    queryClient,
  ]);

  useEffect(() => {
    if (!routedDmUserId) return;
    const pickFriendId = () => {
      for (const f of friends) {
        const u = f.friendId || f;
        const candidates = [u?._id, u?.userId, u?.id, f?.userId, f?.id].filter(Boolean).map(String);
        if (candidates.includes(routedDmUserId)) {
          return String(u?._id || u?.userId || u?.id || f?.userId || f?.id);
        }
      }
      return null;
    };

    const matched = pickFriendId();
    if (matched) {
      setSelectedFriendId(matched);
      if (routedComposeText) setMessage(routedComposeText);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (!friendsLoading) {
      toast.error(t('friendChat.friendNotInList'));
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [friends, friendsLoading, location.pathname, navigate, routedComposeText, routedDmUserId]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedFriendId) {
      loadMessages(selectedFriendId);
    }
  }, [selectedFriendId, loadMessages, landingDemo]);

  useEffect(() => {
    setDmMessageSearch('');
    setDmScope(DM_SCOPE.ALL);
    setPeerTyping(false);
    setDmServerSearchResults(null);
    setBlockedByPeer(false);
  }, [selectedFriendId]);

  useEffect(() => {
    if (!selectedFriendId || landingDemo) return undefined;
    const key = `${DM_DRAFT_PREFIX}${selectedFriendId}`;
    const timer = setTimeout(() => {
      const trimmed = message.trim();
      try {
        if (trimmed) localStorage.setItem(key, message);
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [message, selectedFriendId, landingDemo]);

  const onDmSendRejected = useCallback(
    (payload) => {
      const code = payload?.code;
      if (code === 'dm_blocked') {
        const blockerId = payload?.blockerId ? String(payload.blockerId) : '';
        if (blockerId && blockerId !== String(currentUserId || '')) {
          setBlockedByPeer(true);
        }
      } else if (code === 'dm_unblocked') {
        setBlockedByPeer(false);
      }
    },
    [currentUserId]
  );

  const { notifyTyping, refreshUnread, armSendTimeout } = useFriendDmRealtime({
    landingDemo,
    on,
    off,
    emit,
    currentUserId,
    selectedFriendId,
    setMessages,
    setLastDmByFriendId,
    setUnreadByPeer,
    setPeerTyping,
    pendingSendsRef,
    t,
    onDmSendRejected,
  });

  const retrySend = useCallback(
    (failedMsg) => {
      const tempId = failedMsg?._id || failedMsg?.id;
      if (!tempId || !selectedFriendId) return;
      const text = String(failedMsg.content || '').trim();
      if (!text) return;

      setMessages((prev) =>
        prev.map((x) =>
          String(x._id || x.id) === String(tempId)
            ? { ...x, _sendStatus: 'pending', _sendError: null }
            : x
        )
      );

      const replyRef = failedMsg.replyToMessageId;
      const validReplyId =
        replyRef && !String(replyRef).startsWith('temp-') ? replyRef : null;

      const payload = {
        receiverId: selectedFriendId,
        content: text,
        messageType: 'text',
      };
      if (validReplyId) payload.replyToMessageId = validReplyId;

      pendingSendsRef.current.set(String(tempId), {
        receiverId: selectedFriendId,
        content: text,
        replyToMessageId: validReplyId,
      });
      armSendTimeout(String(tempId));
      emit('friend:send', payload);
    },
    [selectedFriendId, emit, armSendTimeout]
  );

  const currentFriend = useMemo(() => {
    if (!selectedFriendId) return null;
    return viewFriendsEnriched.find((f) => f.id === selectedFriendId) || null;
  }, [viewFriendsEnriched, selectedFriendId]);
  const isCurrentFriendBlocked = Boolean(currentFriend?.isBlockedByMe);
  const isDmComposerLocked = isCurrentFriendBlocked || blockedByPeer;

  // Gửi tin nhắn qua socket-service (realtime) + optimistic UI
  const handleSend = async () => {
    if (!selectedFriendId || !message.trim() || isDmComposerLocked) return;

    if (landingDemo) {
      const text = message.trim();
      const optimistic = {
        _id: `demo-${Date.now()}`,
        senderId: currentUserId,
        receiverId: selectedFriendId,
        content: text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setMessage('');
      setReplyingToMessage(null);
      return;
    }

    const text = message.trim();
    const tempId = `temp-${Date.now()}`;
    const replyRef = replyingToMessage?._id || replyingToMessage?.id;
    const validReplyId =
      replyRef && !String(replyRef).startsWith('temp-') ? replyRef : null;

    const optimistic = {
      _id: tempId,
      senderId: currentUserId,
      receiverId: selectedFriendId,
      content: text,
      createdAt: new Date().toISOString(),
      _optimistic: true,
      _sendStatus: 'pending',
      ...(validReplyId ? { replyToMessageId: validReplyId } : {}),
    };

    setMessages((prev) => [...prev, optimistic]);
    setMessage('');
    setReplyingToMessage(null);
    const now = Date.now();
    setLastDmByFriendId((prev) => ({
      ...prev,
      [String(selectedFriendId)]: {
        at: now,
        preview: text,
        isMine: true,
      },
    }));
    const payload = {
      receiverId: selectedFriendId,
      content: text,
      messageType: 'text',
    };
    if (validReplyId) payload.replyToMessageId = validReplyId;

    pendingSendsRef.current.set(String(tempId), {
      receiverId: selectedFriendId,
      content: text,
      replyToMessageId: validReplyId,
    });
    armSendTimeout(String(tempId));
    emit('friend:send', payload);
  };

  const openCalendarForFriend = useCallback(
    (opts = {}) => {
      if (!currentFriend?.id) return;
      if (isCurrentFriendBlocked) {
        toast.error('Đã chặn người dùng, không thể đặt lịch.');
        return;
      }
      navigate('/calendar', {
        state: {
          source: 'friend-chat',
          friendId: String(currentFriend.id),
          friendName: currentFriend.name || '',
          prefillType: opts.prefillType || 'reminder',
          prefillTitle:
            opts.prefillTitle ||
            t('friendChat.reminderDefaultTitle', { name: currentFriend.name || '' }),
          prefillAttendees: [currentFriend.name].filter(Boolean),
        },
      });
    },
    [currentFriend, isCurrentFriendBlocked, navigate, t]
  );

  const composerMentionItems = useMemo(
    () =>
      viewFriendsEnriched.slice(0, 40).map((f) => ({
        value: f.id,
        label: f.name || f.username || 'User',
        avatar: f.avatar,
      })),
    [viewFriendsEnriched]
  );

  useEffect(() => {
    if (!selectedFriendId || landingDemo) return undefined;
    const id = String(selectedFriendId);
    let cancelled = false;
    (async () => {
      try {
        const ur = await userService.getProfile(id);
        const raw = ur?.data ?? ur;
        const p = raw?.data ?? raw;
        if (cancelled || !p) return;
        setFriendProfiles((prev) => ({
          ...prev,
          [id]: {
            avatar: p.avatar || prev[id]?.avatar,
            name: p.displayName || p.fullName || p.username || prev[id]?.name,
            phone: p.phone || '',
            email: p.email || '',
            username: p.username || '',
          },
        }));
      } catch {
        /* giữ snapshot từ GET /friends */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFriendId, landingDemo]);

  useEffect(() => {
    setMediaViewer({ open: false, index: 0 });
  }, [selectedFriendId]);

  const friendAttachments = useMemo(
    () =>
      buildFriendChatAttachments(messages, {
        fileFallback: t('friendChat.fileAttachment'),
      }),
    [messages, t]
  );

  const openMediaViewerForMessage = useCallback(
    (messageId) => {
      const idx = findViewerIndex(friendAttachments.viewerItems, messageId);
      setMediaViewer({ open: true, index: idx });
    },
    [friendAttachments.viewerItems]
  );

  const openMediaViewerAtGrid = useCallback(
    (gridIndex) => {
      const item = friendAttachments.mediaItems[gridIndex];
      if (!item) return;
      const idx = findViewerIndex(friendAttachments.viewerItems, item.id);
      setMediaViewer({ open: true, index: idx });
    },
    [friendAttachments.mediaItems, friendAttachments.viewerItems]
  );

  const jumpToMessage = useCallback((messageId) => {
    if (!messageId) return;
    const el = document.querySelector(`[data-dm-message-id="${String(messageId)}"]`);
    if (!el) {
      toast.error(t('friendChat.jumpToMessageFail'));
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-cyan-500/70', 'rounded-md');
    window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-cyan-500/70', 'rounded-md');
    }, 2200);
  }, [t]);

  const requestDeleteMessage = (messageId) => {
    if (!messageId) return;
    setDeleteMsgConfirmId(messageId);
  };

  const handleForwardRequest = (msg) => {
    setMediaViewer({ open: false, index: 0 });
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const handleAttachmentAction = useCallback(
    async (action, payload = {}) => {
      const { messageId, url, name, message } = payload;
      switch (action) {
        case 'open':
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
          break;
        case 'copy': {
          const mt = String(message?.messageType || '').toLowerCase();
          const isImage =
            mt === 'image' ||
            (url && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url.split('?')[0]));
          if (isImage && url) {
            const result = await copyImageToClipboard(url);
            if (result === 'image') toast.success(t('friendChat.mediaCopyOk'));
            else if (result === 'url') toast.success(t('friendChat.mediaCopyLinkOk'));
            else toast.error(t('friendChat.mediaCopyFail'));
          } else if (url) {
            try {
              await navigator.clipboard.writeText(url);
              toast.success(t('friendChat.mediaCopyOk'));
            } catch {
              toast.error(t('friendChat.mediaCopyFail'));
            }
          }
          break;
        }
        case 'share':
          if (message) handleForwardRequest(message);
          else toast.error(t('friendChat.forwardFail'));
          break;
        case 'jumpToMessage':
          setMediaViewer({ open: false, index: 0 });
          jumpToMessage(messageId);
          break;
        case 'saveDevice':
          if (url) {
            await downloadToDisk(url, name || guessNameFromUrl(url) || 'download');
            toast.success(t('friendChat.fileOk'));
          }
          break;
        case 'delete':
          if (message) requestDeleteMessage(messageId);
          else toast.error(t('friendChat.deleteFail'));
          break;
        default:
          break;
      }
    },
    [jumpToMessage, handleForwardRequest, requestDeleteMessage, t]
  );

  useEffect(() => {
    if (landingDemo || !socketConnected || !outboundCall?.callId) return undefined;
    const id = outboundCall.callId;
    const match = (p) => String(p?.callId || '') === id;

    const onAccepted = (p) => {
      if (!match(p)) return;
      clearOutboundCall();
      const room = p?.roomId;
      const media = p?.media === 'audio' ? 'audio' : 'video';
      if (room) {
        openFriendCall({
          roomId: room,
          callId: id,
          media,
          peerLabel: currentFriend?.name || '',
        });
      }
    };
    const onRejected = (p) => {
      if (!match(p)) return;
      clearOutboundCall();
      toast(t('friendChat.callRejected'));
    };
    const onCancelled = (p) => {
      if (!match(p)) return;
      clearOutboundCall();
      toast(t('friendChat.callCancelled'));
    };
    const onTimeout = (p) => {
      if (!match(p)) return;
      clearOutboundCall();
      toast(t('friendChat.callTimeout'));
    };
    const onEnded = (p) => {
      if (!match(p)) return;
      clearOutboundCall();
    };

    on('call:accepted', onAccepted);
    on('call:rejected', onRejected);
    on('call:cancelled', onCancelled);
    on('call:timeout', onTimeout);
    on('call:ended', onEnded);

    return () => {
      off('call:accepted', onAccepted);
      off('call:rejected', onRejected);
      off('call:cancelled', onCancelled);
      off('call:timeout', onTimeout);
      off('call:ended', onEnded);
    };
  }, [
    landingDemo,
    socketConnected,
    outboundCall?.callId,
    on,
    off,
    openFriendCall,
    clearOutboundCall,
    t,
    currentFriend?.name,
  ]);

  const sortedChatMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const pinnedMessagesForCurrentFriend = useMemo(() => {
    if (!pinnedMessageIdsCurrentFriend.length) return [];
    const pinnedSet = new Set(pinnedMessageIdsCurrentFriend.map(String));
    return sortedChatMessages
      .filter((m) => {
        const mid = m?._id || m?.id;
        return mid != null && pinnedSet.has(String(mid));
      })
      .sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [pinnedMessageIdsCurrentFriend, sortedChatMessages]);

  const lastOutgoingForReceipt = useMemo(() => {
    if (!currentUserId) return null;
    for (let i = sortedChatMessages.length - 1; i >= 0; i--) {
      const m = sortedChatMessages[i];
      if (!isOutgoing(m, currentUserId)) continue;
      if (m._optimistic || m._sendStatus === 'pending' || m._sendStatus === 'failed') continue;
      if (m.isRecalled) continue;
      return m;
    }
    return null;
  }, [sortedChatMessages, currentUserId]);

  const filteredComposerEmojis = useMemo(() => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return COMPOSER_EMOJI_LIST;
    return COMPOSER_EMOJI_LIST.filter((emoji) => emoji.toLowerCase().includes(keyword));
  }, [emojiSearch]);

  const appendEmoji = (emoji) => {
    setMessage((prev) => `${prev || ''}${emoji}`);
    setShowEmojiPicker(false);
    setEmojiSearch('');
  };

  const clearUploadPreview = useCallback(() => {
    setUploadPreview((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  const performFileUpload = useCallback(
    async (file) => {
      if (!file || !selectedFriendId) return;
      setFailedUpload(null);
      setUploadProgress(0);
      try {
        const normalized = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'dm',
            receiverId: selectedFriendId,
          },
          (p) => setUploadProgress(p)
        );
        toast.success(t('friendChat.fileOk'));
        const id = normalized?._id || normalized?.id;
        setMessages((prev) => {
          if (id && prev.some((x) => String(x._id || x.id) === String(id))) {
            return prev;
          }
          return [...prev, normalized];
        });
        if (normalized) {
          setLastDmByFriendId((prev) =>
            mergeDmSnippetMap(prev, normalized, currentUserId, t)
          );
        }
      } catch (err) {
        setFailedUpload({ file });
        toast.error(err.response?.data?.message || err.message || t('friendChat.fileFail'));
      } finally {
        setUploadProgress(null);
      }
    },
    [selectedFriendId, currentUserId, t, setBlockedByPeer]
  );

  const queueFileForPreview = useCallback(
    (file) => {
      if (!file || !selectedFriendId) return;
      const isImage = (file.type || '').startsWith('image/');
      const objectUrl = isImage ? URL.createObjectURL(file) : null;
      setUploadPreview({ file, objectUrl, isImage });
    },
    [selectedFriendId]
  );

  const handleFriendFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    queueFileForPreview(file);
  };

  const confirmUploadPreview = () => {
    const file = uploadPreview?.file;
    clearUploadPreview();
    if (file) performFileUpload(file);
  };

  useEffect(() => () => clearUploadPreview(), [clearUploadPreview]);

  const formatTime = useCallback(
    (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const loc = locale === 'en' ? 'en-US' : 'vi-VN';
      return d.toLocaleTimeString(loc, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    },
    [locale]
  );

  const unwrapPayload = (payload) => payload?.data ?? payload;

  const plainTextForMessage = (msg) => {
    if (!msg) return '';
    const mt = msg.messageType || 'text';
    if (mt === 'text') return String(msg.content || '');
    if (mt === 'file' || mt === 'image')
      return msg.fileMeta?.originalName || String(msg.content || '').slice(0, 200) || t('friendChat.attachment');
    return String(msg.content || '');
  };

  const visibleChatMessages = sortedChatMessages;

  const CHAT_NEAR_BOTTOM_PX = 64;

  const updateDmNearBottomState = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) {
      isNearBottomRef.current = true;
      setShowJumpToDmLatest(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScroll <= 4) {
      isNearBottomRef.current = true;
      setShowJumpToDmLatest(false);
      return;
    }
    const distFromBottom = maxScroll - el.scrollTop;
    const near = distFromBottom <= CHAT_NEAR_BOTTOM_PX;
    isNearBottomRef.current = near;
    setShowJumpToDmLatest(!near);
  }, []);

  const handleDmChatScroll = useCallback(() => {
    updateDmNearBottomState();
  }, [updateDmNearBottomState]);

  const scrollDmChatToLatest = useCallback(
    (behavior = 'auto') => {
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
        setShowJumpToDmLatest(false);
      };
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(updateDmNearBottomState);
      });
    },
    [updateDmNearBottomState]
  );

  useEffect(() => {
    if (!selectedFriendId) return;
    isNearBottomRef.current = true;
    setShowJumpToDmLatest(false);
  }, [selectedFriendId]);

  useEffect(() => {
    if (!selectedFriendId || loadingMessages) return;
    scrollDmChatToLatest('auto');
  }, [selectedFriendId, loadingMessages, scrollDmChatToLatest]);

  useEffect(() => {
    if (!selectedFriendId || loadingMessages) return;
    if (!isNearBottomRef.current) return;
    scrollDmChatToLatest(sortedChatMessages.length > 0 ? 'smooth' : 'auto');
  }, [selectedFriendId, sortedChatMessages, loadingMessages, scrollDmChatToLatest]);

  const matchesDmMessage = useCallback(
    (m) => {
      if (!messageMatchesDmScope(m, dmScope)) return false;
      const q = dmMessageSearch.trim().toLowerCase();
      if (!q) return false;
      return plainTextForMessage(m).toLowerCase().includes(q);
    },
    [dmScope, dmMessageSearch]
  );

  const handleConversationSearchSelect = useCallback(
    (m) => {
      const mid = m?._id || m?.id;
      jumpToMessage(mid);
      setConversationSearchOpen(false);
    },
    [jumpToMessage]
  );

  /** Ảnh / file: không hiện sao chép. Còn lại: có nội dung chuỗi (kể cả link). */
  const canShowCopyTextInMenu = (msg) => {
    if (!msg) return false;
    const t = String(msg.messageType || 'text').toLowerCase();
    if (t === 'image' || t === 'file') return false;
    if (msg.fileMeta) return false;
    const raw = msg.content;
    if (raw == null) return false;
    const s = typeof raw === 'string' ? raw : String(raw);
    return s.trim().length > 0;
  };

  const menuCreateTaskCheck = useMemo(
    () => getAiTaskEligibility(moreMenu.message, { organizationId: defaultOrgIdForTask }),
    [moreMenu.message, defaultOrgIdForTask]
  );

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

  const canEditDmMessage = (msg) => {
    if (!msg || msg._optimistic) return false;
    const t = msg.messageType || 'text';
    if (t !== 'text') return false;
    if (msg.fileMeta) return false;
    return true;
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const submitEdit = async (messageId) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !messageId) return;
    try {
      const res = await api.patch(`/messages/${messageId}/edit`, { content: trimmed });
      const raw = unwrapPayload(res);
      const updated = raw?.data !== undefined ? raw.data : raw;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      toast.success(t('friendChat.msgUpdated'));
      cancelEdit();
    } catch {
      toast.error(t('friendChat.editFail'));
    }
  };

  const confirmDeleteMessage = async () => {
    const messageId = deleteMsgConfirmId;
    if (!messageId) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(messageId)));
      toast.success(t('friendChat.msgDeleted'));
    } catch {
      toast.error(t('friendChat.deleteFail'));
    }
  };

  const forwardPreviewText = useMemo(() => {
    if (!forwardSourceMessage) return '';
    return formatMessagePreview(forwardSourceMessage, t);
  }, [forwardSourceMessage, t]);

  const handleForwardConfirm = async ({ friendIds, note }) => {
    if (!forwardSourceMessage || !friendIds?.length) return;
    const mt = String(forwardSourceMessage.messageType || 'text').toLowerCase();
    const isAttachment = mt === 'image' || mt === 'file';
    const rawContent = String(forwardSourceMessage.content || '').trim();
    const attachmentUrl = /^https?:\/\//i.test(rawContent) ? rawContent : '';
    const fromName = currentFriend?.name || t('friendChat.chatTitleFallback');
    const header = t('friendChat.forwardHeader', { name: fromName });
    setForwarding(true);
    try {
      for (const fid of friendIds) {
        if (note) {
          await api.post('/messages', {
            receiverId: fid,
            content: note,
            messageType: 'text',
          });
        }
        if (isAttachment && attachmentUrl) {
          await api.post('/messages', {
            receiverId: fid,
            content: attachmentUrl,
            messageType: mt === 'image' ? 'image' : 'file',
          });
        } else {
          const preview = formatMessagePreview(forwardSourceMessage, t);
          const body = [header, preview].filter(Boolean).join('\n\n');
          await api.post('/messages', {
            receiverId: fid,
            content: body,
            messageType: 'text',
          });
        }
      }
      toast.success(t('friendChat.forwardOk'));
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
      const now = Date.now();
      const fwdPreview = formatMessagePreview(forwardSourceMessage, t);
      setLastDmByFriendId((prev) => {
        const next = { ...prev };
        friendIds.forEach((id) => {
          next[String(id)] = { at: now, preview: fwdPreview, isMine: true };
        });
        return next;
      });
    } catch {
      toast.error(t('friendChat.forwardFail'));
    } finally {
      setForwarding(false);
    }
  };

  const handleQuickReactMessage = async (msg, emoji) => {
    const messageId = msg?._id || msg?.id;
    if (!messageId || String(messageId).startsWith('temp-')) return;
    try {
      const resp = await dmMessageService.addReaction(messageId, emoji);
      const updated = dmMessageService.unwrap(resp);
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
    } catch {
      toast.error(t('friendChat.reactionFail'));
    }
  };

  const confirmRecallMessage = async (messageId) => {
    if (!messageId) return;
    try {
      const resp = await dmMessageService.recallMessage(messageId);
      const updated = dmMessageService.unwrap(resp);
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      toast.success(t('friendChat.recallOk'));
    } catch {
      toast.error(t('friendChat.recallFail'));
    }
  };

  const confirmBlockCurrentFriend = async () => {
    if (!selectedFriendId || landingDemo) return;
    setBlockingFriend(true);
    try {
      await friendService.blockFriend(selectedFriendId);
      toast.success(t('friendChat.blockOk'));
      setFriends((prev) =>
        prev.map((row) => {
          const uid = row.friendId?._id || row.friendId?.userId || row.friendId;
          if (String(uid || '') !== String(selectedFriendId)) return row;
          return { ...row, relationshipStatus: 'blocked' };
        })
      );
      refreshFriendsCache();
      refreshUnread();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('friendChat.blockFail'));
    } finally {
      setBlockingFriend(false);
    }
  };

  const confirmUnblockCurrentFriend = async () => {
    if (!selectedFriendId || landingDemo) return;
    setUnblockingFriend(true);
    try {
      await friendService.unblockFriend(selectedFriendId);
      toast.success(t('friendChat.unblockOk'));
      setBlockedByPeer(false);
      refreshFriendsCache();
      refreshUnread();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('friendChat.unblockFail'));
    } finally {
      setUnblockingFriend(false);
    }
  };

  const toggleArchiveCurrentFriend = useCallback(() => {
    if (!currentFriendKey) return;
    const next = archivedFriendIds.includes(currentFriendKey)
      ? archivedFriendIds.filter((id) => id !== currentFriendKey)
      : [...archivedFriendIds, currentFriendKey];
    saveIdList(DM_ARCHIVE_STORAGE_KEY, next);
    setArchivedFriendIds(next);
    toast.success(
      archivedFriendIds.includes(currentFriendKey)
        ? t('friendChat.unarchiveOk')
        : t('friendChat.archiveOk')
    );
  }, [archivedFriendIds, currentFriendKey, t]);

  const replyLabelForDm = (msg) => {
    if (!msg) return t('friendChat.friendDefault');
    const sid = msg.senderId?._id || msg.senderId;
    if (String(sid || '') === String(currentUserId || '')) return t('common.you');
    return currentFriend?.name || t('friendChat.friendDefault');
  };

  const workspace = useMemo(() => {
    const ent = entShell(isDarkMode);
    return {
      ...ent,
      composerBar: isDarkMode
        ? 'relative mt-auto shrink-0 rounded-b-xl border-t border-white/[0.06] bg-[#11141C]/98 px-4 pb-3 pt-2.5'
        : 'relative mt-auto shrink-0 rounded-b-xl border-t border-slate-200/80 bg-white px-4 pb-3 pt-2.5',
      composerWrap: 'shrink-0 bg-transparent p-0',
    };
  }, [isDarkMode]);

  const chatShell = isDarkMode
    ? 'flex h-screen overflow-hidden bg-[#0F1117] text-slate-100'
    : `flex h-screen overflow-hidden ${appShellBg(false)} text-slate-900`;
  const friendRailAside = `${workspace.sidebar} h-full min-h-0 w-[min(280px,92vw)] overflow-hidden sm:w-[260px]`;
  const railHeadBorder = isDarkMode ? 'border-b border-white/[0.05]' : 'border-b border-slate-200';
  const railMuted = isDarkMode ? 'text-[#6d7380]' : 'text-slate-500';
  const railAvatarHover = isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100';
  const railActiveStrip = isDarkMode
    ? 'pointer-events-none absolute left-0 top-1/2 z-10 h-9 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
    : 'pointer-events-none absolute left-0 top-1/2 z-10 h-9 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-600 shadow-[0_0_12px_rgba(8,145,178,0.35)]';
  const dmChatScrollTrack =
    'scrollbar-chat min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain';
  const emptyText = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const headerTitle = workspace.textPrimary;
  const headerAccent = isDarkMode ? 'text-[#8BA3F5]' : 'text-[#4F6BED]';
  const headerMeta = isDarkMode ? workspace.textMuted : 'text-slate-500';
  const iconBtn = isDarkMode
    ? 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#b4b8c4] transition hover:bg-white/[0.06] hover:text-white'
    : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900';
  const avatarTile = isDarkMode
    ? 'flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151923] text-sm font-bold text-white shadow-inner'
    : 'flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-sm font-bold text-slate-800 shadow-inner';
  const replyBanner = isDarkMode
    ? 'mb-2 flex items-center justify-between gap-2 rounded-t-xl border border-white/[0.08] bg-[#1a1d21] px-3 py-2 text-sm'
    : 'mb-2 flex items-center justify-between gap-2 rounded-t-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm';
  const emojiModalPanel = isDarkMode
    ? 'fixed bottom-24 right-8 z-50 h-[420px] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-2xl'
    : 'fixed bottom-24 right-8 z-50 h-[420px] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl';

  return (
    <div className={chatShell}>
      {/* Khung 1: Sidebar nav chỉ icon, thanh trượt riêng */}
      <NavigationSidebar landingDemo={landingDemo} />
      <div className={`${workspace.shell} min-h-0 min-w-0 flex-1`}>
        <div className={workspace.shellInner}>
        {/* Khung 2: Danh sách bạn — cùng token panel như sidebar tổ chức */}
        <aside className={friendRailAside}>
          <div className={`shrink-0 space-y-2 px-2 pb-2 pt-3 ${railHeadBorder}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-[10px] font-semibold uppercase tracking-wider ${railMuted}`}>
                {showArchivedRail ? t('friendChat.archivedRailTitle') : t('friendChat.railTitle')}
              </p>
              <button
                type="button"
                onClick={() => setShowArchivedRail((v) => !v)}
                className={`text-[10px] font-semibold underline ${railMuted} hover:text-cyan-400`}
              >
                {showArchivedRail ? t('friendChat.showActiveChats') : t('friendChat.showArchived')}
              </button>
            </div>
            <PageSearchBar
              value={friendRailSearch}
              onChange={setFriendRailSearch}
              placeholder={t('friendChat.searchFriendsPlaceholder')}
              isDarkMode={isDarkMode}
              id="friend-rail-search"
              aria-label={t('friendChat.searchFriendsAria')}
              size="sm"
              variant="subtle"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2 scrollbar-overlay">
            {friendsLoading ? (
              <div className={`py-4 text-center text-[10px] leading-relaxed ${railMuted}`}>
                {t('friendChat.loadingRail')}
              </div>
            ) : (
              filteredViewFriends.map((f) => {
                const active = selectedFriendId === f.id;
                const fid = String(f.id || '');
                const isMuted = fid ? mutedFriendIds.includes(fid) : false;
                const isPinned = fid ? pinnedFriendIds.includes(fid) : false;
                const isBlocked = Boolean(f.isBlockedByMe);
                const unreadCount = isBlocked ? 0 : fid ? Number(unreadByPeer[fid] || 0) : 0;
                const railRing = active
                  ? isDarkMode
                    ? 'border-cyan-500/80 bg-[#1e2230] ring-2 ring-cyan-500/35 text-white'
                    : 'border-cyan-500 bg-white ring-2 ring-cyan-400/40 text-slate-800'
                  : isDarkMode
                    ? 'border-white/[0.08] bg-[#151923] text-white group-hover:border-white/15'
                    : 'border-slate-200 bg-slate-100 text-slate-800 group-hover:border-slate-300';
                return (
                  <button
                    key={f.listKey}
                    type="button"
                    onClick={() => setSelectedFriendId(f.id)}
                    title={f.name}
                    aria-label={t('friendChat.openChatAria', { name: f.name })}
                    aria-current={active ? 'true' : undefined}
                    className={`group relative flex w-full items-center gap-2 rounded-xl px-1.5 py-2 text-left outline-none transition ${railAvatarHover} focus-visible:ring-2 ${
                      isDarkMode ? 'focus-visible:ring-cyan-400/50' : 'focus-visible:ring-cyan-600/35'
                    }`}
                  >
                    {active && <span className={railActiveStrip} aria-hidden />}
                    <UserAvatar
                      avatar={f.avatar}
                      name={f.name}
                      size="md"
                      showOnline
                      status={f.status}
                      ringClassName={`border shadow-inner ${railRing}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <div
                            className={`truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                          >
                            {f.name}
                          </div>
                          {isMuted && (
                            <BellOff className={`h-3 w-3 shrink-0 ${railMuted}`} aria-hidden />
                          )}
                          {isBlocked && (
                            <Ban
                              className={`h-3 w-3 shrink-0 ${isDarkMode ? 'text-rose-400/90' : 'text-rose-600'}`}
                              aria-label={t('friendChat.blockedRailLabel')}
                            />
                          )}
                        </div>
                        {f.lastAt ? (
                          <span className={`shrink-0 text-[10px] tabular-nums ${railMuted}`}>
                            {formatRailTime(f.lastAt, locale, t)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <p className={`min-w-0 truncate text-[11px] ${railMuted}`}>
                          {isBlocked
                            ? t('friendChat.blockedRailLabel')
                            : f.lastPreview
                              ? `${f.lastIsMine ? t('friendChat.railYouPrefix') : ''}${f.lastPreview}`
                              : f.subtitle}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          {unreadCount > 0 && (
                            <span
                              className={`min-w-[1.1rem] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums ${
                                isDarkMode
                                  ? 'bg-cyan-500 text-[#0b0e14]'
                                  : 'bg-cyan-600 text-white'
                              }`}
                            >
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                          {isPinned && (
                            <Pin
                              className={`h-3 w-3 shrink-0 ${isDarkMode ? 'text-amber-400/90' : 'text-amber-600'}`}
                              aria-label="Pinned"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            {!friendsLoading && viewFriends.length === 0 && (
              <div className={`px-1 py-4 text-center text-[10px] leading-relaxed ${railMuted}`}>
                {t('friendChat.emptyRail')}
              </div>
            )}
            {!friendsLoading && viewFriends.length > 0 && filteredViewFriends.length === 0 && (
              <div className={`px-1 py-4 text-center text-[10px] leading-relaxed ${railMuted}`}>
                {t('friendChat.friendSearchNoMatch')}
              </div>
            )}
          </div>
        </aside>

        {/* Khung chat chính (card như workspace) + sidebar phải */}
        <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
          <div className={`${workspace.main} min-h-0`}>
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          {friendsLoading ? (
            <div className={`flex flex-1 items-center justify-center ${emptyText}`}>
              {t('friendChat.loadingFriends')}
            </div>
          ) : viewFriends.length === 0 ? (
            <div className={`flex flex-1 items-center justify-center px-4 text-center ${emptyText}`}>
              {t('friendChat.emptyMain')}
            </div>
          ) : resolvingDefaultChat ? (
            <div className={`flex flex-1 items-center justify-center ${emptyText}`}>{t('friendChat.openingChat')}</div>
          ) : !currentFriend ? (
            <div className={`flex flex-1 items-center justify-center ${emptyText}`}>{t('friendChat.pickFriend')}</div>
          ) : (
            <>
              <header className={workspace.header}>
                <div className="flex items-start gap-3">
                  <UserAvatar
                    avatar={currentFriend.avatar}
                    name={currentFriend.name}
                    size="lg"
                    showOnline
                    status={currentFriend.status}
                    onClick={() => setProfileModalOpen(true)}
                    ringClassName={`${avatarTile} cursor-pointer`}
                    title={t('friendChat.profileTitle')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h2 className={`truncate text-base font-bold tracking-tight ${headerTitle}`}>{currentFriend.name}</h2>
                    </div>
                    <p className={`mt-0.5 text-xs ${headerMeta}`} aria-live="polite">
                      {isCurrentFriendBlocked
                        ? t('friendChat.blockedRailLabel')
                        : peerTyping
                          ? t('friendChat.typing')
                          : currentFriend.status === 'online'
                            ? t('friendChat.online')
                            : t('friendChat.offline')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title={t('friendChat.callAudio')}
                      onClick={() => startFriendCall('audio')}
                      disabled={Boolean(outboundCall?.callId) || isDmComposerLocked}
                      className={iconBtn}
                    >
                      <Phone className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.callVideo')}
                      onClick={() => startFriendCall('video')}
                      disabled={Boolean(outboundCall?.callId) || isDmComposerLocked}
                      className={iconBtn}
                    >
                      <Video className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={isCurrentFriendMuted ? 'Bật thông báo' : t('friendChat.convoNotif')}
                      onClick={toggleMuteCurrentFriend}
                      className={iconBtn}
                    >
                      {isCurrentFriendMuted ? (
                        <BellOff className="h-5 w-5" strokeWidth={2} />
                      ) : (
                        <Bell className="h-5 w-5" strokeWidth={2} />
                      )}
                    </button>
                    <button
                      type="button"
                      title="Xem tin nhắn đã ghim"
                      onClick={() => setPinnedMessagesModalOpen(true)}
                      className={iconBtn}
                    >
                      <Pin className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.openConversationSearch')}
                      onClick={() => setConversationSearchOpen((v) => !v)}
                      className={iconBtn}
                      aria-label={t('friendChat.openConversationSearch')}
                    >
                      <Search className="h-5 w-5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
                {blockedByPeer && !isCurrentFriendBlocked && (
                  <div
                    className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      isDarkMode
                        ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span className="min-w-0 flex-1">{t('friendChat.blockedByPeerBanner')}</span>
                  </div>
                )}
                {isCurrentFriendBlocked && (
                  <div
                    className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                      isDarkMode
                        ? 'border-rose-500/35 bg-rose-500/10 text-rose-100'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    <span className="min-w-0 flex-1">{t('friendChat.blockedBanner')}</span>
                    <button
                      type="button"
                      onClick={() => setUnblockConfirmOpen(true)}
                      disabled={unblockingFriend}
                      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isDarkMode
                          ? 'bg-rose-500/20 text-rose-100 hover:bg-rose-500/30'
                          : 'bg-white text-rose-800 hover:bg-rose-100'
                      }`}
                    >
                      {t('friendChat.unblockConfirmBtn')}
                    </button>
                  </div>
                )}
                {outboundCall?.callId && (
                  <div
                    className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                      isDarkMode
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                        : 'border-amber-300 bg-amber-50 text-amber-950'
                    }`}
                  >
                    <span>{t('friendChat.callRinging')}</span>
                    <button
                      type="button"
                      onClick={cancelOutboundCall}
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        isDarkMode ? 'bg-zinc-800 text-amber-100 hover:bg-zinc-700' : 'bg-white text-amber-900 hover:bg-amber-100'
                      }`}
                    >
                      {t('friendChat.cancelCall')}
                    </button>
                  </div>
                )}
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  ref={chatScrollRef}
                  className={dmChatScrollTrack}
                  onScroll={handleDmChatScroll}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer?.files?.[0];
                    if (file) handleFriendFileSelected({ target: { files: [file], value: '' } });
                  }}
                >
                  <div className="flex min-h-full min-w-0 flex-col px-4 py-3">
                    <div className="mt-auto flex w-full flex-col gap-3">
                      {loadingMessages ? (
                        <div
                          className={`flex min-h-[30vh] items-center justify-center text-center ${emptyText}`}
                        >
                          {t('friendChat.loadingMessages')}
                        </div>
                      ) : (
                        <>
                          {hasMoreOlder && (
                            <div className="flex justify-center pb-2">
                              <button
                                type="button"
                                onClick={loadOlderMessages}
                                disabled={loadingOlder}
                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                                  isDarkMode
                                    ? 'border-white/10 bg-[#12151f] text-cyan-300 hover:bg-white/5'
                                    : 'border-slate-200 bg-white text-cyan-700 hover:bg-slate-50'
                                }`}
                              >
                                {loadingOlder ? t('friendChat.loadingOlder') : t('friendChat.loadOlder')}
                              </button>
                            </div>
                          )}
                  {visibleChatMessages.map((m, idx) => {
                    const mid = m._id || m.id;
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;

                    const isMine = myId && senderId === myId;

                    const displayName = isMine
                      ? currentUserName
                      : currentFriend?.name || t('friendChat.friendDefault');

                    const prev = idx > 0 ? visibleChatMessages[idx - 1] : null;
                    const showDayDivider =
                      !prev || messageDayKey(m.createdAt) !== messageDayKey(prev.createdAt);

                    const replyId = m.replyToMessageId;
                    const parentMsg = replyId
                      ? [...messages].find((x) => String(x._id || x.id) === String(replyId))
                      : null;
                    const replyPreview = parentMsg
                      ? plainTextForMessage(parentMsg).slice(0, 160)
                      : t('friendChat.threadRoot');
                    const isEditing = editingMessageId && String(editingMessageId) === String(mid);
                    const showToolbar = !isEditing && uploadProgress == null;
                    const toolbarPlace = toolbarPlacementById[String(mid)] ?? 'above';

                    const receiptMsg = lastOutgoingForReceipt;
                    const showReadReceipt =
                      isMine &&
                      receiptMsg &&
                      String(mid) === String(receiptMsg._id || receiptMsg.id);
                    const readReceiptLabel = receiptMsg?.isRead
                      ? t('friendChat.readReceipt')
                      : t('friendChat.sentReceipt');
                    const sendFailed = isMine && m._sendStatus === 'failed';
                    const sendPending = isMine && m._sendStatus === 'pending';
                    const reactionRows = Array.isArray(m.reactions) ? m.reactions : [];

                    const contentTextCls = isDarkMode ? 'text-[#dcddde]' : 'text-slate-800';

                    return (
                      <Fragment key={mid != null && mid !== '' ? String(mid) : `dm-msg-${idx}`}>
                        {showDayDivider && (
                          <div className="flex justify-center py-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                isDarkMode
                                  ? 'border-white/[0.06] bg-[#12151f] text-[#8e9297]'
                                  : 'border-slate-200 bg-white text-slate-500 shadow-sm'
                              }`}
                            >
                              {formatDateDividerLabel(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          data-dm-message-id={mid != null ? String(mid) : undefined}
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
                                recentReactionsStorageKey="vh_dm_recent_reactions"
                                isMine={isMine}
                                showEdit={isMine && canEditDmMessage(m)}
                                disabled={uploadProgress != null}
                                onQuickReact={(emoji) => handleQuickReactMessage(m, emoji)}
                                onOpenEmojiPicker={() => {}}
                                onMiddleAction={() => {
                                  if (isMine && canEditDmMessage(m)) {
                                    setEditingMessageId(mid);
                                    setEditDraft(String(m.content || ''));
                                  } else {
                                    setReplyingToMessage(m);
                                  }
                                }}
                                onForward={() => handleForwardRequest(m)}
                                onMore={(e) => {
                                  const r = e?.currentTarget?.getBoundingClientRect?.();
                                  if (r) {
                                    setMoreMenu({ open: true, anchorRect: r, message: m });
                                  }
                                }}
                              />
                            </div>
                          )}
                          <div className="flex w-full items-start justify-start gap-3">
                            <UserAvatar
                              avatar={isMine ? currentUserAvatar : currentFriend?.avatar}
                              name={isMine ? currentUserName : currentFriend?.name}
                              size="sm"
                              ringClassName={
                                isDarkMode
                                  ? 'mt-0.5 border-white/[0.08] bg-[#151923] text-white shadow-inner'
                                  : 'mt-0.5 border-slate-200 bg-slate-100 text-slate-800 shadow-inner'
                              }
                            />
                            <div className="min-w-0 max-w-[min(100%,42rem)] flex-1">
                              <div className="mb-1 flex flex-wrap items-center gap-2 justify-start">
                                <span
                                  className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                                >
                                  {displayName}
                                </span>
                                {isMine && (
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                                      isDarkMode
                                        ? 'border-white/10 bg-white/[0.06] text-[#C5CAD3]'
                                        : 'border-slate-200 bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {t('common.you')}
                                  </span>
                                )}
                                <span
                                  className={`text-[11px] tabular-nums ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                                >
                                  {formatTime(m.createdAt)}
                                </span>
                                {m.editedAt && (
                                  <span
                                    className={`text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                                  >
                                    {t('friendChat.edited')}
                                  </span>
                                )}
                              </div>
                              <div className={`text-sm leading-relaxed text-left ${contentTextCls}`}>
                                {replyId && (
                                  <button
                                    type="button"
                                    onClick={() => jumpToMessage(replyId)}
                                    className={`mb-2 border-l-2 pl-2 text-left text-[11px] ${
                                      isDarkMode
                                        ? 'border-[#5865F2]/50 text-[#949ba4] hover:bg-white/[0.04]'
                                        : 'border-[#5865F2]/40 text-[#8e9297] hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="font-semibold text-[#a29bfe]">
                                      @{replyLabelForDm(parentMsg || {})}{' '}
                                    </span>
                                    <span className="line-clamp-2">{replyPreview}</span>
                                  </button>
                                )}
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <textarea
                                      value={editDraft}
                                      onChange={(e) => setEditDraft(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          submitEdit(mid);
                                        }
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      rows={3}
                                      className={`w-full resize-y rounded-lg border px-2 py-1.5 text-sm outline-none ${
                                        isDarkMode
                                          ? 'border-white/20 bg-black/35 text-white focus:border-cyan-400/50'
                                          : 'border-slate-200 bg-white text-slate-900 focus:border-cyan-500'
                                      }`}
                                    />
                                    <p className={`text-[11px] ${emptyText}`}>
                                      {t('friendChat.editEscape')}{' '}
                                      <button
                                        type="button"
                                        className={`${headerAccent} hover:underline`}
                                        onClick={cancelEdit}
                                      >
                                        {t('friendChat.editCancel')}
                                      </button>
                                      {' • '}
                                      {t('friendChat.editEnter')}{' '}
                                      <button
                                        type="button"
                                        className={`${headerAccent} hover:underline`}
                                        onClick={() => submitEdit(mid)}
                                      >
                                        {t('friendChat.editSave')}
                                      </button>
                                    </p>
                                  </div>
                                ) : m.isRecalled ? (
                                  <p className={`text-sm italic ${emptyText}`}>
                                    {t('friendChat.recalledPlaceholder')}
                                  </p>
                                ) : (
                                  <ChatMessageAttachmentBody
                                    message={m}
                                    mentionVariant="friend"
                                    onImageClick={(_url, messageId) => openMediaViewerForMessage(messageId)}
                                  />
                                )}
                                {reactionRows.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {Object.entries(
                                      reactionRows.reduce((acc, r) => {
                                        const em = r.emoji;
                                        if (!em) return acc;
                                        acc[em] = (acc[em] || 0) + 1;
                                        return acc;
                                      }, {})
                                    ).map(([em, count]) => (
                                      <span
                                        key={em}
                                        className={`rounded-full border px-2 py-0.5 text-xs ${
                                          isDarkMode
                                            ? 'border-white/15 bg-black/25'
                                            : 'border-slate-200 bg-slate-50'
                                        }`}
                                      >
                                        {em}
                                        {count > 1 ? ` ${count}` : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {sendPending && (
                                  <p
                                    className={`mt-1 text-left text-[10px] ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}
                                  >
                                    {t('friendChat.sending')}
                                  </p>
                                )}
                                {sendFailed && (
                                  <div className="mt-1 flex items-center justify-start gap-2">
                                    <span
                                      className={`text-[10px] ${isDarkMode ? 'text-rose-300' : 'text-rose-600'}`}
                                    >
                                      {t('friendChat.sendFailed')}
                                    </span>
                                    <button
                                      type="button"
                                      className={`text-[10px] font-semibold underline ${isDarkMode ? 'text-rose-200' : 'text-rose-700'}`}
                                      onClick={() => retrySend(m)}
                                    >
                                      {t('friendChat.retrySend')}
                                    </button>
                                  </div>
                                )}
                                {showReadReceipt && (
                                  <p
                                    className={`mt-1.5 text-left text-[10px] font-medium ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}
                                  >
                                    {readReceiptLabel}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                          <div ref={messagesEndRef} className="h-px w-full shrink-0" aria-hidden />
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {showJumpToDmLatest &&
                  visibleChatMessages.length > 0 &&
                  !loadingMessages &&
                  currentFriend && (
                    <button
                      type="button"
                      title={t('orgPanel.scrollToLatest')}
                      aria-label={t('orgPanel.scrollToLatest')}
                      onClick={() => scrollDmChatToLatest('smooth')}
                      className={`pointer-events-auto absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
                        isDarkMode
                          ? 'border border-white/10 bg-[#171B24] text-[#A1A8B3] hover:bg-[#1D2330] hover:text-[#F3F4F6]'
                          : 'border border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <ChevronsDown className="h-5 w-5" strokeWidth={2.25} />
                    </button>
                  )}
              </div>
              <div className={workspace.composerBar}>
                {failedUpload?.file && uploadProgress == null && (
                  <div
                    className={`mb-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                      isDarkMode
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800'
                    }`}
                  >
                    <span className="truncate">{t('friendChat.uploadFailed')}</span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold underline"
                      onClick={() => performFileUpload(failedUpload.file)}
                    >
                      {t('friendChat.retryUpload')}
                    </button>
                  </div>
                )}
                <ChatUploadProgressBar
                  percent={uploadProgress}
                  label={t('friendChat.uploadLabel')}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFriendFileSelected}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFriendFileSelected}
                />
                <UnifiedChatComposer
                  richToolbar
                  flatInner
                  showSendButton={false}
                  mentionItems={composerMentionItems}
                  wrapperClassName={workspace.composerWrap}
                  topSlot={
                    replyingToMessage ? (
                      <div className={replyBanner}>
                        <div className="min-w-0">
                          <span className={emptyText}>{t('friendChat.replying')}</span>
                          <span className={`font-semibold ${headerAccent}`}>
                            {replyLabelForDm(replyingToMessage)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(null)}
                          className={`rounded-full p-1.5 transition ${emptyText} ${
                            isDarkMode ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-slate-200 hover:text-slate-900'
                          }`}
                          aria-label={t('friendChat.cancelReplyAria')}
                        >
                          ✕
                        </button>
                      </div>
                    ) : null
                  }
                  value={message}
                  onChange={(v) => {
                    setMessage(v);
                    if (v.trim()) notifyTyping();
                  }}
                  onSend={handleSend}
                  onPaste={(e) => {
                    const file = e.clipboardData?.files?.[0];
                    if (file) {
                      e.preventDefault();
                      handleFriendFileSelected({ target: { files: [file], value: '' } });
                    }
                  }}
                  placeholder={
                    isDmComposerLocked
                      ? blockedByPeer
                        ? t('friendChat.composerBlockedByPeer')
                        : t('friendChat.composerBlocked')
                      : uploadProgress != null
                        ? t('friendChat.sendingFile')
                        : currentFriend
                          ? t('friendChat.placeholderDm', { name: currentFriend.name })
                          : t('friendChat.placeholderPick')
                  }
                  disabled={!selectedFriendId || uploadProgress != null || isDmComposerLocked}
                  sendDisabled={!message.trim() || isDmComposerLocked}
                  sendLabel={t('friendChat.send')}
                  plusItems={[
                    {
                      key: 'upload-file',
                      icon: '📁',
                      label: t('friendChat.uploadFile'),
                      onClick: () => fileInputRef.current?.click(),
                    },
                    {
                      key: 'upload-image',
                      icon: '🖼️',
                      label: t('friendChat.uploadImage'),
                      onClick: () => imageInputRef.current?.click(),
                    },
                  ]}
                  actionItems={[
                    {
                      key: 'emoji',
                      title: t('friendChat.emojiTab'),
                      content: '🙂',
                      className: 'w-8 text-lg',
                      onClick: () => {
                        setEmojiPickerTab('emoji');
                        setShowEmojiPicker((prev) => !prev);
                      },
                    },
                  ]}
                />

                {showEmojiPicker && (
                  <>
                    <button
                      type="button"
                      aria-label={t('friendChat.closeEmoji')}
                      onClick={() => setShowEmojiPicker(false)}
                      className="fixed inset-0 z-40 cursor-default bg-black/30"
                    />
                    <div className={emojiModalPanel}>
                      <div
                        className={`flex items-center gap-2 border-b px-4 py-3 ${
                          isDarkMode ? 'border-slate-700' : 'border-slate-200'
                        }`}
                      >
                        {[
                          { id: 'gif', label: t('friendChat.gif') },
                          { id: 'sticker', label: t('friendChat.stickerTab') },
                          { id: 'emoji', label: t('friendChat.emojiTab') },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setEmojiPickerTab(tab.id)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                              emojiPickerTab === tab.id
                                ? isDarkMode
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-cyan-600 text-white'
                                : isDarkMode
                                  ? 'text-gray-300 hover:bg-slate-800/70'
                                  : 'text-slate-600 hover:bg-slate-100'
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
                            onChange={(e) => setEmojiSearch(e.target.value)}
                            placeholder={t('friendChat.emojiSearchPh')}
                            className="h-11 flex-1 rounded-xl border border-blue-500/70 bg-[#0d1525] px-3 text-sm text-white outline-none placeholder:text-gray-400"
                          />
                        </div>
                      </div>

                      <div className="h-[calc(100%-126px)] overflow-y-auto p-3 scrollbar-overlay">
                        {emojiPickerTab !== 'emoji' ? (
                          <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            {t('friendChat.emojiBetaMsg')}
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
                                {t('friendChat.emojiNoMatch')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          </div>

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
              const msg = moreMenu.message;
              if (!msg) return;
              const raw = msg.content;
              if (raw == null) return;
              const s = typeof raw === 'string' ? raw : String(raw);
              const trimmed = s.trim();
              if (trimmed) navigator.clipboard.writeText(trimmed);
            }}
            onReply={() => moreMenu.message && setReplyingToMessage(moreMenu.message)}
            onForward={() => moreMenu.message && handleForwardRequest(moreMenu.message)}
            onPinToggle={() => {
              const msg = moreMenu.message;
              if (!msg) return;
              togglePinMessage(msg);
            }}
            pinLabel={
              (() => {
                const msg = moreMenu.message;
                const messageId = msg?._id || msg?.id;
                if (messageId == null) return 'Ghim tin nhắn';
                return pinnedMessageIdsCurrentFriend.includes(String(messageId))
                  ? 'Bỏ ghim tin nhắn'
                  : 'Ghim tin nhắn';
              })()
            }
            onEdit={() => {
              const msg = moreMenu.message;
              if (!msg || !canEditDmMessage(msg)) return;
              setEditingMessageId(msg._id || msg.id);
              setEditDraft(String(msg.content || ''));
            }}
            onDelete={() => {
              const msg = moreMenu.message;
              if (msg) requestDeleteMessage(msg._id || msg.id);
            }}
            onRecall={() => {
              const msg = moreMenu.message;
              if (msg) confirmRecallMessage(msg._id || msg.id);
            }}
            onCreateTask={() => {
              const msg = moreMenu.message;
              if (!msg) return;
              setCreateTaskSourceMessage(msg);
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
            }}
            messageId={createTaskSourceMessage?._id || createTaskSourceMessage?.id}
            organizationId={defaultOrgIdForTask}
            currentUserId={currentUserId}
            messagePreview={
              createTaskSourceMessage ? plainTextForMessage(createTaskSourceMessage).slice(0, 500) : ''
            }
            onConfirmed={() => showToast(t('friendChat.taskFromAi'), 'success')}
          />

          <ForwardToFriendModal
            isOpen={forwardModalOpen}
            onClose={() => {
              setForwardModalOpen(false);
              setForwardSourceMessage(null);
            }}
            friends={viewFriends}
            excludeFriendId={selectedFriendId}
            previewText={forwardPreviewText}
            previewMessage={forwardSourceMessage}
            loading={false}
            submitting={forwarding}
            onConfirm={handleForwardConfirm}
          />
          </div>

          {currentFriend && !resolvingDefaultChat && viewFriends.length > 0 && (
            conversationSearchOpen ? (
              <ConversationSearchPanel
                inline
                hideScopeChips
                open={conversationSearchOpen}
                onClose={() => setConversationSearchOpen(false)}
                isDarkMode={isDarkMode}
                locale={locale}
                query={dmMessageSearch}
                onQueryChange={setDmMessageSearch}
                scope={dmScope}
                onScopeChange={setDmScope}
                scopeOptions={dmScopeOptions}
                messages={sortedChatMessages}
                matchesMessage={matchesDmMessage}
                onSelectMessage={handleConversationSearchSelect}
                serverResults={
                  dmMessageSearch.trim().length >= 2 ? dmServerSearchFiltered : null
                }
                serverSearching={dmServerSearching}
              />
            ) : (
              <FriendChatRightPanel
                friend={currentFriend}
                messages={messages}
                attachments={friendAttachments}
                currentUserId={currentUserId}
                onBlock={() => {
                  if (isCurrentFriendBlocked) setUnblockConfirmOpen(true);
                  else setBlockConfirmOpen(true);
                }}
                onSchedule={() =>
                  openCalendarForFriend({
                    prefillType: 'meeting',
                    prefillTitle: `Meeting với ${currentFriend.name || 'bạn bè'}`,
                  })
                }
                onArchive={toggleArchiveCurrentFriend}
                isArchived={archivedFriendIds.includes(String(currentFriend.id || ''))}
                isBlocked={isCurrentFriendBlocked}
                onOpenProfile={() => setProfileModalOpen(true)}
                onOpenMediaAt={openMediaViewerAtGrid}
                onViewAllMedia={() => setMediaViewer({ open: true, index: 0 })}
                onAttachmentAction={handleAttachmentAction}
                onOpenCalendarForFriend={openCalendarForFriend}
                onOpenMutualOrganization={openMutualOrganization}
              />
            )
          )}
        </div>
        </div>
      </div>
      <FriendProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        friend={currentFriend}
        onMessage={() => setProfileModalOpen(false)}
      />
      {mediaViewer.open && (
        <ChatMediaViewer
          items={friendAttachments.viewerItems}
          initialIndex={mediaViewer.index}
          messages={messages}
          currentUserId={currentUserId}
          onAttachmentAction={handleAttachmentAction}
          onClose={() => setMediaViewer({ open: false, index: 0 })}
        />
      )}
      <ChatUploadPreviewModal
        open={Boolean(uploadPreview?.file)}
        file={uploadPreview?.file}
        previewUrl={uploadPreview?.objectUrl}
        isDarkMode={isDarkMode}
        title={t('friendChat.uploadPreviewTitle')}
        confirmLabel={t('friendChat.send')}
        cancelLabel={t('nav.cancel')}
        onCancel={clearUploadPreview}
        onConfirm={confirmUploadPreview}
      />
      <Modal
        isOpen={pinnedMessagesModalOpen}
        onClose={() => setPinnedMessagesModalOpen(false)}
        title="Tin nhắn đã ghim"
        size="md"
      >
        {pinnedMessagesForCurrentFriend.length === 0 ? (
          <p className={`py-6 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Chưa có tin nhắn nào được ghim.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {pinnedMessagesForCurrentFriend.map((msg) => {
              const messageId = msg?._id || msg?.id;
              const senderName =
                String(msg?.senderId?._id || msg?.senderId || '') === String(currentUserId || '')
                  ? currentUserName
                  : currentFriend?.name || 'Bạn bè';
              return (
                <div
                  key={String(messageId)}
                  className={`rounded-xl border px-3 py-2 ${
                    isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`truncate text-xs font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {senderName}
                    </span>
                    <span className={`shrink-0 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatTime(msg?.createdAt)}
                    </span>
                  </div>
                  <p className={`line-clamp-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {plainTextForMessage(msg) || 'Tin nhắn đính kèm'}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedMessagesModalOpen(false);
                        jumpToMessage(messageId);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isDarkMode ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-cyan-600 text-white hover:bg-cyan-700'
                      }`}
                    >
                      Đi tới tin nhắn
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePinMessage(msg)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isDarkMode
                          ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      Bỏ ghim
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={deleteMsgConfirmId != null}
        onClose={() => setDeleteMsgConfirmId(null)}
        onConfirm={confirmDeleteMessage}
        title={t('friendChat.confirmDeleteTitle')}
        message={t('friendChat.confirmDeleteMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
      />
      <ConfirmDialog
        isOpen={blockConfirmOpen}
        onClose={() => !blockingFriend && setBlockConfirmOpen(false)}
        onConfirm={async () => {
          await confirmBlockCurrentFriend();
          setBlockConfirmOpen(false);
        }}
        title={t('friendChat.blockUser')}
        message={t('friendChat.blockConfirm', { name: currentFriend?.name || '' })}
        confirmText={t('friendChat.blockConfirmBtn')}
        cancelText={t('nav.cancel')}
      />
      <ConfirmDialog
        isOpen={unblockConfirmOpen}
        onClose={() => !unblockingFriend && setUnblockConfirmOpen(false)}
        onConfirm={async () => {
          await confirmUnblockCurrentFriend();
          setUnblockConfirmOpen(false);
        }}
        title={t('friendChat.unblockUser')}
        message={t('friendChat.unblockConfirm', { name: currentFriend?.name || '' })}
        confirmText={t('friendChat.unblockConfirmBtn')}
        cancelText={t('nav.cancel')}
      />
      {inlineToast && (
        <Toast
          message={inlineToast.message}
          type={inlineToast.type}
          onClose={() => setInlineToast(null)}
        />
      )}
    </div>
  );
}

export default FriendChatPage;


