import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsDown, MessageSquare, X } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import UnifiedChatComposer from '../Chat/UnifiedChatComposer';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';

function plainText(msg) {
  if (!msg) return '';
  const c = msg.content;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && typeof c.text === 'string') return c.text;
  return String(c || '');
}

function senderInitials(message) {
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    const n = u.displayName || u.username || u.fullName || '';
    if (typeof n === 'string' && n.trim()) {
      const p = n.trim().split(/\s+/);
      if (p.length === 1) return p[0].slice(0, 1).toUpperCase();
      return `${p[0][0] || ''}${p[p.length - 1][0] || ''}`.toUpperCase();
    }
  }
  return '?';
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
  onClose,
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
        className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3"
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
          <div className="flex flex-col justify-end gap-2.5 pb-1">
            {sortedMessages.map((message) => {
              const mid = message._id || message.id;
              const senderId = message?.senderId?._id || message?.senderId;
              const isMine = String(senderId || '') === String(currentUserId || '');
              const displayName = isMine
                ? t('orgPanel.you')
                : message.senderId?.displayName ||
                  message.senderId?.username ||
                  message.senderId?.fullName ||
                  t('orgPanel.member');

              return (
                <Fragment key={mid}>
                  <div
                    className={`flex w-full ${isMine ? 'justify-end' : 'justify-start gap-2'}`}
                  >
                    {!isMine && (
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600/80 to-fuchsia-700/80 text-[10px] font-bold text-white">
                        {senderInitials(message)}
                      </div>
                    )}
                    <div
                      className={`min-w-0 max-w-[92%] ${isMine ? 'ml-auto text-right' : ''}`}
                    >
                      <div
                        className={`mb-0.5 flex flex-wrap items-baseline gap-1.5 ${
                          isMine ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <span
                          className={`text-xs font-semibold ${
                            isDarkMode ? 'text-white' : 'text-slate-900'
                          }`}
                        >
                          {displayName}
                        </span>
                        <span
                          className={`text-[10px] ${
                            isDarkMode ? 'text-[#72767d]' : 'text-slate-400'
                          }`}
                        >
                          {message.createdAt
                            ? new Date(message.createdAt).toLocaleTimeString(
                                locale === 'en' ? 'en-US' : 'vi-VN',
                                { hour: '2-digit', minute: '2-digit' }
                              )
                            : ''}
                        </span>
                      </div>
                      <p
                        className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
                          isDarkMode ? 'text-[#dcddde]' : 'text-slate-800'
                        }`}
                      >
                        {plainText(message)}
                      </p>
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
        <UnifiedChatComposer
          value={messageInput}
          onChange={onChangeMessageInput}
          onSend={onSendMessage}
          placeholder={t('orgPanel.voiceChatComposerPh', { name: displayChannelName })}
          disabled={sendingMessage}
          sendDisabled={!messageInput.trim() || sendingMessage}
          showSendButton={false}
          showAiToggle={false}
          flatInner
          singleLine
          wrapperClassName="!p-0 !bg-transparent !border-0 !shadow-none"
        />
      </footer>
    </aside>
  );
}
