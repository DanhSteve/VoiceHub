import { useCallback, useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  Check,
  Clock,
  FolderOpen,
  Forward,
  MoreHorizontal,
  Pin,
  PinOff,
  UserPlus,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import UserAvatar from '../Shared/UserAvatar';
import ChatAttachmentContextMenu from './ChatAttachmentContextMenu';
import { isAvatarImageUrl } from '../../utils/avatarDisplay';
import { buildMediaAttachmentMenuItems } from '../../utils/buildAttachmentMenuItems';
import { fileTypeBadge, formatFileSize } from '../../utils/chatFileDisplay';

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
  onMute,
  onPin,
  onCreateGroup,
  isMuted = false,
  isPinned = false,
  onOpenProfile,
  onOpenMediaAt,
  onViewAllMedia,
  onAttachmentAction,
}) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { isDarkMode } = useTheme();
  const [openMedia, setOpenMedia] = useState(true);
  const [openFiles, setOpenFiles] = useState(true);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [fileMoreId, setFileMoreId] = useState(null);

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

  const shell = isDarkMode
    ? 'hidden h-full w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-[#0b0c14] lg:flex'
    : 'hidden h-full w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white lg:flex';
  const hairlineB = isDarkMode ? 'border-b border-white/[0.06]' : 'border-b border-slate-200';
  const hairlineT = isDarkMode ? 'border-t border-white/[0.06]' : 'border-t border-slate-200';
  const titleMain = isDarkMode ? 'text-white' : 'text-slate-900';
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

  if (!friend) return null;

  const showComingSoon = (key) => () => toast(t(key), { icon: 'ℹ️' });

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
            <button type="button" onClick={onMute} className={actionCircle}>
              {isMuted ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              <span>{isMuted ? t('friendChat.footerUnmute') : t('friendChat.footerMute')}</span>
            </button>
            <button type="button" onClick={onPin} className={actionCircle}>
              {isPinned ? <PinOff className="h-5 w-5" /> : <Pin className="h-5 w-5" />}
              <span>{isPinned ? t('friendChat.footerUnpin') : t('friendChat.footerPin')}</span>
            </button>
            <button type="button" onClick={onCreateGroup} className={actionCircle}>
              <UserPlus className="h-5 w-5" />
              <span>{t('friendChat.footerGroup')}</span>
            </button>
          </div>
        </div>

        <div className={hairlineT}>
          <button
            type="button"
            className={quickRow}
            onClick={showComingSoon('friendChat.remindersSoon')}
          >
            <Clock className="h-5 w-5 shrink-0 opacity-70" />
            <span>{t('friendChat.remindersList')}</span>
          </button>
          <button
            type="button"
            className={`${quickRow} ${hairlineT}`}
            onClick={showComingSoon('friendChat.mutualGroupsSoon')}
          >
            <Users className="h-5 w-5 shrink-0 opacity-70" />
            <span>{t('friendChat.mutualGroups', { count: 0 })}</span>
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

      <ChatAttachmentContextMenu
        open={Boolean(ctxMenu)}
        x={ctxMenu?.x}
        y={ctxMenu?.y}
        items={ctxMenu?.items || []}
        onClose={closeMenu}
        isDarkMode={isDarkMode}
      />
    </aside>
  );
}
