import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  fetchOrgMessageSearch,
  formatOrgMessageSearchError,
} from '../search/orgChatSearchConfig';

function decodeFileNameCandidate(raw) {
  let out = String(raw || '').trim();
  if (!out) return '';
  out = out.replace(/\+/g, ' ');
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-f]{2}/i.test(out)) break;
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
  }
  return out.trim();
}

function attachmentDisplayName(message, fallback) {
  const fm = message?.fileMeta;
  const fromMeta = decodeFileNameCandidate(fm?.originalName);
  if (fromMeta) return fromMeta;
  const content = String(message?.content || '');
  if (/^https?:\/\//i.test(content)) {
    try {
      const u = new URL(content);
      const last = u.pathname.split('/').filter(Boolean).pop() || '';
      const decoded = decodeFileNameCandidate(last);
      if (decoded) return decoded;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

function formatRelativeTime(iso, locale) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN', {
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
 * Danh sách tệp đính kèm kênh org — GET /messages/search?hasAttachment=true
 * (chat-service lọc roomId qua accessible-channel-ids / ChannelRoleAccess).
 */
export default function OrgMemberSidebarAttachments({
  organizationId,
  channels = [],
  selectedChannelId = '',
  channelPermissionMatrix = {},
  isDarkMode = true,
  onJumpToChannel,
}) {
  const { t, locale } = useAppStrings();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const abortRef = useRef(null);

  const channelNameById = useMemo(() => {
    const map = new Map();
    for (const ch of channels || []) {
      const id = String(ch?._id || ch?.id || '');
      if (id) map.set(id, String(ch?.name || ch?.title || id));
    }
    return map;
  }, [channels]);

  const readableChannelIds = useMemo(() => {
    const ids = new Set();
    const matrix = channelPermissionMatrix || {};
    for (const [chId, perms] of Object.entries(matrix)) {
      if (perms?.canRead || perms?.canSee) ids.add(String(chId));
    }
    return ids;
  }, [channelPermissionMatrix]);

  const narrowRoomId = selectedChannelId ? String(selectedChannelId) : '';

  const loadPage = useCallback(
    async (pageNum, append) => {
      if (!organizationId) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError('');
      try {
        const data = await fetchOrgMessageSearch([], '', {
          organizationId,
          narrowRoomId: narrowRoomId || undefined,
          hasAttachment: true,
          page: pageNum,
          limit: 30,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        let messages = Array.isArray(data?.messages) ? data.messages : [];
        if (readableChannelIds.size > 0) {
          messages = messages.filter((m) => {
            const rid = String(m?.roomId || m?.channelId || '');
            return !rid || readableChannelIds.has(rid);
          });
        }
        const mapped = messages.map((m) => {
          const roomId = String(m?.roomId || m?.channelId || '');
          const mt = String(m?.messageType || 'file').toLowerCase();
          const url = /^https?:\/\//i.test(String(m?.content || ''))
            ? String(m.content).trim()
            : null;
          return {
            id: String(m._id || m.id || `${roomId}-${m.createdAt}`),
            roomId,
            channelName:
              channelNameById.get(roomId) ||
              t('organizations.memberSidebarFilesUnknownChannel'),
            messageType: mt,
            name: attachmentDisplayName(m, t('organizations.memberSidebarFilesUntitled')),
            url,
            createdAt: m.createdAt,
          };
        });
        setTotalPages(Math.max(1, Number(data?.totalPages) || 1));
        setPage(pageNum);
        setItems((prev) => (append ? [...prev, ...mapped] : mapped));
      } catch (err) {
        if (err?.name === 'AbortError' || ac.signal.aborted) return;
        setError(
          formatOrgMessageSearchError(err) || t('organizations.memberSidebarFilesLoadError')
        );
        if (!append) setItems([]);
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [organizationId, narrowRoomId, readableChannelIds, channelNameById, t]
  );

  useEffect(() => {
    if (!organizationId) {
      setItems([]);
      return undefined;
    }
    loadPage(1, false);
    return () => abortRef.current?.abort();
  }, [organizationId, narrowRoomId, loadPage]);

  const hasMore = page < totalPages;

  const muted = isDarkMode ? 'text-[#6d7380]' : 'text-slate-500';
  const row = isDarkMode
    ? 'flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2 transition hover:bg-white/[0.06]'
    : 'flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition hover:bg-slate-50';
  const title = isDarkMode ? 'text-white' : 'text-slate-900';
  const sub = isDarkMode ? 'text-[#8b919c]' : 'text-slate-500';

  if (loading && items.length === 0) {
    return (
      <div className={`px-1 py-8 text-center ${muted}`}>
        <Loader2 className="mx-auto h-5 w-5 animate-spin opacity-70" />
        <p className="mt-2 text-xs">{t('organizations.memberSidebarFilesLoading')}</p>
      </div>
    );
  }

  if (error && items.length === 0) {
    return <p className="px-1 py-6 text-center text-xs text-rose-400">{error}</p>;
  }

  if (!loading && items.length === 0) {
    return (
      <p className={`px-1 py-6 text-center text-xs ${muted}`}>
        {narrowRoomId
          ? t('organizations.memberSidebarFilesEmptyChannel')
          : t('organizations.memberSidebarFilesEmpty')}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const isImage = item.messageType === 'image';
        const Icon = isImage ? ImageIcon : FileText;
        return (
          <div key={item.id} className={row}>
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                isDarkMode ? 'bg-white/[0.06] text-cyan-300' : 'bg-sky-100 text-cyan-700'
              }`}
            >
              {isImage && item.url ? (
                <img src={item.url} alt="" className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className={`block w-full truncate text-left text-xs font-semibold ${title} hover:underline`}
                title={item.name}
                onClick={() =>
                  onJumpToChannel?.({
                    organizationId,
                    roomId: item.roomId,
                    messageId: item.id,
                  })
                }
              >
                {item.name}
              </button>
              <p className={`truncate text-[10px] ${sub}`}>
                #{item.channelName} · {formatRelativeTime(item.createdAt, locale)}
              </p>
            </div>
            {item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`shrink-0 rounded p-1 ${
                  isDarkMode
                    ? 'text-gray-400 hover:bg-white/10'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title={t('organizations.memberSidebarFilesOpen')}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        );
      })}
      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => loadPage(page + 1, true)}
          className={`mt-2 w-full rounded-lg py-2 text-xs font-semibold ${
            isDarkMode
              ? 'bg-white/[0.06] text-cyan-300 hover:bg-white/10 disabled:opacity-50'
              : 'bg-sky-100 text-cyan-800 hover:bg-sky-200/80 disabled:opacity-50'
          }`}
        >
          {loadingMore
            ? t('organizations.memberSidebarFilesLoading')
            : t('organizations.memberSidebarFilesLoadMore')}
        </button>
      ) : null}
    </div>
  );
}
