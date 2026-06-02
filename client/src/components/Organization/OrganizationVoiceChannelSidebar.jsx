import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsDown, MessageSquare, X } from 'lucide-react';
import ChatUploadProgressBar from '../Chat/ChatUploadProgressBar';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import UnifiedChatComposer from '../Chat/UnifiedChatComposer';
import { ChatMessageAttachmentBody } from '../Chat/ChatFileAttachment';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import {
  senderAvatarUrl,
  senderDisplayName,
  senderUserId,
} from '../../utils/orgChatSender';
import UserAvatar from '../Shared/UserAvatar';

function formatMessageTime(isoDate, locale) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Sidebar phải khi đang ở kênh voice: chat trong phòng (tin nhắn theo phiên họp).
 */
export default function OrganizationVoiceChannelSidebar({
  channelName = '',
  messages = [],
  messageInput = '',
  onChangeMessageInput,
  onSendMessage,
  sendingMessage = false,
  currentUserId,
  currentUser = null,
  onClose,
  canWriteInChannel = true,
  plusItems = [],
  actionItems = [],
  uploadProgress = null,
  uploadLabel = '',
}) {
  const { isDarkMode } = useTheme();
  const { locale } = useLocale();
  const { t } = useAppStrings();
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const displayChannelName = channelName
    ? channelNameToDisplaySlug(channelName, locale)
    : t('orgPanel.voiceChatFallback');

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
      ),
    [messages]
  );

  const scrollToLatest = useCallback((behavior = 'smooth') => {
    endRef.current?.scrollIntoView({ behavior, block: 'end' });
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
    isNearBottomRef.current = near;
    setShowJumpToLatest(!near);
  }, []);

  useEffect(() => {
    if (!isNearBottomRef.current) return;
    scrollToLatest('auto');
  }, [sortedMessages.length, scrollToLatest]);

  const shell = isDarkMode
    ? 'flex h-full min-h-0 flex-col bg-[#1e1f22] text-[#dcddde]'
    : 'flex h-full min-h-0 flex-col bg-slate-50 text-slate-800';

  return (
    <aside className={shell}>
      <header
        className={`flex shrink-0 items-center justify-between border-b px-3 py-2.5 ${
          isDarkMode ? 'border-white/[0.08]' : 'border-slate-200'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="h-4 w-4 shrink-0 text-[#b5bac1]" aria-hidden />
          <span
            className={`min-w-0 truncate text-sm font-semibold ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}
          >
            {displayChannelName}
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className={`rounded p-1 transition ${
              isDarkMode
                ? 'text-[#b5bac1] hover:bg-white/10 hover:text-white'
                : 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
            }`}
            aria-label={t('orgPanel.voiceChatClose')}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-2 py-3"
      >
        {sortedMessages.length === 0 ? (
          <div className="flex min-h-[min(280px,50vh)] flex-col items-center justify-center px-4 text-center">
            <MessageSquare
              className={`mb-3 h-12 w-12 ${isDarkMode ? 'text-[#949ba4]' : 'text-slate-400'}`}
              strokeWidth={1.25}
            />
            <h2
              className={`mb-1 text-lg font-bold ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              {t('orgPanel.voiceChatWelcome', { name: displayChannelName })}
            </h2>
            <p
              className={`max-w-xs text-sm ${
                isDarkMode ? 'text-[#949ba4]' : 'text-slate-500'
              }`}
            >
              {t('orgPanel.voiceChatWelcomeSub', { name: displayChannelName })}
            </p>
          </div>
        ) : (
          <div className="flex flex-col justify-end gap-3 pb-1">
            {sortedMessages.map((message) => {
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

              const displayName = senderDisplayName(
                message,
                isMine,
                currentUser,
                t('orgPanel.member')
              );
              const avatarUrl = senderAvatarUrl(message, isMine, currentUser);
              const roleCapsule = isMine
                ? t('orgPanel.roleYouCaps')
                : type === 'system'
                  ? t('orgPanel.roleSystemCaps')
                  : t('orgPanel.roleMemberCaps');

              const contentTextCls = isDarkMode ? 'text-[#dcddde]' : 'text-slate-800';

              return (
                <Fragment key={mid}>
                  <div className="flex w-full items-start justify-start gap-2">
                    <UserAvatar
                      avatar={avatarUrl}
                      userId={senderUserId(message, isMine, currentUser)}
                      name={displayName}
                      size="sm"
                      className="mt-0.5"
                      title={displayName}
                      ringClassName="shadow-inner"
                    />
                    <div className="min-w-0 max-w-full flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 justify-start">
                        <span
                          className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                        >
                          {displayName}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
                            isDarkMode
                              ? 'bg-white/[0.08] text-[#9aa0ae]'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {roleCapsule}
                        </span>
                        <span
                          className={`rounded px-1 py-0.5 text-[8px] font-medium ${
                            isDarkMode ? 'bg-white/[0.06] text-[#6d7380]' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {typeLabel}
                        </span>
                        <span
                          className={`text-[10px] tabular-nums ${
                            isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'
                          }`}
                        >
                          {formatMessageTime(message.createdAt, locale)}
                        </span>
                        {message.editedAt ? (
                          <span
                            className={`text-[9px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                          >
                            {t('orgPanel.edited')}
                          </span>
                        ) : null}
                      </div>
                      <div className={`text-sm leading-relaxed text-left ${contentTextCls}`}>
                        <ChatMessageAttachmentBody message={message} compact mentionVariant="org" />
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
            <div ref={endRef} className="h-px shrink-0" />
          </div>
        )}

        {showJumpToLatest && sortedMessages.length > 0 && (
          <button
            type="button"
            onClick={() => scrollToLatest('smooth')}
            className={`absolute bottom-3 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full shadow-lg ${
              isDarkMode
                ? 'bg-[#5865f2] text-white hover:bg-[#4752c4]'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
            aria-label={t('orgPanel.scrollToLatest')}
          >
            <ChevronsDown className="h-5 w-5" />
          </button>
        )}
      </div>

      <footer
        className={`shrink-0 border-t px-2 py-2 ${
          isDarkMode ? 'border-white/[0.08] bg-[#1e1f22]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <ChatUploadProgressBar percent={uploadProgress} label={uploadLabel} />
        <UnifiedChatComposer
          value={messageInput}
          onChange={onChangeMessageInput}
          onSend={onSendMessage}
          placeholder={t('orgPanel.voiceChatComposerPh', { name: displayChannelName })}
          disabled={sendingMessage || !canWriteInChannel}
          sendDisabled={!messageInput.trim() || sendingMessage || !canWriteInChannel}
          showSendButton={false}
          showAiToggle={false}
          flatInner
          plusItems={canWriteInChannel ? plusItems : []}
          actionItems={actionItems}
          wrapperClassName="!p-0 !bg-transparent !border-0 !shadow-none"
        />
      </footer>
    </aside>
  );
}
