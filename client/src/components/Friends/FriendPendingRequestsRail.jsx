import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useFriendPending } from '../../hooks/queries';
import friendService from '../../services/friendService';
import UserAvatar from '../Shared/UserAvatar';
import { useAppStrings } from '../../locales/appStrings';
import { queryKeys } from '../../lib/queryKeys';
import {
  NOTIFICATIONS_REFRESH_EVENT,
  markFriendNotificationsResolved,
} from '../../services/notificationSync';

function profileFromRow(row) {
  const candidates = [row?.requester, row?.fromUser, row?.userId];
  for (const c of candidates) {
    if (c && typeof c === 'object') return c;
  }
  return null;
}

function requesterIdFromRow(row) {
  const profile = profileFromRow(row);
  if (profile) {
    return String(profile.userId || profile._id || profile.id || '').trim();
  }
  if (typeof row?.userId === 'string') return row.userId.trim();
  return String(row?.requester || '').trim();
}

/**
 * Lời mời kết bạn đến — cố định phía dưới rail bạn bè (trang tin nhắn).
 */
export default function FriendPendingRequestsRail({
  isDarkMode,
  defaultExpanded = false,
  onAccepted,
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { pendingList, pendingCount, isLoading, refetch } = useFriendPending();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [actingKey, setActingKey] = useState('');

  useEffect(() => {
    if (defaultExpanded && pendingCount > 0) setExpanded(true);
  }, [defaultExpanded, pendingCount]);

  const rows = useMemo(() => {
    return (Array.isArray(pendingList) ? pendingList : [])
      .map((row) => {
        const profile = profileFromRow(row) || {};
        const id = requesterIdFromRow(row);
        return {
          row,
          id,
          rowKey: String(row._id || row.id || id),
          name: profile.displayName || profile.username || profile.name || t('common.user'),
          avatar: profile.avatar,
        };
      })
      .filter((x) => x.id);
  }, [pendingList, t]);

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    refetch();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
    }
  }, [queryClient, refetch]);

  const accept = async (item) => {
    if (!item?.id || actingKey) return;
    setActingKey(item.rowKey);
    try {
      await friendService.acceptFriend(item.id);
      await markFriendNotificationsResolved(item.id);
      toast.success(t('friendChat.pendingAcceptOk'));
      invalidateAll();
      onAccepted?.(item);
    } catch (err) {
      toast.error(err.response?.data?.message || t('friendChat.pendingActionFail'));
    } finally {
      setActingKey('');
    }
  };

  const reject = async (item) => {
    if (!item?.id || actingKey) return;
    setActingKey(item.rowKey);
    try {
      await friendService.rejectFriend(item.id);
      await markFriendNotificationsResolved(item.id);
      toast.success(t('friendChat.pendingRejectOk'));
      invalidateAll();
    } catch (err) {
      toast.error(err.response?.data?.message || t('friendChat.pendingActionFail'));
    } finally {
      setActingKey('');
    }
  };

  if (!isLoading && pendingCount === 0) return null;

  const border = isDarkMode ? 'border-t border-white/[0.08]' : 'border-t border-slate-200';
  const muted = isDarkMode ? 'text-[#6d7380]' : 'text-slate-500';
  const card = isDarkMode
    ? 'rounded-xl border border-cyan-500/25 bg-cyan-500/[0.06]'
    : 'rounded-xl border border-cyan-200 bg-cyan-50/80';
  const nameCls = isDarkMode ? 'text-white' : 'text-slate-900';
  const subCls = isDarkMode ? 'text-[#8e9297]' : 'text-slate-600';
  const acceptBtn = isDarkMode
    ? 'rounded-lg bg-cyan-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-500 disabled:opacity-50'
    : 'rounded-lg bg-cyan-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-cyan-700 disabled:opacity-50';
  const rejectBtn = isDarkMode
    ? 'rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50'
    : 'rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

  return (
    <div className={`shrink-0 px-2 pb-2 pt-1 ${border}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`mb-1.5 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left ${isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100'}`}
        aria-expanded={expanded}
      >
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${muted}`}>
          {t('friendChat.pendingRequestsTitle')}
        </span>
        <span
          className={`min-w-[1.25rem] rounded-full px-1.5 text-center text-[10px] font-bold ${
            isDarkMode ? 'bg-cyan-500/25 text-cyan-200' : 'bg-cyan-100 text-cyan-800'
          }`}
        >
          {isLoading ? '…' : pendingCount}
        </span>
      </button>

      {expanded && (
        <div className="max-h-[min(240px,40vh)] space-y-2 overflow-y-auto scrollbar-overlay">
          {isLoading && (
            <p className={`py-2 text-center text-[10px] ${muted}`}>{t('friendChat.loadingRail')}</p>
          )}
          {!isLoading &&
            rows.map((item) => (
              <div key={item.rowKey} className={`p-2 ${card}`}>
                <div className="mb-2 flex items-center gap-2">
                  <UserAvatar avatar={item.avatar} name={item.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-xs font-semibold ${nameCls}`}>{item.name}</div>
                    <div className={`text-[10px] ${subCls}`}>{t('friendChat.pendingWantsFriend')}</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={Boolean(actingKey)}
                    className={`flex-1 ${acceptBtn}`}
                    onClick={() => accept(item)}
                  >
                    {t('friends.accept')}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(actingKey)}
                    className={`flex-1 ${rejectBtn}`}
                    onClick={() => reject(item)}
                  >
                    {t('friends.reject')}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
