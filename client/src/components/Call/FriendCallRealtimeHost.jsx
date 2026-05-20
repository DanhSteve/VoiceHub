import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import friendCallService from '../../services/friendCallService';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Lắng nghe call:* trên socket /chat (toàn app) — cuộc gọi đến từ bạn bè.
 */
export default function FriendCallRealtimeHost() {
  const { openFriendCall } = useFriendCallSession();
  const navigate = useNavigate();
  const { on, off, connected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const { t } = useAppStrings();
  const [incoming, setIncoming] = useState(null);
  const [busy, setBusy] = useState(false);

  const meId = user?.userId ?? user?._id ?? user?.id;
  const meStr = meId != null && meId !== '' ? String(meId) : '';

  const clearIncoming = useCallback(() => {
    setIncoming(null);
    setBusy(false);
  }, []);

  const onInvite = useCallback(
    (payload) => {
      if (!payload?.callId || !payload?.roomId) return;
      setIncoming({
        callId: String(payload.callId),
        roomId: String(payload.roomId),
        fromUserId: String(payload.fromUserId || ''),
        media: payload.media === 'audio' ? 'audio' : 'video',
      });
    },
    []
  );

  const onInviteRevoked = useCallback(
    (payload) => {
      if (!incoming?.callId || !payload?.callId) return;
      if (String(payload.callId) !== incoming.callId) return;
      clearIncoming();
      toast(t('friendChat.incomingCallEnded'));
    },
    [incoming?.callId, clearIncoming, t]
  );

  useEffect(() => {
    if (!isAuthenticated || !connected || !meStr) return undefined;

    on('call:invite', onInvite);
    on('call:cancelled', onInviteRevoked);
    on('call:timeout', onInviteRevoked);

    return () => {
      off('call:invite', onInvite);
      off('call:cancelled', onInviteRevoked);
      off('call:timeout', onInviteRevoked);
    };
  }, [isAuthenticated, connected, meStr, on, off, onInvite, onInviteRevoked]);

  const handleAccept = async () => {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      await friendCallService.accept(incoming.callId);
      const peerLabel = incoming.fromUserId
        ? `${t('friendChat.friendDefault')} · ${String(incoming.fromUserId).slice(0, 8)}…`
        : '';
      if (typeof openFriendCall === 'function') {
        openFriendCall({
          roomId: incoming.roomId,
          callId: incoming.callId,
          media: incoming.media,
          peerLabel,
        });
      } else {
        navigate(
          `/voice/${encodeURIComponent(incoming.roomId)}?kind=free&callId=${encodeURIComponent(
            incoming.callId
          )}&friendCallMedia=${encodeURIComponent(incoming.media)}`
        );
      }
      clearIncoming();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || t('friendChat.callAcceptFail');
      toast.error(msg);
      clearIncoming();
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      await friendCallService.reject(incoming.callId);
    } catch {
      /* ignore */
    } finally {
      clearIncoming();
      setBusy(false);
    }
  };

  if (!incoming) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="friend-incoming-call-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col items-center text-center">
          {incoming.media === 'video' ? (
            <Video className="mb-3 h-12 w-12 text-violet-600" aria-hidden />
          ) : (
            <Phone className="mb-3 h-12 w-12 text-emerald-600" aria-hidden />
          )}
          <h2 id="friend-incoming-call-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {t('friendChat.incomingCallTitle')}
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {incoming.media === 'video'
              ? t('friendChat.incomingCallVideo')
              : t('friendChat.incomingCallAudio')}
            {incoming.fromUserId ? ` · ID ${incoming.fromUserId.slice(0, 8)}…` : ''}
          </p>
          <div className="mt-6 flex w-full gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleReject}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <PhoneOff className="h-4 w-4" />
              {t('friendChat.rejectCall')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleAccept}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Phone className="h-4 w-4" />
              {t('friendChat.acceptCall')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
