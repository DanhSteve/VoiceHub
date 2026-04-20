import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import toast from 'react-hot-toast';
import { Bell, Calendar, MoreHorizontal, Phone, Video } from 'lucide-react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import UnifiedChatComposer from '../../components/Chat/UnifiedChatComposer';
import { ChatMessageAttachmentBody } from '../../components/Chat/ChatFileAttachment';
import ChannelMessageToolbar from '../../components/Organization/ChannelMessageToolbar';
import ChannelMessageMoreMenu from '../../components/Organization/ChannelMessageMoreMenu';
import ForwardToFriendModal from '../../components/Organization/ForwardToFriendModal';
import CreateTaskFromAiModal from '../../components/Chat/CreateTaskFromAiModal';
import FriendChatRightPanel from '../../components/Chat/FriendChatRightPanel';
import organizationService from '../../services/organizationService';
import { getAiTaskEligibility, AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';
import { ConfirmDialog, Toast } from '../../components/Shared';
import friendService from '../../services/friendService';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import ChatUploadProgressBar from '../../components/Chat/ChatUploadProgressBar';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import {
  DM_SCOPE,
  messageMatchesDmScope,
  PageSearchBar,
  SearchFilterChips,
} from '../../features/search';

/** Chữ ký tên hiển thị trong avatar tròn (theo mockup sidebar DM). */
function friendInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  const one = parts[0] || '';
  return one.slice(0, 2).toUpperCase() || '?';
}

function messageDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function FriendChatPage({ landingDemo = false } = {}) {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const [friends, setFriends] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteMsgConfirmId, setDeleteMsgConfirmId] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [lastDmAtByFriendId, setLastDmAtByFriendId] = useState({});
  /** Đang gọi API để chọn hội thoại mặc định (tránh nháy "chọn bạn") */
  const [resolvingDefaultChat, setResolvingDefaultChat] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
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
  const [dmMessageSearch, setDmMessageSearch] = useState('');
  const [friendRailSearch, setFriendRailSearch] = useState('');
  const [dmScope, setDmScope] = useState(DM_SCOPE.ALL);
  const { user } = useAuth();
  const { emit, on, off, onlineUsers, connected: socketConnected } = useSocket();

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
  const currentUserAvatar = user?.avatar || '🧑';

  const showToast = (message, type = 'success') => {
    setInlineToast({ message, type });
    setTimeout(() => setInlineToast(null), 3000);
  };

  // Load org mặc định cho tạo task — không gọi API khi nhúng landing (tránh 401 / không đụng backend)
  useEffect(() => {
    if (landingDemo) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await organizationService.getMyOrganizations();
        const payload = r?.data ?? r;
        const list =
          payload?.organizations ||
          payload?.data?.organizations ||
          (Array.isArray(payload) ? payload : []);
        const arr = Array.isArray(list) ? list : [];
        const first = arr[0];
        const oid = first?._id || first?.id;
        if (!cancelled && oid) setDefaultOrgIdForTask(String(oid));
      } catch {
        /* DM vẫn dùng được; tạo task cần org */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [landingDemo]);

  const loadFriends = useCallback(async () => {
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
    setFriendsLoading(true);
    try {
      const resp = await friendService.getFriends();
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.friends || result;
      setFriends(Array.isArray(list) ? list : []);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('friendChat.loadFriendsFail'));
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }, [landingDemo, currentUserId, t]);

  // Map friends + sắp xếp theo tin nhắn gần nhất; presence realtime khớp Dashboard (onlineUsers từ socket)
  const viewFriends = useMemo(() => {
    const rows = friends.map((f) => {
      const u = f.friendId || f;
      const uname = typeof u?.username === 'string' ? u.username.trim() : '';
      const title =
        typeof u?.title === 'string'
          ? u.title.trim()
          : typeof u?.headline === 'string'
            ? u.headline.trim()
            : '';
      const subtitle =
        title ||
        (uname ? `@${uname}` : '') ||
        t('friendChat.dmSubtitle');
      const id = u?._id || u?.userId || u?.id || f.id;
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
        name: u?.displayName || u?.username || t('common.user'),
        avatar: u?.avatar || '👤',
        status: String(u?.status || 'offline').toLowerCase(),
        subtitle,
        _presenceKeys: uniqueKeys,
      };
    });
    const sorted = [...rows].sort(
      (a, b) =>
        (lastDmAtByFriendId[String(b.id)] || 0) - (lastDmAtByFriendId[String(a.id)] || 0)
    );
    const onlineSet = new Set((onlineUsers || []).map(String));
    return sorted.map((row) => {
      const { _presenceKeys, ...rest } = row;
      const inLiveList = (_presenceKeys || [String(rest.id)]).some((k) => onlineSet.has(String(k)));
      /** Khi socket đã nối: chỉ tin danh sách online từ server (khớp Dashboard). */
      if (socketConnected) {
        return { ...rest, status: inLiveList ? 'online' : 'offline' };
      }
      return {
        ...rest,
        status: inLiveList ? 'online' : rest.status,
      };
    });
  }, [friends, lastDmAtByFriendId, onlineUsers, socketConnected, t]);

  const filteredViewFriends = useMemo(() => {
    const q = friendRailSearch.trim().toLowerCase();
    if (!q) return viewFriends;
    return viewFriends.filter((f) => {
      const hay = `${f.name || ''} ${f.subtitle || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [viewFriends, friendRailSearch]);

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

  /** Lấy thời gian tin DM gần nhất với mỗi bạn (từ API /messages, không receiverId) */
  const fetchLastDmActivity = useCallback(async () => {
    if (!currentUserId) return {};
    try {
      const resp = await api.get('/messages', { params: { limit: 500, page: 1 } });
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.messages || [];
      if (!Array.isArray(list)) return {};
      const myId = String(currentUserId);
      const last = {};
      for (const m of list) {
        if (!m?.receiverId || m.roomId) continue;
        const s = String(m.senderId?._id || m.senderId || '');
        const r = String(m.receiverId?._id || m.receiverId || '');
        let partner = null;
        if (s === myId) partner = r;
        else if (r === myId) partner = s;
        if (!partner) continue;
        const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
        if (!last[partner] || t > last[partner]) last[partner] = t;
      }
      return last;
    } catch {
      return {};
    }
  }, [currentUserId]);

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
        setLastDmAtByFriendId((prev) => {
          const next = { ...prev };
          Object.entries(lastMap).forEach(([k, v]) => {
            next[String(k)] = v;
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
              avatar: u?.avatar || '👤',
              status: u?.status || 'offline',
            };
          });
          const sorted = [...rows].sort(
            (a, b) => (lastMap[String(b.id)] || 0) - (lastMap[String(a.id)] || 0)
          );
          const withDm = sorted.find((f) => lastMap[String(f.id)]);
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
  }, [friends, currentUserId, fetchLastDmActivity, landingDemo, t]);

  // Load messages khi chọn bạn
  const loadMessages = useCallback(
    async (friendId) => {
      if (!friendId) return;
      setLoadingMessages(true);
      try {
        const resp = await api.get('/messages', { params: { receiverId: friendId } });
        const payload = resp?.data || resp;
        const result = payload?.data || payload;
        const list = result?.messages || result || [];
        setMessages(Array.isArray(list) ? list : []);
      } catch (err) {
        toast.error(err.response?.data?.message || err.message || t('friendChat.loadMessagesFail'));
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [t]
  );

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedFriendId) {
      loadMessages(selectedFriendId);
    }
  }, [selectedFriendId, loadMessages, landingDemo]);

  useEffect(() => {
    setDmMessageSearch('');
    setDmScope(DM_SCOPE.ALL);
  }, [selectedFriendId]);

  // Gửi tin nhắn qua socket-service (realtime) + optimistic UI
  const handleSend = async () => {
    if (!selectedFriendId || !message.trim()) return;

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

    try {
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
        ...(validReplyId ? { replyToMessageId: validReplyId } : {}),
      };

      setMessages((prev) => [...prev, optimistic]);
      setMessage('');
      setReplyingToMessage(null);
      setLastDmAtByFriendId((prev) => ({
        ...prev,
        [String(selectedFriendId)]: Date.now(),
      }));
      const payload = {
        receiverId: selectedFriendId,
        content: text,
        messageType: 'text',
      };
      if (validReplyId) payload.replyToMessageId = validReplyId;
      emit('friend:send', payload);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('friendChat.sendFail'));
    }
  };

  // Lắng nghe tin nhắn realtime từ socket-service
  useEffect(() => {
    if (landingDemo) return;
    if (!on || !off || !currentUserId) return;

    const myIdStr = String(currentUserId);

    const isMessageForCurrentConversation = (m) => {
      if (!m) return false;
      const sender = m.senderId?._id || m.senderId;
      const receiver = m.receiverId?._id || m.receiverId;
      if (!sender || !receiver || !selectedFriendId) return false;

      const senderStr = String(sender);
      const receiverStr = String(receiver);
      const friendIdStr = String(selectedFriendId);

      // Tin nhắn giữa mình và người bạn đang chọn (2 chiều)
      const case1 = senderStr === myIdStr && receiverStr === friendIdStr;
      const case2 = senderStr === friendIdStr && receiverStr === myIdStr;
      return case1 || case2;
    };

    const bumpLastDmFromPayload = (m) => {
      if (!m?.receiverId || m.roomId) return;
      const s = String(m.senderId?._id || m.senderId || '');
      const r = String(m.receiverId?._id || m.receiverId || '');
      let partner = null;
      if (s === myIdStr) partner = r;
      else if (r === myIdStr) partner = s;
      if (!partner) return;
      const t = m.createdAt ? new Date(m.createdAt).getTime() : Date.now();
      setLastDmAtByFriendId((prev) => ({ ...prev, [partner]: t }));
    };

    const appendIfRelevant = (m) => {
      if (!isMessageForCurrentConversation(m)) return;

      setMessages((prev) => {
        const id = m._id || m.id;
        if (id && prev.some((x) => (x._id || x.id) === id)) {
          return prev;
        }
        return [...prev, m];
      });
    };

    const handleNewMessage = (m) => {
      bumpLastDmFromPayload(m);
      appendIfRelevant(m);
    };

    const handleSentMessage = (m) => {
      bumpLastDmFromPayload(m);
      if (!isMessageForCurrentConversation(m)) return;
      setMessages((prev) => {
        const withoutOpt = prev.filter((x) => !x._optimistic);
        const id = m._id || m.id;
        if (id && withoutOpt.some((x) => (x._id || x.id) === id)) {
          return withoutOpt;
        }
        return [...withoutOpt, m];
      });
    };

    on('friend:new_message', handleNewMessage);
    on('friend:sent', handleSentMessage);

    return () => {
      off('friend:new_message', handleNewMessage);
      off('friend:sent', handleSentMessage);
    };
  }, [on, off, currentUserId, selectedFriendId, landingDemo]);

  const currentFriend = viewFriends.find((f) => f.id === selectedFriendId) || null;

  const sortedChatMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const lastOutgoingMessageId = useMemo(() => {
    if (!currentUserId) return null;
    const myId = String(currentUserId);
    for (let i = sortedChatMessages.length - 1; i >= 0; i--) {
      const m = sortedChatMessages[i];
      const sid = String(m.senderId?._id || m.senderId || '');
      if (sid === myId) return m._id || m.id;
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

  const handleFriendFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedFriendId) return;
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
      setLastDmAtByFriendId((prev) => ({
        ...prev,
        [String(selectedFriendId)]: Date.now(),
      }));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || t('friendChat.fileFail'));
    } finally {
      setUploadProgress(null);
    }
  };

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

  const visibleChatMessages = useMemo(() => {
    let list = sortedChatMessages.filter((m) => messageMatchesDmScope(m, dmScope));
    const q = dmMessageSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((m) => plainTextForMessage(m).toLowerCase().includes(q));
    }
    return list;
  }, [sortedChatMessages, dmMessageSearch, dmScope, t]);

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

  const requestDeleteMessage = (messageId) => {
    if (!messageId) return;
    setDeleteMsgConfirmId(messageId);
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

  const handleForwardRequest = (msg) => {
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const forwardPreviewText = useMemo(() => {
    if (!forwardSourceMessage) return '';
    return String(forwardSourceMessage.content || '').slice(0, 500);
  }, [forwardSourceMessage]);

  const handleForwardConfirm = async ({ friendIds, note }) => {
    if (!forwardSourceMessage || !friendIds?.length) return;
    const preview = String(forwardSourceMessage.content || '').trim().slice(0, 500);
    const fromName = currentFriend?.name || t('friendChat.chatTitleFallback');
    const header = t('friendChat.forwardHeader', { name: fromName });
    const body = [note, header, preview].filter(Boolean).join('\n\n');
    setForwarding(true);
    try {
      for (const fid of friendIds) {
        await api.post('/messages', {
          receiverId: fid,
          content: body,
          messageType: 'text',
        });
      }
      toast.success(t('friendChat.forwardOk'));
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
      const t = Date.now();
      setLastDmAtByFriendId((prev) => {
        const next = { ...prev };
        friendIds.forEach((id) => {
          next[String(id)] = t;
        });
        return next;
      });
    } catch {
      toast.error(t('friendChat.forwardFail'));
    } finally {
      setForwarding(false);
    }
  };

  const handleQuickReactMessage = (_m, _emoji) => {
    toast(t('friendChat.reactionInfo'), { icon: 'ℹ️' });
  };

  const replyLabelForDm = (msg) => {
    if (!msg) return t('friendChat.friendDefault');
    const sid = msg.senderId?._id || msg.senderId;
    if (String(sid || '') === String(currentUserId || '')) return t('common.you');
    return currentFriend?.name || t('friendChat.friendDefault');
  };

  const chatShell = isDarkMode
    ? 'h-screen flex overflow-hidden bg-[#0b0e14] text-slate-100'
    : `h-screen flex overflow-hidden ${appShellBg(false)} text-slate-900`;
  const friendRail = isDarkMode
    ? 'flex h-full min-h-0 w-[min(280px,92vw)] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0f15] sm:w-[260px]'
    : 'flex h-full min-h-0 w-[min(280px,92vw)] shrink-0 flex-col border-r border-slate-200 bg-white sm:w-[260px]';
  const railHeadBorder = isDarkMode ? 'border-b border-white/[0.05]' : 'border-b border-slate-200';
  const railMuted = isDarkMode ? 'text-[#6d7380]' : 'text-slate-500';
  const railAvatarHover = isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100';
  const railActiveStrip = isDarkMode
    ? 'pointer-events-none absolute left-0 top-1/2 z-10 h-9 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,0.45)]'
    : 'pointer-events-none absolute left-0 top-1/2 z-10 h-9 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-600 shadow-[0_0_12px_rgba(8,145,178,0.35)]';
  const statusRingBorder = isDarkMode ? 'border-[#0c0f15]' : 'border-white';
  const chatMainColumn = isDarkMode
    ? 'flex h-full min-w-0 flex-1 bg-[#0b0e14]'
    : 'flex h-full min-w-0 flex-1 bg-slate-100';
  const chatHeader = isDarkMode
    ? 'shrink-0 border-b border-white/[0.06] bg-[#0b0e14] px-4 py-3'
    : 'shrink-0 border-b border-slate-200 bg-white px-4 py-3';
  const messagesScroll = isDarkMode
    ? 'scrollbar-overlay flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto bg-[#080a0f] px-4 py-4'
    : 'scrollbar-overlay flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto bg-slate-50 px-4 py-4';
  const composerShell = isDarkMode
    ? 'shrink-0 border-t border-white/[0.06] bg-[#0b0e14] px-4 py-3'
    : 'shrink-0 border-t border-slate-200 bg-white px-4 py-3';
  const emptyText = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const headerTitle = isDarkMode ? 'text-white' : 'text-slate-900';
  const headerAccent = isDarkMode ? 'text-cyan-300' : 'text-cyan-700';
  const headerMeta = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const headerTag = isDarkMode
    ? 'rounded-full border border-white/[0.08] bg-[#12151f] px-2.5 py-0.5 text-[11px] font-medium text-[#b4b8c4]'
    : 'rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600';
  const iconBtn = isDarkMode
    ? 'rounded-xl p-2.5 text-[#b4b8c4] transition hover:bg-white/[0.06] hover:text-white'
    : 'rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900';
  const scheduleBtn = isDarkMode
    ? 'flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#12151f] px-2.5 py-1.5 text-xs font-semibold text-[#e3e5e8] transition hover:bg-white/[0.06]'
    : 'flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-200/80';
  const avatarTile = isDarkMode
    ? 'flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151923] text-sm font-bold text-white shadow-inner'
    : 'flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 text-sm font-bold text-slate-800 shadow-inner';
  const onlineRing = isDarkMode ? 'border-[#0b0e14]' : 'border-white';
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
      <div className="flex h-full min-w-0 flex-1">
        {/* Khung 2: Danh sách bạn bè - thanh trượt riêng, chỉ hiện khi cần */}
        {/* Cột 2: rail avatar bạn bè (mockup — thanh chọn tím, chấm online) */}
        <div className={friendRail}>
          <div className={`shrink-0 space-y-2 px-2 pb-2 pt-3 ${railHeadBorder}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${railMuted}`}>
              {t('friendChat.railTitle')}
            </p>
            <PageSearchBar
              value={friendRailSearch}
              onChange={setFriendRailSearch}
              placeholder={t('friendChat.searchFriendsPlaceholder')}
              isDarkMode={isDarkMode}
              id="friend-rail-search"
              aria-label={t('friendChat.searchFriendsAria')}
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
                const avatarUrl =
                  typeof f.avatar === 'string' && /^https?:\/\//i.test(f.avatar) ? f.avatar : null;
                return (
                  <button
                    key={f.id}
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
                    <div className="relative shrink-0">
                      <div
                        className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border text-[10px] font-bold tracking-tight shadow-inner transition ${
                          isDarkMode ? 'text-white' : 'text-slate-800'
                        } ${
                          active
                            ? isDarkMode
                              ? 'border-cyan-500/80 bg-[#1e2230] ring-2 ring-cyan-500/35'
                              : 'border-cyan-500 bg-white ring-2 ring-cyan-400/40'
                            : isDarkMode
                              ? 'border-white/[0.08] bg-[#151923] group-hover:border-white/15'
                              : 'border-slate-200 bg-slate-100 group-hover:border-slate-300'
                        }`}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="select-none">{friendInitials(f.name)}</span>
                        )}
                      </div>
                      <span
                        className={`pointer-events-none absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${statusRingBorder} ${
                          f.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                        title={f.status === 'online' ? t('friendChat.online') : t('friendChat.offline')}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                      >
                        {f.name}
                      </div>
                      <div className={`truncate text-[10px] ${railMuted}`}>{f.subtitle}</div>
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
        </div>

        {/* Khung 3–4: Khu vực chat + sidebar phải */}
        <div className={chatMainColumn}>
          <div className="flex-1 flex flex-col h-full min-w-0">
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
              <header className={chatHeader}>
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className={avatarTile}>
                      {(() => {
                        const url =
                          typeof currentFriend.avatar === 'string' &&
                          /^https?:\/\//i.test(currentFriend.avatar)
                            ? currentFriend.avatar
                            : null;
                        if (url) {
                          return (
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          );
                        }
                        return <span className="select-none">{friendInitials(currentFriend.name)}</span>;
                      })()}
                    </div>
                    <span
                      className={`pointer-events-none absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 ${onlineRing} ${
                        currentFriend.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h2 className={`truncate text-base font-bold tracking-tight ${headerTitle}`}>{currentFriend.name}</h2>
                    </div>
                    <p className={`truncate text-[11px] font-semibold uppercase tracking-wide ${headerAccent}`}>
                      {currentFriend.subtitle}
                    </p>
                    <p className={`mt-0.5 text-xs ${headerMeta}`}>
                      {currentFriend.status === 'online' ? t('friendChat.online') : t('friendChat.offline')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {[t('friendChat.tagChat'), t('friendChat.tagMessages')].map((tag) => (
                        <span
                          key={tag}
                          className={headerTag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title={t('friendChat.callAudio')}
                      onClick={() => toast(t('friendChat.callAudioSoon'), { icon: '📞' })}
                      className={iconBtn}
                    >
                      <Phone className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.callVideo')}
                      onClick={() => toast(t('friendChat.callVideoSoon'), { icon: '📹' })}
                      className={iconBtn}
                    >
                      <Video className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.schedule')}
                      onClick={() => toast(t('friendChat.scheduleSoon'), { icon: '📅' })}
                      className={scheduleBtn}
                    >
                      <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} />
                      {t('friendChat.schedule')}
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.convoNotif')}
                      onClick={() => toast(t('friendChat.convoNotifSoon'), { icon: '🔔' })}
                      className={iconBtn}
                    >
                      <Bell className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.moreMenu')}
                      onClick={() => toast(t('friendChat.moreSoon'), { icon: '⋯' })}
                      className={iconBtn}
                    >
                      <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <PageSearchBar
                    className="max-w-xl"
                    value={dmMessageSearch}
                    onChange={setDmMessageSearch}
                    placeholder={t('friendChat.searchMessagesPlaceholder')}
                    isDarkMode={isDarkMode}
                    id="friend-dm-message-search"
                    aria-label={t('friendChat.searchInConversationAria')}
                  />
                  <SearchFilterChips
                    aria-label={t('friendChat.dmScopeLabel')}
                    options={dmScopeOptions}
                    value={dmScope}
                    onChange={setDmScope}
                    isDarkMode={isDarkMode}
                    size="sm"
                  />
                </div>
              </header>
              <div className={messagesScroll}>
                {loadingMessages ? (
                  <div className={`text-center ${emptyText}`}>{t('friendChat.loadingMessages')}</div>
                ) : visibleChatMessages.length === 0 && sortedChatMessages.length > 0 ? (
                  <div className={`text-center ${emptyText}`}>
                    {dmMessageSearch.trim()
                      ? t('friendChat.searchNoMatch')
                      : dmScope !== DM_SCOPE.ALL
                        ? t('friendChat.emptyDmScope')
                        : t('friendChat.searchNoMatch')}
                  </div>
                ) : (
                  visibleChatMessages.map((m, idx) => {
                    const mid = m._id || m.id;
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;

                    const isMine = myId && senderId === myId;

                    const displayName = isMine
                      ? currentUserName
                      : currentFriend?.name || t('friendChat.friendDefault');

                    const friendMsgAvatarUrl =
                      typeof currentFriend?.avatar === 'string' &&
                      /^https?:\/\//i.test(currentFriend.avatar)
                        ? currentFriend.avatar
                        : null;

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

                    const showReadReceipt =
                      isMine &&
                      !m._optimistic &&
                      lastOutgoingMessageId != null &&
                      String(mid) === String(lastOutgoingMessageId);

                    const mineBubble = isMine
                      ? isDarkMode
                        ? 'border-cyan-500/35 bg-gradient-to-br from-cyan-600 to-teal-700 text-white shadow-md shadow-cyan-900/25'
                        : 'border-cyan-400/45 bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-md shadow-cyan-900/15'
                      : isDarkMode
                        ? 'border-white/[0.06] bg-[#1a1d26] text-slate-100'
                        : 'border-slate-200 bg-white text-slate-800 shadow-sm';

                    return (
                      <Fragment key={mid}>
                        {showDayDivider && (
                          <div className="flex justify-center py-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                                isDarkMode
                                  ? 'border-white/[0.06] bg-[#12151f] text-[#8e9297]'
                                  : 'border-slate-200 bg-slate-100 text-slate-500'
                              }`}
                            >
                              {formatDateDividerLabel(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex w-full items-end gap-2 ${
                            isMine ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {!isMine && (
                            <div
                              className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border text-[11px] font-bold shadow-sm ${
                                isDarkMode
                                  ? 'border-white/[0.08] bg-[#151923] text-white'
                                  : 'border-slate-200 bg-slate-100 text-slate-800'
                              }`}
                            >
                              {friendMsgAvatarUrl ? (
                                <img src={friendMsgAvatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="select-none">{friendInitials(currentFriend.name)}</span>
                              )}
                            </div>
                          )}
                          <div
                            className="group relative max-w-[min(80%,28rem)]"
                            onMouseEnter={(e) => handleMessageRowMouseEnter(mid, e)}
                          >
                            {showToolbar && (
                              <div
                                className={`absolute z-20 opacity-0 transition-opacity group-hover:opacity-100 ${
                                  toolbarPlace === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
                                } ${isMine ? 'right-0' : 'left-0'}`}
                              >
                                <ChannelMessageToolbar
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
                            <div
                              className={`inline-block w-full rounded-2xl border px-3.5 py-2.5 text-sm shadow-sm ${
                                isMine ? 'rounded-tr-md' : 'rounded-tl-md'
                              } ${mineBubble}`}
                            >
                              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span
                                  className={`max-w-[12rem] truncate text-xs font-semibold ${
                                    isMine
                                      ? 'text-white/95'
                                      : isDarkMode
                                        ? 'text-cyan-200'
                                        : 'text-cyan-800'
                                  }`}
                                >
                                  {displayName}
                                </span>
                                <span
                                  className={`text-[11px] tabular-nums ${
                                    isMine ? 'text-white/70' : isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'
                                  }`}
                                >
                                  {formatTime(m.createdAt)}
                                </span>
                                {m.editedAt && (
                                  <span
                                    className={`text-[10px] ${isMine ? 'text-white/55' : 'text-[#8e9297]/70'}`}
                                  >
                                    {t('friendChat.edited')}
                                  </span>
                                )}
                              </div>
                              {replyId && (
                                <div
                                  className={`mb-2 border-l-2 pl-2 text-[11px] ${
                                    isMine
                                      ? 'border-white/40 text-white/85'
                                      : isDarkMode
                                        ? 'border-cyan-400/40 text-[#8e9297]'
                                        : 'border-cyan-300 text-slate-500'
                                  }`}
                                >
                                  <span
                                    className={`font-semibold ${
                                      isMine ? 'text-white' : isDarkMode ? 'text-cyan-200' : 'text-cyan-700'
                                    }`}
                                  >
                                    @{replyLabelForDm(parentMsg || {})}{' '}
                                  </span>
                                  <span className="line-clamp-2">{replyPreview}</span>
                                </div>
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
                              ) : (
                                <ChatMessageAttachmentBody message={m} />
                              )}
                              {showReadReceipt && (
                                <p className="mt-1.5 text-right text-[10px] font-medium text-white/70">
                                  {t('friendChat.readReceipt')}
                                </p>
                              )}
                            </div>
                          </div>
                          {isMine && (
                            <div
                              className={`mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold uppercase tracking-tight shadow-sm ${
                                isDarkMode
                                  ? 'border-cyan-500/40 bg-[#1e2230] text-cyan-200'
                                  : 'border-cyan-400/60 bg-cyan-50 text-cyan-800'
                              }`}
                            >
                              {typeof currentUserAvatar === 'string' &&
                              /^https?:\/\//i.test(currentUserAvatar) ? (
                                <img src={currentUserAvatar} alt="" className="h-full w-full rounded-full object-cover" />
                              ) : (
                                <span className="select-none">ME</span>
                              )}
                            </div>
                          )}
                        </div>
                      </Fragment>
                    );
                  })
                )}
              </div>
              <div className="relative shrink-0">
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
                  wrapperClassName={composerShell}
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
                  onChange={setMessage}
                  onSend={handleSend}
                  placeholder={
                    uploadProgress != null
                      ? t('friendChat.sendingFile')
                      : currentFriend
                        ? t('friendChat.placeholderDm', { name: currentFriend.name })
                        : t('friendChat.placeholderPick')
                  }
                  disabled={!selectedFriendId || uploadProgress != null}
                  sendDisabled={!message.trim()}
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
            loading={false}
            submitting={forwarding}
            onConfirm={handleForwardConfirm}
          />

          {currentFriend && !resolvingDefaultChat && viewFriends.length > 0 && (
            <FriendChatRightPanel
              friend={currentFriend}
              messages={messages}
              onMute={() => toast(t('friendChat.muteSoon'), { icon: '🔕' })}
              onPin={() => toast(t('friendChat.pinSoon'), { icon: '📌' })}
              onCreateGroup={() => toast(t('friendChat.groupSoon'), { icon: '👥' })}
            />
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteMsgConfirmId != null}
        onClose={() => setDeleteMsgConfirmId(null)}
        onConfirm={confirmDeleteMessage}
        title={t('friendChat.confirmDeleteTitle')}
        message={t('friendChat.confirmDeleteMsg')}
        confirmText={t('common.delete')}
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

