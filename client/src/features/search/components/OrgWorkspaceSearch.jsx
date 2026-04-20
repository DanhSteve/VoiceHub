import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Hash,
  History,
  Loader2,
  Paperclip,
  Search,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { useDebouncedValue } from '../useDebouncedValue';
import {
  clearSearchHistory,
  deserializeQueryState,
  loadSearchHistory,
  PREFIX_TO_KEY,
  pushSearchHistory,
  serializeQueryState,
} from '../searchTypes';
import { fetchOrgMessageSearch } from '../orgChatSearchConfig';
import { organizationAPI } from '../../../services/api/organizationAPI';
import { enrichMembershipsForSearch } from '../enrichOrgMembers';

function unwrap(payload) {
  return payload?.data ?? payload;
}

/**
 * Thanh tìm kiếm workspace tổ chức (Discord-style): bộ lọc + lịch sử + gợi ý + kết quả.
 */
export default function OrgWorkspaceSearch({
  organizationId,
  serverId,
  channels = [],
  isDarkMode,
  onJumpToResult,
}) {
  const { t } = useAppStrings();
  const scopeKey = useMemo(() => `org-chat:${organizationId || 'none'}`, [organizationId]);

  const [open, setOpen] = useState(false);
  const [menuMode, setMenuMode] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [tokens, setTokens] = useState([]);
  const [memberRows, setMemberRows] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const abortRef = useRef(null);
  const rootRef = useRef(null);

  const debouncedKey = useDebouncedValue(
    JSON.stringify({ inputValue, tokens, organizationId }),
    320
  );

  const historyEntries = useMemo(() => loadSearchHistory(scopeKey), [scopeKey, open]);

  useEffect(() => {
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setMenuMode(null);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!organizationId || !open || (menuMode !== 'from' && menuMode !== 'mentions')) return;
    let cancelled = false;
    setLoadingMembers(true);
    organizationAPI
      .getMembers(organizationId)
      .then(async (res) => {
        if (cancelled) return;
        const raw = unwrap(res);
        const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        const enriched = await enrichMembershipsForSearch(list);
        if (!cancelled) setMemberRows(enriched);
      })
      .catch(() => {
        if (!cancelled) setMemberRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, open, menuMode]);

  const runSearch = useCallback(async () => {
    if (!organizationId) return;
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSearchLoading(true);
    setSearchError('');
    try {
      const data = await fetchOrgMessageSearch(tokens, inputValue, {
        organizationId,
        page: 1,
        limit: 25,
        signal: ac.signal,
      });
      const msgs = data?.messages ?? data?.data?.messages ?? [];
      const list = Array.isArray(msgs) ? msgs : [];
      setResults(list);
      pushSearchHistory(scopeKey, serializeQueryState(inputValue.trim(), tokens));
    } catch (e) {
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      setSearchError(e?.response?.data?.message || e?.message || 'Error');
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [organizationId, tokens, inputValue, scopeKey]);

  useEffect(() => {
    if (!open || !organizationId) return;
    JSON.parse(debouncedKey || '{}');
    runSearch();
  }, [debouncedKey, open, organizationId, runSearch]);

  const addToken = (key, value, label, avatar) => {
    setTokens((prev) => {
      const next = prev.filter((x) => x.key !== key);
      next.push({ key, value, label, avatar });
      return next;
    });
    setInputValue('');
    setMenuMode(null);
  };

  const detectPrefix = (raw) => {
    const lower = raw.toLowerCase();
    for (const [prefix, key] of Object.entries(PREFIX_TO_KEY)) {
      if (lower.startsWith(prefix)) return { key, rest: raw.slice(prefix.length).trim() };
    }
    return null;
  };

  const onChangeInput = (v) => {
    setInputValue(v);
    const det = detectPrefix(v);
    if (det?.key === 'from') {
      setMenuMode('from');
      setOpen(true);
    } else if (det?.key === 'in') {
      setMenuMode('in');
      setOpen(true);
    } else if (det?.key === 'has') {
      setMenuMode('has');
      setOpen(true);
    } else if (det?.key === 'mentions') {
      setMenuMode('mentions');
      setOpen(true);
    } else {
      setMenuMode(null);
    }
  };

  const surface = isDarkMode
    ? 'border-white/[0.08] bg-[#12151f] text-[#e3e5e8]'
    : 'border-slate-200 bg-white text-slate-900';

  const muted = isDarkMode ? 'text-[#949ba4]' : 'text-slate-500';
  const titleCls = isDarkMode ? 'text-white' : 'text-slate-900';

  const filteredMembers = useMemo(() => {
    const det = detectPrefix(inputValue);
    const q = (det?.key === 'from' || det?.key === 'mentions' ? det.rest : inputValue).trim().toLowerCase();
    return memberRows.filter((m) => {
      const name = `${m.displayName || ''} ${m.username || ''}`.toLowerCase();
      return !q || name.includes(q);
    });
  }, [memberRows, inputValue]);

  const applyHistoryEntry = (entry) => {
    const { t: ft, f } = deserializeQueryState(entry);
    setInputValue(ft);
    setTokens(f);
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 md:max-w-md">
      <div className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${surface}`}>
        <Search className={`h-4 w-4 shrink-0 ${muted}`} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {tokens.map((tok) => (
            <span
              key={`${tok.key}-${tok.value}`}
              className={`inline-flex max-w-[200px] items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                isDarkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {tok.key === 'from' && tok.avatar && (
                <img src={tok.avatar} alt="" className="h-4 w-4 rounded-full object-cover" />
              )}
              <span className="truncate">
                {tok.key === 'from' && 'từ'}
                {tok.key === 'in' && 'trong'}
                {tok.key === 'has' && 'có'}
                {tok.key === 'mentions' && 'đề cập'}: {tok.label}
              </span>
              <button
                type="button"
                className="rounded p-0.5 hover:bg-black/10"
                onClick={() =>
                  setTokens((p) => p.filter((x) => !(x.key === tok.key && x.value === tok.value)))
                }
                aria-label={t('common.delete')}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            className={`min-w-[120px] flex-1 bg-transparent text-sm outline-none ${muted} placeholder:opacity-70`}
            placeholder={t('searchUi.placeholder')}
            value={inputValue}
            onFocus={() => setOpen(true)}
            onChange={(e) => onChangeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
              }
            }}
          />
        </div>
        <button
          type="button"
          className={`rounded-lg p-1 ${muted} hover:opacity-90`}
          onClick={() => {
            setOpen((o) => !o);
            setMenuMode(null);
          }}
          aria-expanded={open}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div
          className={`absolute right-0 z-50 mt-1 w-full min-w-[300px] max-w-lg overflow-hidden rounded-xl border shadow-xl ${
            isDarkMode ? 'border-white/[0.08] bg-[#1e2127]' : 'border-slate-200 bg-white'
          }`}
        >
          {!menuMode && (
            <div className="max-h-[min(70vh,480px)] overflow-y-auto">
              <div className={`border-b px-3 py-2 text-xs font-semibold uppercase ${muted}`}>
                {t('searchUi.filtersHeading')}
              </div>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => setMenuMode('from')}
              >
                <User className="mt-0.5 h-4 w-4 shrink-0 text-[#5865F2]" />
                <span>
                  <span className={`block font-medium ${titleCls}`}>{t('searchUi.fromUser')}</span>
                  <span className={`text-xs ${muted}`}>{t('searchUi.fromHint')}</span>
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => setMenuMode('in')}
              >
                <Hash className="mt-0.5 h-4 w-4 shrink-0 text-[#5865F2]" />
                <span>
                  <span className={`block font-medium ${titleCls}`}>{t('searchUi.inChannel')}</span>
                  <span className={`text-xs ${muted}`}>{t('searchUi.inHint')}</span>
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => setMenuMode('has')}
              >
                <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-[#5865F2]" />
                <span>
                  <span className={`block font-medium ${titleCls}`}>{t('searchUi.hasContent')}</span>
                  <span className={`text-xs ${muted}`}>{t('searchUi.hasHint')}</span>
                </span>
              </button>
              <button
                type="button"
                className="flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => setMenuMode('mentions')}
              >
                <AtSign className="mt-0.5 h-4 w-4 shrink-0 text-[#5865F2]" />
                <span>
                  <span className={`block font-medium ${titleCls}`}>{t('searchUi.mentionsUser')}</span>
                  <span className={`text-xs ${muted}`}>{t('searchUi.mentionsHint')}</span>
                </span>
              </button>
              <div className={`px-3 py-2 text-xs ${muted}`}>
                <SlidersHorizontal className="mr-1 inline h-3 w-3" />
                {t('searchUi.moreFilters')}
                <div className="text-[11px] opacity-80">{t('searchUi.moreFiltersSub')}</div>
              </div>

              <div className={`flex items-center justify-between border-t px-3 py-2 ${muted}`}>
                <span className="flex items-center gap-1 text-xs font-semibold uppercase">
                  <History className="h-3.5 w-3.5" />
                  {t('searchUi.historyHeading')}
                </span>
                <button
                  type="button"
                  className="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10"
                  title={t('searchUi.clearHistory')}
                  onClick={() => clearSearchHistory(scopeKey)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {historyEntries.length === 0 && <p className={`px-3 py-2 text-xs ${muted}`}>—</p>}
              {historyEntries.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5"
                  onClick={() => applyHistoryEntry(h)}
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{deserializeQueryState(h).t || '…'}</span>
                </button>
              ))}

              <div className={`border-t px-3 py-2 ${muted}`}>
                {searchLoading ? (
                  <span className="flex items-center gap-2 text-xs">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('searchUi.searching')}
                  </span>
                ) : searchError ? (
                  <span className="text-xs text-red-500">{searchError}</span>
                ) : (
                  <span className="text-xs">{t('searchUi.openInChannel')}</span>
                )}
              </div>
              <ul className="max-h-40 overflow-y-auto border-t">
                {results.length === 0 && !searchLoading && (
                  <li className={`px-3 py-2 text-xs ${muted}`}>{t('searchUi.noResults')}</li>
                )}
                {results.map((m) => {
                  const id = m._id || m.id;
                  const preview = String(m.content || '').slice(0, 120);
                  const rid = m.roomId?._id || m.roomId;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={`w-full px-3 py-2 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 ${
                          isDarkMode ? 'text-[#dcddde]' : 'text-slate-700'
                        }`}
                        onClick={() =>
                          onJumpToResult?.({
                            messageId: id,
                            roomId: rid,
                            organizationId,
                            serverId,
                          })
                        }
                      >
                        <span className="line-clamp-2">{preview}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {menuMode === 'from' && (
            <div>
              <div className={`border-b px-3 py-2 text-sm font-semibold ${titleCls}`}>
                {t('searchUi.fromUserTitle')}
              </div>
              {loadingMembers ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-[#5865F2]" />
                </div>
              ) : (
                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredMembers.slice(0, 40).map((row) => (
                    <li key={row.userId}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() =>
                          addToken(
                            'from',
                            String(row.userId),
                            row.displayName,
                            row.avatar && String(row.avatar).startsWith('http') ? row.avatar : null
                          )
                        }
                      >
                        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-white/10 text-lg">
                          {row.avatar && String(row.avatar).startsWith('http') ? (
                            <img src={row.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            '👤'
                          )}
                        </span>
                        <span>
                          <span className={`block font-medium ${titleCls}`}>{row.displayName}</span>
                          <span className={`text-xs ${muted}`}>{row.username || ''}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={`w-full border-t px-3 py-2 text-xs ${muted}`}
                onClick={() => setMenuMode(null)}
              >
                ←
              </button>
            </div>
          )}

          {menuMode === 'in' && (
            <div>
              <div className={`border-b px-3 py-2 text-sm font-semibold ${titleCls}`}>
                {t('searchUi.inChannelTitle')}
              </div>
              <ul className="max-h-56 overflow-y-auto py-1">
                {channels
                  .filter((c) => c.type !== 'voice')
                  .map((ch) => (
                    <li key={ch._id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() => addToken('in', String(ch._id), `#${ch.name || 'channel'}`)}
                      >
                        <Hash className="h-4 w-4 text-[#5865F2]" />
                        <span className={titleCls}>{ch.name || ch._id}</span>
                      </button>
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                className={`w-full border-t px-3 py-2 text-xs ${muted}`}
                onClick={() => setMenuMode(null)}
              >
                ←
              </button>
            </div>
          )}

          {menuMode === 'has' && (
            <div>
              <div className={`border-b px-3 py-2 text-sm font-semibold ${titleCls}`}>có:</div>
              <ul className="py-1">
                {[
                  { value: 'link', label: t('searchUi.hasLink') },
                  { value: 'file', label: t('searchUi.hasFile') },
                  { value: 'image', label: t('searchUi.hasImage') },
                  { value: 'embed', label: t('searchUi.hasEmbed') },
                ].map((opt) => (
                  <li key={opt.value}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                      onClick={() => addToken('has', opt.value, opt.label)}
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`w-full border-t px-3 py-2 text-xs ${muted}`}
                onClick={() => setMenuMode(null)}
              >
                ←
              </button>
            </div>
          )}

          {menuMode === 'mentions' && (
            <div>
              <div className={`border-b px-3 py-2 text-sm font-semibold ${titleCls}`}>
                {t('searchUi.mentionsUser')}
              </div>
              {loadingMembers ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-[#5865F2]" />
                </div>
              ) : (
                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredMembers.slice(0, 40).map((row) => (
                    <li key={`m-${row.userId}`}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                        onClick={() =>
                          addToken('mentions', String(row.userId), `@${row.displayName}`)
                        }
                      >
                        <AtSign className="h-4 w-4 text-[#5865F2]" />
                        <span className={titleCls}>{row.displayName}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className={`w-full border-t px-3 py-2 text-xs ${muted}`}
                onClick={() => setMenuMode(null)}
              >
                ←
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
