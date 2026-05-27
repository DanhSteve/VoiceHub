import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Ban,
  Check,
  ChevronRight,
  Clock,
  FolderOpen,
  Forward,
  Loader2,
  MoreHorizontal,
  Plus,
  UserMinus,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import { meetingAPI } from '../../services/api/meetingAPI';
import { fetchMutualOrganizations } from '../../utils/mutualOrganizations';
import UserAvatar from '../Shared/UserAvatar';
import Modal from '../Shared/Modal';
import ChatAttachmentContextMenu from './ChatAttachmentContextMenu';
import { isAvatarImageUrl } from '../../utils/avatarDisplay';
import { buildMediaAttachmentMenuItems } from '../../utils/buildAttachmentMenuItems';
import { fileTypeBadge, formatFileSize } from '../../utils/chatFileDisplay';
import { entShell } from '../../theme/enterpriseWorkspace';
import {
  formatDmEventWhen,
  getDmRemindersForFriend,
} from '../../utils/dmCalendarReminders';

function formatShortDate(iso, localeTag) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(localeTag === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

const GRID_PREVIEW = 8;

/**
 * Sidebar phải — Thông tin hội thoại (chuẩn Zalo).
 */
export default function FriendChatRightPanel({
  friend,
  messages = [],
  attachments,
  currentUserId,
  onBlock,
  onSchedule,
  onArchive,
  isArchived = false,
  isBlocked = false,
  onOpenProfile,
  onOpenMediaAt,
  onViewAllMedia,
  onAttachmentAction,
  onOpenCalendarForFriend,
  onOpenMutualOrganization,
  onUnfriend,
  unfriendDisabled = false,
  unfriendLoading = false,
}) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { isDarkMode } = useTheme();
  const [openMedia, setOpenMedia] = useState(true);
  const [openFiles, setOpenFiles] = useState(true);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [fileMoreId, setFileMoreId] = useState(null);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [mutualOpen, setMutualOpen] = useState(false);
  const [peerReminders, setPeerReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [mutualOrgs, setMutualOrgs] = useState({
    loading: false,
    count: 0,
    organizations: [],
  });

  const { mediaItems = [], files = [] } = attachments || {};
  const gridMedia = mediaItems.slice(0, GRID_PREVIEW);

  const messageById = useMemo(() => {
    const map = new Map();
    for (const m of messages) {
      const id = m?._id || m?.id;
      if (id != null) map.set(String(id), m);
    }
    return map;
  }, [messages]);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const openMediaMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    const msg = messageById.get(String(item.id));
    const canDelete =
      msg &&
      currentUserId &&
      String(msg.senderId?._id || msg.senderId || '') === String(currentUserId);

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildMediaAttachmentMenuItems({
        item,
        message: msg,
        canDelete,
        t,
        onAction: onAttachmentAction,
      }),
    });
  };

  const openFileMenu = (e, file) => {
    e.preventDefault();
    e.stopPropagation();
    const msg = messageById.get(String(file.id));
    const canDelete =
      msg &&
      currentUserId &&
      String(msg.senderId?._id || msg.senderId || '') === String(currentUserId);

    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'open',
          label: t('friendChat.openFile'),
          icon: '📂',
          onClick: () => onAttachmentAction?.('open', { url: file.url }),
        },
        {
          id: 'share',
          label: t('friendChat.mediaShare'),
          icon: '↗',
          onClick: () => onAttachmentAction?.('share', { messageId: file.id, message: msg }),
        },
        {
          id: 'jump',
          label: t('friendChat.jumpToMessage'),
          icon: '💬',
          onClick: () => onAttachmentAction?.('jumpToMessage', { messageId: file.id }),
        },
        {
          id: 'save',
          label: t('friendChat.mediaSaveDevice'),
          icon: '💾',
          onClick: () =>
            onAttachmentAction?.('saveDevice', {
              messageId: file.id,
              url: file.url,
              name: file.name,
            }),
        },
        {
          id: 'delete',
          label: t('friendChat.mediaDeleteForMe'),
          icon: '🗑',
          danger: true,
          disabled: !canDelete,
          onClick: () => onAttachmentAction?.('delete', { messageId: file.id, message: msg }),
        },
      ],
    });
  };

  const sidebarTok = entShell(isDarkMode);
  const shell = `${sidebarTok.sidebar} hidden h-full min-h-0 w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden lg:flex`;
  const hairlineB = isDarkMode ? 'border-b border-white/[0.06]' : 'border-b border-slate-200';
  const hairlineT = isDarkMode ? 'border-t border-white/[0.06]' : 'border-t border-slate-200';
  const titleMain = sidebarTok.textPrimary;
  const labelMuted = isDarkMode ? 'text-gray-500' : 'text-slate-500';
  const sectionBtn = isDarkMode
    ? 'flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/[0.03]'
    : 'flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50';
  const thumbBg = isDarkMode ? 'bg-[#14151c]' : 'bg-slate-100';
  const quickRow = isDarkMode
    ? 'flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/[0.04]'
    : 'flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50';
  const actionCircle = isDarkMode
    ? 'flex flex-col items-center gap-1.5 rounded-xl p-2 text-[10px] text-gray-400 transition hover:bg-white/[0.05] hover:text-white'
    : 'flex flex-col items-center gap-1.5 rounded-xl p-2 text-[10px] text-slate-500 transition hover:bg-slate-100 hover:text-slate-900';
  const actionCircleDisabled = isDarkMode
    ? 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-gray-400'
    : 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-slate-500';

  const renderFileRow = (f) => {
    const mime = f.fileMeta?.mimeType || '';
    const badge = fileTypeBadge(f.name, mime);
    const sizeLabel = formatFileSize(f.fileMeta?.byteSize);
    const msg = messageById.get(String(f.id));
    const showActions = fileMoreId === String(f.id);

    return (
      <div
        key={f.id}
        className={`group px-3 py-2 transition ${
          isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-50'
        }`}
        onMouseEnter={() => setFileMoreId(String(f.id))}
        onMouseLeave={() => setFileMoreId(null)}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${badge.bg}`}
            onClick={() => f.url && onAttachmentAction?.('open', { url: f.url })}
            onContextMenu={(e) => openFileMenu(e, f)}
          >
            {badge.letter}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => f.url && onAttachmentAction?.('open', { url: f.url })}
            onContextMenu={(e) => openFileMenu(e, f)}
          >
            <div className={`truncate text-sm font-semibold ${titleMain}`}>{f.name}</div>
            <div className={`mt-0.5 flex items-center gap-1.5 text-xs ${labelMuted}`}>
              {sizeLabel}
              {f.url && <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} aria-hidden />}
            </div>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className={`text-xs tabular-nums ${labelMuted}`}>{formatShortDate(f.at, locale)}</span>
            {showActions && f.url && (
              <div className={`flex items-center gap-0.5 rounded-lg border p-0.5 shadow-md ${
                isDarkMode ? 'border-white/10 bg-[#1a1d26]' : 'border-slate-200 bg-white'
              }`}>
              <button
                type="button"
                title={t('friendChat.openFile')}
                onClick={() => onAttachmentAction?.('open', { url: f.url })}
                className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <FolderOpen className="h-4 w-4 text-slate-600 dark:text-gray-300" />
              </button>
              <button
                type="button"
                title={t('friendChat.mediaShare')}
                onClick={() => onAttachmentAction?.('share', { messageId: f.id, message: msg })}
                className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <Forward className="h-4 w-4 text-slate-600 dark:text-gray-300" />
              </button>
              <button
                type="button"
                title={t('friendChat.moreActions')}
                onClick={(e) => openFileMenu(e, f)}
                className="rounded p-1.5 hover:bg-slate-100 dark:hover:bg-white/10"
              >
                <MoreHorizontal className="h-4 w-4 text-slate-600 dark:text-gray-300" />
              </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const friendId = friend?.id != null ? String(friend.id) : '';

  const loadMutualOrgs = useCallback(
    (force = false) => {
      if (!friendId) {
        setMutualOrgs({ loading: false, count: 0, organizations: [] });
        return undefined;
      }
      let cancelled = false;
      setMutualOrgs((prev) => ({ ...prev, loading: true }));
      fetchMutualOrganizations(friendId, { force })
        .then((data) => {
          if (cancelled) return;
          const organizations = Array.isArray(data?.organizations) ? data.organizations : [];
          setMutualOrgs({
            loading: false,
            count: Number(data?.count ?? organizations.length) || 0,
            organizations,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setMutualOrgs({ loading: false, count: 0, organizations: [] });
          }
        });
      return () => {
        cancelled = true;
      };
    },
    [friendId]
  );

  useEffect(() => {
    const cleanup = loadMutualOrgs(false);
    return cleanup;
  }, [loadMutualOrgs]);

  useEffect(() => {
    if (!friendId || !remindersOpen) return undefined;
    let cancelled = false;
    setRemindersLoading(true);
    const local = getDmRemindersForFriend(friendId, friend?.name || '');
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + 120);

    meetingAPI
      .getMeetings({ startFrom: from.toISOString(), startTo: to.toISOString() })
      .then((res) => {
        if (cancelled) return;
        const body = res?.data ?? res;
        const data = body?.data ?? body;
        const meetings = Array.isArray(data?.meetings) ? data.meetings : [];
        const peerMeetings = meetings
          .filter((m) =>
            (m.participants || []).some(
              (p) => String(p.userId || p._id || p) === friendId
            )
          )
          .map((m) => ({
            id: m._id || m.id,
            title: m.title || t('calendar.tabEvent'),
            type: 'meeting',
            source: 'api',
            startAt: m.startTime,
            _startAt: m.startTime ? new Date(m.startTime) : null,
          }));
        const merged = [...local, ...peerMeetings].sort((a, b) => {
          const ta = a._startAt?.getTime?.() ?? (a.startAt ? new Date(a.startAt).getTime() : 0);
          const tb = b._startAt?.getTime?.() ?? (b.startAt ? new Date(b.startAt).getTime() : 0);
          return ta - tb;
        });
        setPeerReminders(merged);
      })
      .catch(() => {
        if (!cancelled) setPeerReminders(local);
      })
      .finally(() => {
        if (!cancelled) setRemindersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [friendId, friend?.name, remindersOpen, t]);

  const openRemindersModal = () => {
    const local = getDmRemindersForFriend(friendId, friend?.name || '');
    setPeerReminders(local);
    setRemindersOpen(true);
  };

  if (!friend) return null;

  const mutualCount = mutualOrgs.loading ? '…' : mutualOrgs.count;

  return (
    <aside className={shell}>
      <div className={`shrink-0 px-4 py-3 text-center ${hairlineB}`}>
        <h3 className={`text-sm font-bold ${titleMain}`}>{t('friendChat.profileTitle')}</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        <div className="flex flex-col items-center px-4 pb-4 pt-3">
          <UserAvatar
            avatar={friend.avatar}
            name={friend.name}
            size="xl"
            onClick={onOpenProfile}
            showOnline
            status={friend.status}
            ringClassName="bg-gradient-to-br from-cyan-600 to-teal-600 ring-4 ring-cyan-500/20 text-white shadow-lg"
            title={t('friendChat.profileTitle')}
          />
          <button
            type="button"
            onClick={onOpenProfile}
            className={`mt-3 text-base font-bold hover:underline ${titleMain}`}
          >
            {friend.name}
          </button>

          <div className="mt-4 grid w-full grid-cols-3 gap-1">
            <button type="button" onClick={onBlock} className={actionCircle}>
              <Ban className="h-5 w-5" />
              <span>{isBlocked ? t('friendChat.unblockUser') : t('friendChat.blockUser')}</span>
            </button>
            <button
              type="button"
              onClick={onSchedule}
              disabled={isBlocked}
              title={isBlocked ? 'Đã chặn người dùng, không thể đặt lịch' : t('friendChat.schedule')}
              className={`${actionCircle} ${isBlocked ? actionCircleDisabled : ''}`}
            >
              <Clock className="h-5 w-5" />
              <span>{t('friendChat.schedule')}</span>
            </button>
            <button type="button" onClick={onArchive} className={actionCircle}>
              <Archive className="h-5 w-5" />
              <span>{isArchived ? t('friendChat.showActiveChats') : t('friendChat.archiveConvo')}</span>
            </button>
          </div>
        </div>

        <div className={hairlineT}>
          <button type="button" className={quickRow} onClick={openRemindersModal}>
            <Clock className="h-5 w-5 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1">{t('friendChat.remindersList')}</span>
            <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </div>

        <section className={hairlineT}>
          <button type="button" onClick={() => setOpenMedia((o) => !o)} className={sectionBtn}>
            {t('friendChat.mediaSection')}
            <span className={labelMuted}>{openMedia ? '▾' : '▸'}</span>
          </button>
          {openMedia && (
            <div className="px-4 pb-3">
              {mediaItems.length === 0 ? (
                <p className={`py-2 text-xs ${labelMuted}`}>{t('friendChat.mediaEmpty')}</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {gridMedia.map((img, idx) => (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => onOpenMediaAt?.(idx)}
                        onContextMenu={(e) => openMediaMenu(e, img)}
                        className={`aspect-square overflow-hidden rounded-md ${thumbBg} transition hover:opacity-90`}
                      >
                        {isAvatarImageUrl(img.preview || img.url) ? (
                          img.kind === 'video' ? (
                            <video src={img.url} className="h-full w-full object-cover" muted />
                          ) : (
                            <img src={img.preview || img.url} alt="" className="h-full w-full object-cover" />
                          )
                        ) : (
                          <span className="flex h-full items-center justify-center text-lg">
                            {img.kind === 'video' ? '🎬' : '🖼️'}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={onViewAllMedia}
                    className={`mt-3 w-full rounded-lg py-2.5 text-center text-sm font-medium ${
                      isDarkMode
                        ? 'bg-white/[0.06] text-gray-300 hover:bg-white/[0.1]'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {t('friendChat.viewAllMedia')}
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className={hairlineT}>
          <button type="button" onClick={() => setOpenFiles((o) => !o)} className={sectionBtn}>
            {t('friendChat.filesSection')}
            <span className={labelMuted}>{openFiles ? '▾' : '▸'}</span>
          </button>
          {openFiles && (
            <div className="pb-3">
              {files.length === 0 ? (
                <p className={`px-4 py-2 text-xs ${labelMuted}`}>{t('friendChat.filesEmpty')}</p>
              ) : (
                files.map((f) => renderFileRow(f))
              )}
            </div>
          )}
        </section>
      </div>

      {onUnfriend && (
        <div className={`shrink-0 px-4 py-3 ${hairlineT}`}>
          <button
            type="button"
            onClick={onUnfriend}
            disabled={unfriendDisabled || unfriendLoading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              isDarkMode
                ? 'border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            {unfriendLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <UserMinus className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>{t('friendChat.unfriend')}</span>
          </button>
        </div>
      )}

      <ChatAttachmentContextMenu
        open={Boolean(ctxMenu)}
        x={ctxMenu?.x}
        y={ctxMenu?.y}
        items={ctxMenu?.items || []}
        onClose={closeMenu}
        isDarkMode={isDarkMode}
      />

      <Modal
        isOpen={remindersOpen}
        onClose={() => setRemindersOpen(false)}
        title={t('friendChat.remindersList')}
        size="md"
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setRemindersOpen(false);
              onOpenCalendarForFriend?.({ prefillType: 'reminder' });
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${
              isDarkMode
                ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                : 'bg-cyan-600 text-white hover:bg-cyan-700'
            }`}
          >
            <Plus className="h-4 w-4" />
            {t('friendChat.remindersAdd')}
          </button>
          {remindersLoading ? (
            <div className={`flex justify-center py-8 ${labelMuted}`}>
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : peerReminders.length === 0 ? (
            <p className={`py-6 text-center text-sm ${labelMuted}`}>{t('friendChat.remindersEmpty')}</p>
          ) : (
            <ul className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto">
              {peerReminders.map((ev) => (
                <li key={`${ev.source || 'local'}-${ev.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setRemindersOpen(false);
                      onOpenCalendarForFriend?.({ highlightEventId: ev.id });
                    }}
                    className={`flex w-full flex-col rounded-xl border px-3 py-2.5 text-left transition ${
                      isDarkMode
                        ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`text-sm font-semibold ${titleMain}`}>{ev.title}</span>
                    <span className={`mt-0.5 text-xs ${labelMuted}`}>
                      {formatDmEventWhen(ev, locale)}
                      {ev.type === 'meeting' && ev.source === 'api' ? ' · Meeting' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={mutualOpen}
        onClose={() => setMutualOpen(false)}
        title={t('friendChat.mutualGroups', { count: mutualOrgs.count })}
        size="md"
      >
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            disabled={mutualOrgs.loading}
            onClick={() => loadMutualOrgs(true)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              isDarkMode
                ? 'bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50'
            }`}
          >
            {t('friendChat.mutualOrgsRefresh')}
          </button>
        </div>
        {mutualOrgs.loading ? (
          <div className={`flex justify-center py-10 ${labelMuted}`}>
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : mutualOrgs.organizations.length === 0 ? (
          <p className={`py-8 text-center text-sm ${labelMuted}`}>{t('friendChat.mutualGroupsEmpty')}</p>
        ) : (
          <ul className="max-h-[min(50vh,400px)] space-y-2 overflow-y-auto">
            {mutualOrgs.organizations.map((org) => (
              <li key={String(org._id)}>
                <button
                  type="button"
                  onClick={() => {
                    setMutualOpen(false);
                    onOpenMutualOrganization?.(org);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    isDarkMode
                      ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      isDarkMode ? 'bg-cyan-500/20 text-cyan-200' : 'bg-cyan-100 text-cyan-800'
                    }`}
                  >
                    {(org.name || 'O').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-semibold ${titleMain}`}>{org.name}</div>
                    {org.myRole && (
                      <div className={`truncate text-xs ${labelMuted}`}>
                        {t('friendChat.mutualGroupsOpen')} · {org.myRole}
                      </div>
                    )}
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 ${labelMuted}`} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </aside>
  );
}
