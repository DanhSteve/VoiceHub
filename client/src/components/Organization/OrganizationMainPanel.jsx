import { Fragment, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import CreateTaskFromAiModal from '../Chat/CreateTaskFromAiModal';
import { getAiTaskEligibility, AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';
import { Bell, Zap } from 'lucide-react';
import { Modal } from '../Shared';
import UnifiedChatComposer from '../Chat/UnifiedChatComposer';
import ChatUploadProgressBar from '../Chat/ChatUploadProgressBar';
import { ChatMessageAttachmentBody } from '../Chat/ChatFileAttachment';
import ChannelMessageToolbar from './ChannelMessageToolbar';
import ChannelMessageMoreMenu from './ChannelMessageMoreMenu';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { displayDepartmentName, channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import OrgWorkspaceSearch from '../../features/search/components/OrgWorkspaceSearch';
import PageSearchBar from '../../features/search/components/PageSearchBar';
import SearchFilterChips from '../../features/search/components/SearchFilterChips';

function formatJoinAnswerValue(value) {
  if (value === undefined || value === null) return '—';
  if (Array.isArray(value)) {
    const parts = value.filter((v) => v != null && String(v).trim() !== '');
    return parts.length ? parts.join(', ') : '—';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value).trim();
  return s || '—';
}

/**
 * Bản rõ: nhãn từ formSnapshot (lúc nộp đơn), giá trị từ answers.
 * Không có snapshot (đơn cũ) → trả mode raw.
 */
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

function buildJoinAnswerDisplayRows(answers, formSnapshot) {
  const raw = answers && typeof answers === 'object' ? answers : {};
  const fields = formSnapshot?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    return { mode: 'raw', rows: [] };
  }
  const rows = fields.map((f) => {
    const id = f.id;
    return {
      id: String(id),
      label: String(f.label || id || '').trim() || String(id),
      value: formatJoinAnswerValue(raw[id]),
    };
  });
  const seen = new Set(fields.map((f) => String(f.id)));
  for (const k of Object.keys(raw)) {
    if (seen.has(k)) continue;
    rows.push({
      id: k,
      label: k,
      value: formatJoinAnswerValue(raw[k]),
    });
  }
  return { mode: 'labeled', rows };
}

const OrganizationMainPanel = ({
  selectedOrganization,
  hasOrganizations = true,
  /** false: chưa biết user có tổ chức hay không — không hiển thị màn empty/home để tránh nháy UI */
  organizationsLoaded = false,
  viewMode = 'home',
  departments = [],
  selectedDepartment,
  channels = [],
  selectedChannelId,
  messages = [],
  messageInput = '',
  onChangeMessageInput,
  onSendMessage,
  loadingMessages = false,
  sendingMessage = false,
  currentUserId,
  onSelectChannel,
  onSelectDepartment,
  onCreateOrganization,
  onJoinQuickInvite,
  quickInviteInput = '',
  onChangeQuickInviteInput,
  joiningQuickInvite = false,
  invitations = [],
  loadingInvitations = false,
  respondingInvitationIds = [],
  onRespondInvitation,
  /** Đơn gia nhập cần duyệt (owner/admin) — Trang chủ tổ chức */
  joinApplicationsToReview = [],
  loadingJoinApplicationsToReview = false,
  respondingJoinReviewKeys = [],
  onApproveJoinApplication,
  onRejectJoinApplication,
  homeNotificationPreview = [],
  homeCalendarPreview = [],
  expandedHomeCards = { notifications: false, calendar: false },
  onToggleHomeCard,
  onOpenNotificationsPage,
  onOpenCalendarPage,
  onGoHome,
  onCreateDepartment,
  onCreateChannel,
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
}) => {
  const { locale } = useLocale();
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();

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
  const [orgHomeSearch, setOrgHomeSearch] = useState('');
  /** Trang chủ tổ chức: all | notifications | calendar */
  const [orgHomeSection, setOrgHomeSection] = useState('all');
  const [contactCategory, setContactCategory] = useState('all');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null, message: null });
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskSourceMessage, setCreateTaskSourceMessage] = useState(null);
  const [joinRejectDraft, setJoinRejectDraft] = useState({
    open: false,
    organizationId: null,
    applicationId: null,
    reason: '',
  });
  /** Hover: thanh công cụ phía trên bubble hoặc phía dưới (tránh cắt khi tin ở đầu khung chat) */
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});

  const chatChannels = channels.filter((channel) => channel.type !== 'voice');
  const voiceChannels = channels.filter((channel) => channel.type === 'voice');
  const selectedChannel = channels.find((channel) => channel._id === selectedChannelId) || null;

  const sortedWorkspaceMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const orgHomeFilteredNotifs = useMemo(() => {
    const q = orgHomeSearch.trim().toLowerCase();
    if (!q) return homeNotificationPreview;
    return homeNotificationPreview.filter((item) => {
      const hay = `${item?.title || ''} ${item?.message || ''} ${item?.time || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [homeNotificationPreview, orgHomeSearch]);

  const orgHomeFilteredCal = useMemo(() => {
    const q = orgHomeSearch.trim().toLowerCase();
    if (!q) return homeCalendarPreview;
    return homeCalendarPreview.filter((item) => {
      const hay = `${item?.title || ''} ${item?.date || ''} ${item?.time || ''} ${item?.type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [homeCalendarPreview, orgHomeSearch]);

  const orgHomeSectionOptions = useMemo(
    () => [
      { id: 'all', label: t('orgPanel.homeSectionAll'), icon: '📋' },
      { id: 'notifications', label: t('orgPanel.homeSectionNotif'), icon: '🔔' },
      { id: 'calendar', label: t('orgPanel.homeSectionCal'), icon: '📅' },
    ],
    [t]
  );

  const orgIdForTask = selectedOrganization?._id || selectedOrganization?.id || null;
  const menuCreateTaskCheck = useMemo(
    () =>
      getAiTaskEligibility(moreMenu.message, {
        organizationId: orgIdForTask ? String(orgIdForTask) : null,
      }),
    [moreMenu.message, orgIdForTask]
  );

  /** Workspace (kênh tổ chức): luôn gọi hook trước mọi return sớm. */
  const workspace = useMemo(
    () => ({
      shell: isDarkMode
        ? 'flex h-full min-h-0 flex-col bg-[#0b0e14]'
        : 'flex h-full min-h-0 flex-col bg-sky-50/40',
      aside: isDarkMode
        ? 'flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0f15]'
        : 'flex w-[252px] shrink-0 flex-col border-r border-sky-200/70 bg-white/95',
      main: isDarkMode
        ? 'flex min-h-0 min-w-0 flex-1 flex-col bg-[#080a0f]'
        : 'flex min-h-0 min-w-0 flex-1 flex-col bg-sky-50/25',
      header: isDarkMode
        ? 'shrink-0 border-b border-white/[0.06] bg-[#0b0e14] px-4 py-2.5'
        : 'shrink-0 border-b border-sky-200/80 bg-white/90 px-4 py-2.5',
      metaBar: isDarkMode
        ? 'flex shrink-0 items-center justify-between border-b border-white/[0.05] bg-[#0b0e14] px-4 py-2'
        : 'flex shrink-0 items-center justify-between border-b border-sky-200/60 bg-sky-50/90 px-4 py-2',
      composerBar: isDarkMode
        ? 'relative mt-auto shrink-0 border-t border-white/[0.06] bg-[#0b0e14] px-4 pb-4 pt-3'
        : 'relative mt-auto shrink-0 border-t border-sky-200/80 bg-white/95 px-4 pb-4 pt-3',
      composerWrap: isDarkMode
        ? 'shrink-0 rounded-2xl border border-white/[0.06] bg-[#12151c] p-3'
        : 'shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm',
    }),
    [isDarkMode]
  );

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
    setEditingMessageId(null);
    setEditDraft('');
  };

  const submitEdit = async (messageId) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !messageId) return;
    await onSaveMessageEdit?.(messageId, trimmed);
    cancelEdit();
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
    setIsContactModalOpen(true);
  };

  const handleCreatePoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollDuration('24h');
    setAllowMultiAnswer(false);
    setIsPollModalOpen(true);
  };

  const handleFileSelected = (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onSendChatOption?.({ kind, file });
  };

  const normalizedContacts = chatContacts.map((item) => {
    const id = item.id || item._id;
    return {
      id,
      name: item.name || item.displayName || item.username || t('organizations.userFallback'),
      phone: item.phone || '',
      email: item.email || item.username || '',
      avatar: item.avatar || null,
      category: item.category || 'friend',
    };
  });

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
    const selected = normalizedContacts.find((item) => item.id === selectedContactId);
    if (!selected) return;
    onSendChatOption?.({
      kind: 'contact',
      payload: {
        fullName: selected.name,
        phone: selected.phone,
        email: selected.email,
      },
    });
    setIsContactModalOpen(false);
  };

  const appendEmoji = (emoji) => {
    onChangeMessageInput?.(`${messageInput || ''}${emoji}`);
    setShowEmojiPicker(false);
    setEmojiSearch('');
  };

  const joinReviewKey = (organizationId, applicationId) => `${organizationId}:${applicationId}`;

  const homeUi = useMemo(
    () => ({
      joinOuter: isDarkMode
        ? 'rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1528]/90 to-[#111422]/80 shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-4'
        : 'rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm',
      inviteOuter: isDarkMode
        ? 'rounded-2xl border border-white/10 bg-gradient-to-br from-[#181b2a]/80 to-[#111422]/80 shadow-[0_8px_30px_rgba(0,0,0,0.25)]'
        : 'rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm',
      widgetCard: isDarkMode
        ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-4'
        : 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
      widgetTitle: isDarkMode ? 'truncate text-sm font-semibold text-white' : 'truncate text-sm font-semibold text-slate-900',
      widgetSub: isDarkMode ? 'mt-1 text-xs text-gray-400' : 'mt-1 text-xs text-slate-600',
      widgetMeta: isDarkMode
        ? 'rounded-full border border-white/15 px-2 py-0.5 text-xs text-gray-300'
        : 'rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700',
      widgetToggle: isDarkMode
        ? 'rounded-md border border-white/15 px-2 py-1 text-xs text-gray-200 transition hover:bg-white/10'
        : 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-sm transition hover:bg-slate-50',
      widgetViewAll: isDarkMode
        ? 'rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20'
        : 'rounded-lg border border-cyan-600/35 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-900 transition hover:bg-cyan-100',
      homeShell: isDarkMode
        ? 'min-h-0 flex-1 rounded-2xl border border-white/10 bg-black/15 p-5'
        : 'min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm',
      homeHead: isDarkMode ? 'mb-4 flex items-start justify-between gap-3 border-b border-white/10 pb-4' : 'mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-4',
      homeTitle: isDarkMode ? 'text-xl font-semibold text-white' : 'text-xl font-semibold text-slate-900',
      homeSub: isDarkMode ? 'text-sm text-gray-400' : 'text-sm text-slate-600',
      homeBadgeBtn: isDarkMode
        ? 'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-white/10'
        : 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition hover:bg-slate-50',
    }),
    [isDarkMode]
  );

  const renderJoinApplicationsToReviewPanel = () => (
    <div className={homeUi.joinOuter}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm ${isDarkMode ? 'bg-violet-500/20' : 'bg-violet-100'}`}
            >
              📋
            </span>
            <h4
              className={`truncate text-sm font-semibold tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
            >
              {t('orgPanel.joinReviewTitle')}
            </h4>
          </div>
          <p className={homeUi.widgetSub}>{t('orgPanel.joinReviewSubtitle')}</p>
        </div>
        <span
          className={`inline-flex min-w-[30px] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
            isDarkMode
              ? 'border-violet-300/30 bg-violet-400/15 text-violet-200'
              : 'border-violet-300 bg-violet-100 text-violet-900'
          }`}
        >
          {joinApplicationsToReview.length}
        </span>
      </div>

      {loadingJoinApplicationsToReview && (
        <div className="space-y-2">
          <div className={`h-16 animate-pulse rounded-xl ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
          <div className={`h-16 animate-pulse rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`} />
        </div>
      )}

      {!loadingJoinApplicationsToReview && joinApplicationsToReview.length === 0 && (
        <div
          className={`rounded-xl border border-dashed px-3 py-3 text-center ${isDarkMode ? 'border-white/15 bg-white/[0.02]' : 'border-slate-300 bg-slate-50'}`}
        >
          <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>
            {t('orgPanel.noJoinApps')}
          </div>
          <div className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-600'}`}>
            {t('orgPanel.joinAppsEmptySub')}
          </div>
        </div>
      )}

      {!loadingJoinApplicationsToReview && joinApplicationsToReview.length > 0 && (
        <ul className="space-y-3">
          {joinApplicationsToReview.map((app) => {
            const oid = app.organizationId;
            const aid = app.applicationId;
            const key = joinReviewKey(oid, aid);
            const busy = respondingJoinReviewKeys.includes(key);
            return (
              <li
                key={key}
                className={`rounded-xl border p-3 text-sm ${
                  isDarkMode
                    ? 'border-white/10 bg-black/25 text-gray-200'
                    : 'border-slate-200 bg-white text-slate-700 shadow-sm'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className={`truncate font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                    >
                      {app.organizationName}
                    </div>
                    <div
                      className={`mt-0.5 font-mono text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}
                    >
                      {t('orgPanel.applicantLine', { name: app.applicantUser })}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}
                  >
                    {app.submittedAt
                      ? new Date(app.submittedAt).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')
                      : ''}
                  </span>
                </div>
                {(() => {
                  const { mode, rows } = buildJoinAnswerDisplayRows(app.answers, app.formSnapshot);
                  if (mode === 'labeled' && rows.length > 0) {
                    return (
                      <div
                        className={`mb-3 max-h-48 space-y-2.5 overflow-y-auto rounded-lg border p-3 ${
                          isDarkMode ? 'border-white/10 bg-black/35' : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        {rows.map((row) => (
                          <div key={row.id}>
                            <div
                              className={`text-[11px] font-semibold ${isDarkMode ? 'text-cyan-100/90' : 'text-cyan-800'}`}
                            >
                              {row.label}
                            </div>
                            <div
                              className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${isDarkMode ? 'text-gray-100' : 'text-slate-800'}`}
                            >
                              {row.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <pre
                      className={`mb-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-xs ${
                        isDarkMode ? 'bg-black/40 text-amber-100/90' : 'border border-slate-200 bg-amber-50 text-amber-900'
                      }`}
                    >
                      {JSON.stringify(app.answers || {}, null, 2)}
                    </pre>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApproveJoinApplication?.(oid, aid)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('orgPanel.approveBtn')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setJoinRejectDraft({
                        open: true,
                        organizationId: oid,
                        applicationId: aid,
                        reason: '',
                      })
                    }
                    className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('orgPanel.rejectBtnShort')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const renderInvitationPanel = (compact = false) => (
    <div className={`${homeUi.inviteOuter} ${compact ? 'p-3.5' : 'p-4'}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}
            >
              📨
            </span>
            <h4
              className={`truncate text-sm font-semibold tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
            >
              {t('orgPanel.invitesPanelTitle')}
            </h4>
          </div>
          <p className={homeUi.widgetSub}>{t('orgPanel.invitesPanelSubtitle')}</p>
        </div>
        <span
          className={`inline-flex min-w-[30px] items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
            isDarkMode
              ? 'border-cyan-300/30 bg-cyan-400/15 text-cyan-200'
              : 'border-cyan-400 bg-cyan-50 text-cyan-900'
          }`}
        >
          {invitations.length}
        </span>
      </div>

      {loadingInvitations && (
        <div className="space-y-2">
          <div className={`h-11 animate-pulse rounded-xl ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
          <div className={`h-11 animate-pulse rounded-xl ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`} />
        </div>
      )}

      {!loadingInvitations && invitations.length === 0 && (
        <div
          className={`rounded-xl border border-dashed px-3 py-3 text-center ${isDarkMode ? 'border-white/15 bg-white/[0.02]' : 'border-slate-300 bg-slate-50'}`}
        >
          <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>
            {t('orgPanel.noInvites')}
          </div>
          <div className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-600'}`}>
            {t('orgPanel.invitesEmptySub')}
          </div>
        </div>
      )}

      {!loadingInvitations && invitations.length > 0 && (
        <div className="space-y-2">
          {invitations.map((invite) => {
            const invitationId = invite.invitationId || invite._id;
            const orgName = invite.organization?.name || t('orgPanel.orgFallback');
            const isResponding = respondingInvitationIds.includes(invitationId);
            const createdAt = invite.createdAt
              ? new Date(invite.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN')
              : '';

            return (
              <div
                key={invitationId}
                className={`rounded-xl border p-3 transition ${
                  isDarkMode
                    ? 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className={`truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                    >
                      {orgName}
                    </div>
                    <div
                      className={`mt-0.5 flex flex-wrap items-center gap-2 text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                    >
                      <span
                        className={`rounded-md px-1.5 py-0.5 ${isDarkMode ? 'bg-white/10' : 'bg-white'}`}
                      >
                        {t('orgPanel.roleBadge', { role: invite.role || 'member' })}
                      </span>
                      {createdAt && <span>{t('orgPanel.invitedDay', { date: createdAt })}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isResponding}
                    onClick={() => onRespondInvitation?.(invitationId, 'reject')}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isDarkMode
                        ? 'border-white/20 text-gray-200 hover:bg-white/10'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {t('orgPanel.rejectBtnShort')}
                  </button>
                  <button
                    type="button"
                    disabled={isResponding}
                    onClick={() => onRespondInvitation?.(invitationId, 'accept')}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_0_12px_rgba(99,102,241,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('orgPanel.acceptInvite')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderHomeWidget = ({
    icon,
    title,
    subtitle,
    cardKey,
    items = [],
    expanded = false,
    onToggle,
    onViewAll,
    emptyMessage,
    renderItem,
  }) => (
    <div className={homeUi.widgetCard}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}
            >
              {icon}
            </span>
            <h4 className={homeUi.widgetTitle}>{title}</h4>
          </div>
          <p className={homeUi.widgetSub}>{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={homeUi.widgetMeta}>{items.length}</span>
          <button type="button" onClick={() => onToggle?.(cardKey)} className={homeUi.widgetToggle}>
            {expanded ? t('orgPanel.collapseHide') : t('orgPanel.collapseShow')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {items.length === 0 && (
            <div
              className={`rounded-lg border border-dashed px-3 py-2 text-sm ${isDarkMode ? 'border-white/15 text-gray-400' : 'border-slate-300 text-slate-600'}`}
            >
              {emptyMessage}
            </div>
          )}
          {items.map((item, idx) => (
            <div key={item.id || idx}>{renderItem(item)}</div>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={onViewAll} className={homeUi.widgetViewAll}>
          {t('orgPanel.viewAll')}
        </button>
      </div>
    </div>
  );

  if (!organizationsLoaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div
          className={`rounded-2xl border px-12 py-14 text-center shadow-sm ${
            isDarkMode
              ? 'border-white/10 bg-black/20 shadow-[0_0_40px_rgba(0,0,0,0.35)]'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div
            className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400"
            role="status"
            aria-label={t('orgPanel.loadingWorkspaceAria')}
          />
          <p className={`mt-5 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {t('orgPanel.loadingWorkspace')}
          </p>
        </div>
      </div>
    );
  }

  if (!hasOrganizations) {
    return (
      <div className="flex h-full flex-col p-6">
        <div
          className={`min-h-0 flex-1 rounded-2xl border p-5 ${
            isDarkMode ? 'border-white/10 bg-black/15' : 'border-slate-200 bg-white shadow-sm'
          }`}
        >
          <div className="flex h-full items-center justify-center">
            <div className="mx-auto w-full max-w-xl text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-600/90 to-teal-600/80 text-4xl shadow-lg shadow-cyan-900/15">
                🏢
              </div>
              <h3
                className={`mt-4 text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
              >
                {t('orgPanel.emptyOrgsTitle')}
              </h3>
              <p
                className={`mt-2 text-sm leading-7 ${isDarkMode ? 'text-[#A0A0B2]' : 'text-slate-600'}`}
              >
                {t('orgPanel.emptyPitch1')}
                <br />
                {t('orgPanel.emptyPitch2')}
                <br />
                {t('orgPanel.emptyPitch3')}
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onCreateOrganization}
                  className="h-10 rounded-[10px] bg-gradient-to-r from-cyan-600 to-teal-600 px-5 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
                >
                  {t('orgPanel.createOrgEmpty')}
                </button>
                <button
                  type="button"
                  onClick={onJoinQuickInvite}
                  disabled={joiningQuickInvite}
                  className={`h-10 rounded-[10px] border px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isDarkMode
                      ? 'border-white/20 bg-transparent text-white hover:bg-white/5'
                      : 'border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  {joiningQuickInvite ? t('orgPanel.joining') : t('orgPanel.joinBtn')}
                </button>
              </div>

              <div className="mx-auto mt-5 flex max-w-lg items-center gap-2">
                <input
                  value={quickInviteInput}
                  onChange={(event) => onChangeQuickInviteInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onJoinQuickInvite();
                    }
                  }}
                  placeholder={t('orgPanel.quickInvitePh')}
                  className={`h-10 flex-1 rounded-lg border px-3 text-sm outline-none ${
                    isDarkMode
                      ? 'border-white/10 bg-white/5 text-white placeholder:text-[#6B6B80] focus:border-cyan-500/50 focus:shadow-[0_0_10px_rgba(6,182,212,0.25)]'
                      : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30'
                  }`}
                />
                <button
                  type="button"
                  onClick={onJoinQuickInvite}
                  disabled={joiningQuickInvite}
                  className="h-10 rounded-lg bg-gradient-to-r from-cyan-600 to-teal-600 px-4 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('orgPanel.joinBtn')}
                </button>
              </div>

              <div className="mx-auto mt-6 max-w-xl text-left">{renderInvitationPanel()}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'home') {
    const busyRejectKey =
      joinRejectDraft.open && joinRejectDraft.organizationId && joinRejectDraft.applicationId
        ? joinReviewKey(joinRejectDraft.organizationId, joinRejectDraft.applicationId)
        : null;
    const rejectModalBusy = busyRejectKey && respondingJoinReviewKeys.includes(busyRejectKey);

    return (
      <>
        <div className="flex h-full flex-col p-6">
          <div className={homeUi.homeShell}>
            <div className={homeUi.homeHead}>
              <div className="min-w-0 flex-1">
                <h3 className={homeUi.homeTitle}>{t('orgPanel.orgHomeTitle')}</h3>
                <p className={homeUi.homeSub}>{t('orgPanel.orgHomeHeaderSub')}</p>
                <div className="mt-3 max-w-xl space-y-2">
                  <PageSearchBar
                    value={orgHomeSearch}
                    onChange={setOrgHomeSearch}
                    placeholder={t('orgPanel.homeSearchPlaceholder')}
                    isDarkMode={isDarkMode}
                    id="org-home-widgets-search"
                    aria-label={t('orgPanel.homeSearchAria')}
                  />
                  <SearchFilterChips
                    aria-label={t('orgPanel.homeSectionFilterAria')}
                    options={orgHomeSectionOptions}
                    value={orgHomeSection}
                    onChange={setOrgHomeSection}
                    isDarkMode={isDarkMode}
                    size="sm"
                  />
                </div>
              </div>
              <button type="button" onClick={onGoHome} className={homeUi.homeBadgeBtn}>
                {t('orgPanel.atHomeBadge')}
              </button>
            </div>

            <div className="scrollbar-overlay h-[calc(100%-4.5rem)] space-y-4 overflow-y-auto pr-1">
              {renderJoinApplicationsToReviewPanel()}
              {renderInvitationPanel()}

            {(orgHomeSection === 'all' || orgHomeSection === 'notifications') &&
            renderHomeWidget({
              icon: '🔔',
              title: t('orgPanel.homeNotifTitle'),
              subtitle: t('orgPanel.homeNotifSubtitle'),
              cardKey: 'notifications',
              items: orgHomeFilteredNotifs.slice(0, 5),
              expanded: !!expandedHomeCards.notifications,
              onToggle: onToggleHomeCard,
              onViewAll: onOpenNotificationsPage,
              emptyMessage: t('orgPanel.homeNotifEmpty'),
              renderItem: (item) => (
                <div
                  className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={`truncate text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                      >
                        {item.title}
                      </div>
                      <div className={`mt-0.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                        {item.message}
                      </div>
                    </div>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.priority === 'high'
                          ? isDarkMode
                            ? 'bg-red-500/20 text-red-200'
                            : 'bg-red-100 text-red-800'
                          : isDarkMode
                            ? 'bg-blue-500/20 text-blue-200'
                            : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {item.priority === 'high'
                        ? t('orgPanel.priorityHigh')
                        : t('orgPanel.priorityNormal')}
                    </span>
                  </div>
                  <div className={`mt-1 text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {item.time}
                  </div>
                </div>
              ),
            })}

            {(orgHomeSection === 'all' || orgHomeSection === 'calendar') &&
            renderHomeWidget({
              icon: '📅',
              title: t('orgPanel.homeCalTitle'),
              subtitle: t('orgPanel.homeCalSubtitle'),
              cardKey: 'calendar',
              items: orgHomeFilteredCal.slice(0, 5),
              expanded: !!expandedHomeCards.calendar,
              onToggle: onToggleHomeCard,
              onViewAll: onOpenCalendarPage,
              emptyMessage: t('orgPanel.homeCalEmpty'),
              renderItem: (item) => (
                <div
                  className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div
                        className={`truncate text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                      >
                        {item.title}
                      </div>
                      <div className={`mt-0.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                        {item.date} - {item.time}
                      </div>
                    </div>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] ${isDarkMode ? 'bg-white/10 text-gray-200' : 'bg-slate-200 text-slate-800'}`}
                    >
                      {item.type}
                    </span>
                  </div>
                </div>
              ),
            })}
          </div>
        </div>
      </div>

        <Modal
          isOpen={joinRejectDraft.open}
          onClose={() => {
            if (rejectModalBusy) return;
            setJoinRejectDraft({
              open: false,
              organizationId: null,
              applicationId: null,
              reason: '',
            });
          }}
          title={t('orgPanel.rejectJoinTitle')}
          size="sm"
        >
          <p className="mb-3 text-sm text-gray-400">{t('orgPanel.rejectJoinReason')}</p>
          <textarea
            rows={4}
            value={joinRejectDraft.reason}
            onChange={(e) =>
              setJoinRejectDraft((p) => ({ ...p, reason: e.target.value }))
            }
            className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={rejectModalBusy}
              onClick={() => {
                if (rejectModalBusy) return;
                setJoinRejectDraft({
                  open: false,
                  organizationId: null,
                  applicationId: null,
                  reason: '',
                });
              }}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-50"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              disabled={rejectModalBusy}
              onClick={async () => {
                if (
                  !joinRejectDraft.organizationId ||
                  !joinRejectDraft.applicationId ||
                  rejectModalBusy
                )
                  return;
                await onRejectJoinApplication?.(
                  joinRejectDraft.organizationId,
                  joinRejectDraft.applicationId,
                  joinRejectDraft.reason
                );
                setJoinRejectDraft({
                  open: false,
                  organizationId: null,
                  applicationId: null,
                  reason: '',
                });
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('orgPanel.rejectConfirmBtn')}
            </button>
          </div>
        </Modal>
      </>
    );
  }

  const orgName = selectedOrganization?.name || t('orgPanel.orgFallback');
  const deptName = selectedDepartment?.name
    ? displayDepartmentName(selectedDepartment.name, locale)
    : '—';
  const chSlug = selectedChannel
    ? channelNameToDisplaySlug(selectedChannel.name || 'chat', locale)
    : '';
  const onlinePreviewIds = (workspaceOnlineUserIds || []).slice(0, 5);

  return (
    <>
    <div className={workspace.shell}>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={workspace.aside}>
          <div
            className={`border-b px-3 py-3 ${isDarkMode ? 'border-white/[0.06]' : 'border-sky-200/70'}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2
                className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
              >
                {t('orgPanel.deptHeading')}
              </h2>
              <button
                type="button"
                onClick={onCreateDepartment}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-white/[0.06] text-white hover:bg-white/10'
                    : 'bg-sky-100 text-slate-800 hover:bg-sky-200/80'
                }`}
              >
                {t('orgPanel.createDeptShort')}
              </button>
            </div>
            <div className="scrollbar-overlay max-h-[40vh] space-y-1 overflow-y-auto pr-0.5">
              {loadingDepartments && (
                <div
                  className={`h-9 animate-pulse rounded-xl ${isDarkMode ? 'bg-white/10' : 'bg-slate-200/80'}`}
                />
              )}
              {!loadingDepartments && departments.length === 0 && (
                <div
                  className={`rounded-xl border border-dashed p-3 text-xs ${
                    isDarkMode
                      ? 'border-white/10 text-[#8e9297]'
                      : 'border-slate-300 text-slate-600'
                  }`}
                >
                  {t('orgPanel.noDeptYet')}
                </div>
              )}
              {departments.map((department) => (
                <button
                  key={department._id}
                  type="button"
                  onClick={() => onSelectDepartment(department._id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    selectedDepartment?._id === department._id
                      ? isDarkMode
                        ? 'bg-[#5865F2]/20 text-white ring-1 ring-[#5865F2]/40'
                        : 'bg-cyan-100 text-cyan-950 ring-1 ring-cyan-300/70'
                      : isDarkMode
                        ? 'text-[#b4b8c4] hover:bg-white/[0.04]'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {displayDepartmentName(department.name, locale)}
                </button>
              ))}
            </div>
          </div>

          {selectedDepartment && (
            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                >
                  {t('orgPanel.voiceChannels')}
                </span>
                <button
                  type="button"
                  onClick={() => onCreateChannel('voice')}
                  className={`text-lg leading-none transition ${
                    isDarkMode ? 'text-[#8e9297] hover:text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  +
                </button>
              </div>
              <div className="mb-4 space-y-0.5">
                {voiceChannels.map((channel) => (
                  <button
                    key={channel._id}
                    type="button"
                    onClick={() => onSelectChannel(channel._id)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                      selectedChannelId === channel._id
                        ? isDarkMode
                          ? 'bg-white/[0.08] text-white'
                          : 'bg-sky-100 text-slate-900'
                        : isDarkMode
                          ? 'text-[#9aa0ae] hover:bg-white/[0.04]'
                          : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    🔊 {channelNameToDisplaySlug(channel.name, locale)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className={workspace.main}>
          <header className={workspace.header}>
            {/* Hàng 1: breadcrumb + trạng thái / lệnh nhanh / thông báo — tìm kiếm nằm hàng 2 để khỏi chen với đường dẫn */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <nav
                className={`min-w-0 text-[13px] ${isDarkMode ? 'text-[#9aa0ae]' : 'text-slate-600'}`}
                aria-label={t('orgPanel.workspaceBreadcrumbAria')}
              >
                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {orgName}
                </span>
                <span className={`mx-1.5 ${isDarkMode ? 'text-[#4e5258]' : 'text-slate-400'}`}>›</span>
                <span>{deptName}</span>
                <span className={`mx-1.5 ${isDarkMode ? 'text-[#4e5258]' : 'text-slate-400'}`}>›</span>
                <span className="text-[#5865F2]">
                  {t('orgPanel.channelHash', {
                    name: chSlug || t('organizations.channelNameFallback'),
                  })}
                </span>
              </nav>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 ${
                    isDarkMode
                      ? 'border-white/[0.08] bg-[#12151f]'
                      : 'border-slate-200 bg-slate-100'
                  }`}
                >
                  <div className="flex -space-x-2">
                    {onlinePreviewIds.map((oid, i) => (
                      <div
                        key={`${oid}-${i}`}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-[10px] font-bold text-white ${
                          isDarkMode ? 'border-[#12151f]' : 'border-slate-100'
                        }`}
                        title={String(oid).slice(-6)}
                      >
                        {String(oid).slice(-2)}
                      </div>
                    ))}
                  </div>
                  <span
                    className={`text-xs font-semibold ${isDarkMode ? 'text-[#b4b8c4]' : 'text-slate-600'}`}
                  >
                    {t('orgPanel.onlineCount', { n: workspaceOnlineUserIds?.length || 0 })}
                  </span>
                </div>
                <button
                  type="button"
                  title={t('orgPanel.slashCmdTitle')}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                    isDarkMode
                      ? 'border-white/[0.08] bg-[#12151f] text-[#9aa0ae] hover:bg-white/[0.06]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => onSendChatOption?.({ kind: 'quick-command-placeholder' })}
                >
                  <Zap className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{t('orgPanel.slashCmdTitle')}</span>
                  <kbd
                    className={`hidden rounded px-1.5 py-0.5 font-mono text-[10px] sm:inline ${
                      isDarkMode ? 'bg-black/40 text-[#6d7380]' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    ⌘K
                  </kbd>
                </button>
                <button
                  type="button"
                  title={t('orgPanel.notifTitle')}
                  className={`rounded-xl p-2 transition ${
                    isDarkMode
                      ? 'text-[#9aa0ae] hover:bg-white/[0.06] hover:text-white'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  onClick={() => onOpenNotificationsPage?.()}
                >
                  <Bell className="h-5 w-5" />
                </button>
              </div>
            </div>

            {(selectedOrganization?._id || selectedOrganization?.id) && (
              <div className="mt-2 w-full min-w-0" role="search" aria-label={t('orgPanel.workspaceSearchAria')}>
                <OrgWorkspaceSearch
                  organizationId={selectedOrganization?._id || selectedOrganization?.id}
                  serverId={selectedOrganization?.serverId}
                  channels={chatChannels}
                  isDarkMode={isDarkMode}
                  onJumpToResult={onWorkspaceSearchJump}
                />
              </div>
            )}

            {selectedDepartment && chatChannels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chatChannels.map((channel, cidx) => {
                  const active = String(selectedChannelId) === String(channel._id);
                  const fakeBadge = (cidx % 5) + 1;
                  return (
                    <button
                      key={channel._id}
                      type="button"
                      onClick={() => onSelectChannel(channel._id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? isDarkMode
                            ? 'border-[#5865F2] bg-[#5865F2]/15 text-white shadow-[0_0_12px_rgba(88,101,242,0.25)]'
                            : 'border-cyan-400 bg-cyan-50 text-slate-900 shadow-sm ring-1 ring-cyan-200/80'
                          : isDarkMode
                            ? 'border-white/[0.08] bg-[#12151f] text-[#9aa0ae] hover:border-white/15 hover:text-white'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                      }`}
                    >
                      #{channelNameToDisplaySlug(channel.name || 'chat', locale)}
                      {fakeBadge > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0 text-[10px] ${
                            isDarkMode
                              ? 'bg-[#5865F2]/40 text-white'
                              : 'bg-cyan-200/80 text-slate-900'
                          }`}
                        >
                          {fakeBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onCreateChannel('chat')}
                  className={`rounded-full border border-dashed px-2.5 py-1.5 text-xs ${
                    isDarkMode
                      ? 'border-white/15 text-[#6d7380] hover:text-white'
                      : 'border-slate-300 text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t('orgPanel.addChatChannel')}
                </button>
              </div>
            )}
          </header>

          <div className={workspace.metaBar}>
            <p className={`text-xs ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}>
              {t('orgPanel.msgCountLine', { n: messages.length })}
            </p>
            <p className={`hidden max-w-[min(100%,280px)] text-right text-xs sm:block ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-400'}`}>
              {t('orgPanel.searchHintAbove')}
            </p>
          </div>

          <div className="scrollbar-overlay min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
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
                  const showToolbar = !isEditing && !sendingMessage;

                  const toolbarPlace = toolbarPlacementById[String(mid)] ?? 'above';

                  const prev = idx > 0 ? sortedWorkspaceMessages[idx - 1] : null;
                  const showDayDivider =
                    !prev || messageDayKey(message.createdAt) !== messageDayKey(prev.createdAt);

                  const displayName = isMine
                    ? t('orgPanel.you')
                    : message.senderId?.displayName ||
                      message.senderId?.username ||
                      message.senderId?.fullName ||
                      t('orgPanel.member');
                  const roleCapsule = isMine
                    ? t('orgPanel.roleYouCaps')
                    : type === 'system'
                      ? t('orgPanel.roleSystemCaps')
                      : t('orgPanel.roleMemberCaps');

                  const bubbleMine = isDarkMode
                    ? 'border border-[#5865F2]/45 bg-gradient-to-br from-[#5865F2]/35 to-[#4752c4]/25 text-white shadow-[0_0_20px_rgba(88,101,242,0.12)]'
                    : 'border border-cyan-300/60 bg-gradient-to-br from-cyan-50 to-sky-50 text-slate-900 shadow-sm';
                  const bubbleOther = isDarkMode
                    ? 'border border-white/[0.07] bg-[#1a1d26] text-slate-100'
                    : 'border border-slate-200 bg-white text-slate-800 shadow-sm';

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
                            <Zap className="h-3 w-3 text-amber-400" />
                            {formatDateDividerLabel(message.createdAt)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex w-full items-start gap-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {!isMine && (
                          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/80 to-fuchsia-700/80 text-xs font-bold text-white shadow-inner">
                            {senderInitials(message)}
                          </div>
                        )}
                        <div
                          className={`group relative min-w-0 max-w-[min(100%,36rem)] flex-1 ${isMine ? 'text-right' : ''}`}
                          onMouseEnter={(e) => handleMessageRowMouseEnter(mid, e)}
                        >
                          {showToolbar && (
                            <div
                              className={`absolute z-20 opacity-0 transition-opacity group-hover:opacity-100 ${
                                toolbarPlace === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
                              } ${isMine ? 'right-0' : 'left-0'}`}
                            >
                              <ChannelMessageToolbar
                                isMine={isMine}
                                showEdit={isMine && canEditOrgMessage(message)}
                                disabled={sendingMessage}
                                onQuickReact={(emoji) => onQuickReactMessage?.(message, emoji)}
                                onOpenEmojiPicker={() => {}}
                                onMiddleAction={() => {
                                  if (isMine && canEditOrgMessage(message)) {
                                    setEditingMessageId(mid);
                                    setEditDraft(String(message.content || ''));
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
                          <div
                            className={`mb-1 flex flex-wrap items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                          >
                            <span
                              className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                            >
                              {displayName}
                            </span>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                isDarkMode
                                  ? 'bg-white/[0.08] text-[#9aa0ae]'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {roleCapsule}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                                isDarkMode ? 'bg-white/[0.06] text-[#6d7380]' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {typeLabel}
                            </span>
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
                            className={`inline-block w-full rounded-2xl px-3.5 py-2.5 text-left text-sm ${isMine ? bubbleMine : bubbleOther}`}
                          >
                            {replyId && (
                              <div
                                className={`mb-2 border-l-2 pl-2 text-[11px] ${isMine ? 'border-white/30 text-white/80' : 'border-[#5865F2]/40 text-[#8e9297]'}`}
                              >
                                <span className={`font-semibold ${isMine ? 'text-white' : 'text-[#a29bfe]'}`}>
                                  @{replyToLabel(parentMsg || {})}{' '}
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
                                      ? 'border-white/20 bg-black/35 text-white focus:border-[#5865F2]/50'
                                      : 'border-slate-300 bg-white text-slate-900 focus:border-cyan-500/60'
                                  }`}
                                />
                                <p
                                  className={`text-[11px] ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}
                                >
                                  {t('orgPanel.escapeKey')}{' '}
                                  <button type="button" className="text-[#a29bfe] hover:underline" onClick={cancelEdit}>
                                    {t('orgPanel.editCancelShort')}
                                  </button>
                                  {' · '}
                                  {t('orgPanel.enterKey')}{' '}
                                  <button
                                    type="button"
                                    className="text-[#a29bfe] hover:underline"
                                    onClick={() => submitEdit(mid)}
                                  >
                                    {t('orgPanel.editSaveShort')}
                                  </button>
                                </p>
                              </div>
                            ) : (
                              <ChatMessageAttachmentBody message={message} />
                            )}
                          </div>
                        </div>
                        {isMine && (
                          <div
                            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-bold uppercase tracking-tight ${
                              isDarkMode
                                ? 'border-[#5865F2]/35 bg-[#1e2230] text-[#a29bfe]'
                                : 'border-cyan-300/60 bg-cyan-50 text-cyan-800'
                            }`}
                          >
                            {t('orgPanel.you')}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
            </div>

            <div className={workspace.composerBar}>
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
                showAiToggle
                aiEnabled={false}
                onAiToggle={() => onSendChatOption?.({ kind: 'ai-draft-toggle' })}
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
                  selectedChannelId
                    ? t('orgPanel.composerHint', {
                        ch: chSlug || t('organizations.channelNameFallback'),
                      })
                    : t('orgPanel.composerPlaceholder')
                }
                disabled={!selectedChannelId || sendingMessage}
                sendDisabled={!messageInput.trim()}
                sendLabel={t('orgPanel.send')}
                plusItems={[
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
                ]}
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

              {showEmojiPicker && (
                <>
                  <button
                    type="button"
                    aria-label={t('orgPanel.closeEmoji')}
                    onClick={() => setShowEmojiPicker(false)}
                    className="fixed inset-0 z-40 cursor-default bg-black/30"
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
            </div>
          </div>
        </div>
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
          const t = plainTextForMessage(moreMenu.message);
          if (t) navigator.clipboard.writeText(t);
        }}
        onReply={() => moreMenu.message && onReplyToMessage?.(moreMenu.message)}
        onForward={() => moreMenu.message && onForwardMessage?.(moreMenu.message)}
        onEdit={() => {
          const m = moreMenu.message;
          if (!m || !canEditOrgMessage(m)) return;
          setEditingMessageId(m._id || m.id);
          setEditDraft(String(m.content || ''));
        }}
        onDelete={() => {
          const m = moreMenu.message;
          if (m) onDeleteMessage?.(m._id || m.id);
        }}
        onCreateTask={() => {
          const m = moreMenu.message;
          if (!m) return;
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
        }}
        messageId={createTaskSourceMessage?._id || createTaskSourceMessage?.id}
        organizationId={orgIdForTask ? String(orgIdForTask) : null}
        currentUserId={currentUserId}
        messagePreview={
          createTaskSourceMessage ? plainTextForMessage(createTaskSourceMessage).slice(0, 500) : ''
        }
        onConfirmed={() => toast.success(t('orgPanel.taskFromAiOk'))}
      />

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
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/60 to-violet-500/60 text-xs font-bold text-white">
                    {(contact.name || 'U').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{contact.name}</div>
                    <div className="truncate text-xs text-gray-400">{contact.phone || contact.email || '-'}</div>
                  </div>
                </label>
              ))}
          </div>

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
              disabled={!selectedContactId}
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
