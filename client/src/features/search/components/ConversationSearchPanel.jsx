import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import PageSearchBar from './PageSearchBar';
import SearchFilterChips from './SearchFilterChips';
import { formatMessagePreview } from '../formatMessagePreview';

function formatTime(iso, locale) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

/**
 * Panel tìm trong hội thoại — kiểu Zalo (slide từ phải).
 */
export default function ConversationSearchPanel({
  open,
  onClose,
  isDarkMode,
  locale,
  query,
  onQueryChange,
  scope,
  onScopeChange,
  scopeOptions,
  messages = [],
  matchesMessage,
  onSelectMessage,
}) {
  const { t } = useAppStrings();

  const results = useMemo(() => {
    if (!open || !query?.trim()) return [];
    return (messages || []).filter((m) => matchesMessage?.(m)).slice(0, 50);
  }, [open, query, messages, matchesMessage]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const panel = isDarkMode
    ? 'bg-[#0b0e14] border-white/[0.08] text-white'
    : 'bg-white border-slate-200 text-slate-900';
  const overlay = isDarkMode ? 'bg-black/55' : 'bg-slate-900/35';
  const muted = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const rowHover = isDarkMode ? 'hover:bg-white/[0.05]' : 'hover:bg-slate-50';

  return (
    <>
      <button
        type="button"
        className={`fixed inset-0 z-[240] ${overlay}`}
        aria-label={t('common.close')}
        onClick={onClose}
      />
      <aside
        className={`fixed right-0 top-0 z-[250] flex h-full w-[min(360px,92vw)] flex-col border-l shadow-2xl ${panel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-search-title"
      >
        <header className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${isDarkMode ? 'border-white/[0.06]' : 'border-slate-200'}`}>
          <h2 id="conversation-search-title" className="text-base font-bold">
            {t('friendChat.conversationSearchTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-2 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="shrink-0 space-y-3 border-b px-4 py-3">
          <PageSearchBar
            value={query}
            onChange={onQueryChange}
            placeholder={t('friendChat.searchMessagesPlaceholder')}
            isDarkMode={isDarkMode}
            id="conversation-search-input"
            aria-label={t('friendChat.searchInConversationAria')}
            size="md"
          />
          <SearchFilterChips
            aria-label={t('friendChat.dmScopeLabel')}
            options={scopeOptions}
            value={scope}
            onChange={onScopeChange}
            isDarkMode={isDarkMode}
            size="sm"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay px-2 py-2">
          {!query?.trim() ? (
            <p className={`px-3 py-8 text-center text-sm leading-relaxed ${muted}`}>
              {t('friendChat.conversationSearchEmpty')}
            </p>
          ) : results.length === 0 ? (
            <p className={`px-3 py-8 text-center text-sm ${muted}`}>{t('friendChat.searchNoMatch')}</p>
          ) : (
            <ul className="space-y-0.5">
              {results.map((m) => {
                const mid = m._id || m.id;
                return (
                  <li key={String(mid)}>
                    <button
                      type="button"
                      onClick={() => onSelectMessage?.(m)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition ${rowHover}`}
                    >
                      <p className={`line-clamp-2 text-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        {formatMessagePreview(m, t)}
                      </p>
                      <p className={`mt-1 text-[11px] ${muted}`}>{formatTime(m.createdAt, locale)}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
