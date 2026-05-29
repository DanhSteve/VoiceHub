import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AtSign,
  Calendar,
  ChevronDown,
  Hash,
  Loader2,
  Paperclip,
  Search,
  SlidersHorizontal,
  User,
  X,
} from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import UserAvatar from '../../../components/Shared/UserAvatar';
import { useDebouncedValue } from '../useDebouncedValue';
import { PREFIX_TO_KEY, pushSearchHistory, serializeQueryState } from '../searchTypes';
import { fetchOrgMessageSearch, formatOrgMessageSearchError } from '../orgChatSearchConfig';
import { organizationAPI } from '../../../services/api/organizationAPI';
import { enrichMembershipsForSearch } from '../enrichOrgMembers';

function unwrap(payload) {
  return payload?.data ?? payload;
}

function formatMessagePreview(message) {
  const mt = String(message?.messageType || 'text').toLowerCase();
  const raw = String(message?.content || '');
  if (mt === 'business_card') {
    try {
      const card = JSON.parse(raw);
      const name = String(card?.fullName || card?.name || '—').trim() || '—';
      const phone = String(card?.phone || '').trim() || '-';
      const email = String(card?.email || '').trim() || '-';
      return `Danh thiếp · Tên: ${name} · SĐT: ${phone} · Email: ${email}`;
    } catch {
      return 'Danh thiếp';
    }
  }
  if (mt === 'image') return 'Hình ảnh';
  if (mt === 'file') return `Tệp: ${raw || 'Đính kèm'}`;
  if (mt === 'system') return raw || 'Tin nhắn hệ thống';
  return raw;
}

/** Panel tìm kiếm trong sidebar workspace tổ chức. */
export default function OrgWorkspaceSearchSidebar({
  organizationId,
  serverId,
  channels = [],
  isDarkMode,
  onJumpToResult,
  onClose,
}) {
  const { t } = useAppStrings();
  const scopeKey = useMemo(() => `org-chat:${organizationId || 'none'}`, [organizationId]);

  const [menuMode, setMenuMode] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [tokens, setTokens] = useState([]);
  const [memberRows, setMemberRows] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const abortRef = useRef(null);

  const debouncedKey = useDebouncedValue(
    JSON.stringify({ inputValue, tokens, organizationId }),
    320
  );

  useEffect(() => {
    if (!organizationId || (menuMode !== 'from' && menuMode !== 'mentions')) return;
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
  }, [organizationId, menuMode]);

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
      setResults(Array.isArray(msgs) ? msgs : []);
      pushSearchHistory(scopeKey, serializeQueryState(inputValue.trim(), tokens));
    } catch (e) {
      if (e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      setSearchError(formatOrgMessageSearchError(e) || 'Error');
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [organizationId, tokens, inputValue, scopeKey]);

  useEffect(() => {
    if (!organizationId) return;
    JSON.parse(debouncedKey || '{}');
    runSearch();
  }, [debouncedKey, organizationId, runSearch]);

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
    if (lower.startsWith('@')) return { key: 'mentions', rest: raw.slice(1).trim() };
    for (const [prefix, key] of Object.entries(PREFIX_TO_KEY)) {
      if (lower.startsWith(prefix)) return { key, rest: raw.slice(prefix.length).trim() };
    }
    return null;
  };

  const onChangeInput = (v) => {
    setInputValue(v);
    const det = detectPrefix(v);
    if (det?.key === 'from') setMenuMode('from');
    else if (det?.key === 'in') setMenuMode('in');
    else if (det?.key === 'has') setMenuMode('has');
    else if (det?.key === 'mentions') setMenuMode('mentions');
    else setMenuMode(null);
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

  const handleJump = (payload) => {
    onJumpToResult?.(payload);
    onClose?.();
  };

  const showEmpty =
    !menuMode &&
    !inputValue.trim() &&
    tokens.length === 0 &&
    !searchLoading &&
    results.length === 0;

  const filterBtnCls = `inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
    isDarkMode
      ? 'border-white/[0.08] bg-white/[0.04] text-[#dcddde] hover:bg-white/[0.08]'
      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
  }`;

  const renderResults = () => (
    <>
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
      <ul className="border-t">
        {results.length === 0 && !searchLoading && (
          <li className={`px-3 py-2 text-xs ${muted}`}>{t('searchUi.noResults')}</li>
        )}
        {results.map((m) => {
          const id = m._id || m.id;
          const preview = formatMessagePreview(m).slice(0, 140);
          const rid = m.roomId?._id || m.roomId;
          return (
            <li key={id}>
              <button
                type="button"
                className={`w-full px-3 py-2.5 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 ${
                  isDarkMode ? 'text-[#dcddde]' : 'text-slate-700'
                }`}
                onClick={() =>
                  handleJump({
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
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={`flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5 ${
          isDarkMode ? 'border-white/[0.06]' : 'border-slate-200'
        }`}
      >
        <h2 className={`truncate text-sm font-semibold ${titleCls}`}>
          {t('orgPanel.workspaceSearchTitle')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg p-1.5 ${muted} hover:opacity-90`}
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div
        className={`shrink-0 space-y-3 border-b px-3 py-3 ${
          isDarkMode ? 'border-white/[0.06]' : 'border-slate-200'
        }`}
      >
        <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${surface}`}>
          <Search className={`h-4 w-4 shrink-0 ${muted}`} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {tokens.map((tok) => (
              <span
                key={`${tok.key}-${tok.value}`}
                className={`inline-flex max-w-[180px] items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                  isDarkMode ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-800'
                }`}
              >
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
              className={`min-w-[80px] flex-1 bg-transparent text-sm outline-none ${titleCls} placeholder:opacity-60`}
              placeholder={t('orgPanel.searchSidebarPh')}
              value={inputValue}
              onChange={(e) => onChangeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs ${muted}`}>{t('orgPanel.searchFilterBy')}</span>
          <button
            type="button"
            className={filterBtnCls}
            onClick={() => setMenuMode(menuMode === 'from' ? null : 'from')}
          >
            <User className="h-3.5 w-3.5" />
            {t('orgPanel.searchSenderFilter')}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <button
            type="button"
            disabled
            title={t('searchUi.moreFiltersSub')}
            className={`${filterBtnCls} cursor-not-allowed opacity-50`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {t('orgPanel.searchDateFilter')}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <button
            type="button"
            className={`ml-auto rounded-lg p-1.5 ${muted} hover:opacity-90`}
            title={t('searchUi.filtersHeading')}
            onClick={() => setMenuMode(menuMode === 'filters' ? null : 'filters')}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {showEmpty && (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div
              className={`mb-4 flex h-24 w-24 items-center justify-center rounded-2xl ${
                isDarkMode ? 'bg-[#5865F2]/10' : 'bg-sky-50'
              }`}
            >
              <Search className={`h-12 w-12 ${isDarkMode ? 'text-[#5865F2]/50' : 'text-sky-300'}`} />
            </div>
            <p className={`max-w-[220px] text-sm leading-relaxed ${muted}`}>
              {t('orgPanel.searchEmptyHint')}
            </p>
          </div>
        )}

        {!showEmpty && !menuMode && renderResults()}

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
              <ul className="py-1">
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
                          row.avatar || null
                        )
                      }
                    >
                      <UserAvatar avatar={row.avatar} userId={row.userId} name={row.displayName} size="sm" />
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
            <ul className="py-1">
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
              <ul className="py-1">
                {filteredMembers.slice(0, 40).map((row) => (
                  <li key={`m-${row.userId}`}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"
                      onClick={() => addToken('mentions', String(row.userId), `@${row.displayName}`)}
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

        {menuMode === 'filters' && (
          <div>
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
    </div>
  );
}
