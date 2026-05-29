import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import friendCallService from '../../services/friendCallService';
import userService from '../../services/userService';
import { useFriendsList } from '../../hooks/queries';
import { useAppStrings } from '../../locales/appStrings';
import { getUserDisplayName } from '../../utils/helpers';
import {
  resolveFriendDisplayNameFromList,
  resolveFriendProfileFromList,
} from '../../utils/resolveFriendDisplayName';

/**
 * Lắng nghe call:* trên socket /chat (toàn app) — cuộc gọi đến từ bạn bè.
 */
export default function FriendCallRealtimeHost() {
  const {
    session,
    outboundRinging,
    openFriendCall,
    closeFriendCall,
    clearOutboundRinging,
    cancelOutboundRinging,
  } = useFriendCallSession();
  const { on, off, connected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const { t } = useAppStrings();
  const [incoming, setIncoming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resolvedCallerName, setResolvedCallerName] = useState('');
  const friendsQuery = useFriendsList({ enabled: isAuthenticated });

  const meId = user?.userId ?? user?._id ?? user?.id;
  const meStr = meId != null && meId !== '' ? String(meId) : '';

  const clearIncoming = useCallback(() => {
    setIncoming(null);
    setBusy(false);
  }, []);

  /** Vào modal SFU 1-1 — không điều hướng /voice (lobby cuộc họp). */
  const enterFriendCall = useCallback(
    (payload, { peerUserId, peerLabel, peerAvatar } = {}) => {
      if (!openFriendCall || !payload?.callId || !payload?.roomId) {
        console.error('[FriendCall] openFriendCall unavailable or missing room/call id');
        toast.error(t('friendChat.callAcceptFail'));
        return;
      }
      const media = payload.media === 'audio' ? 'audio' : 'video';
      openFriendCall({
        roomId: String(payload.roomId),
        callId: String(payload.callId),
        media,
        peerUserId: String(peerUserId || payload.fromUserId || '').trim(),
        peerLabel: String(peerLabel || payload.fromDisplayName || '').trim(),
        peerAvatar: peerAvatar ?? null,
      });
      clearOutboundRinging();
      clearIncoming();
    },
    [openFriendCall, clearOutboundRinging, clearIncoming, t]
  );

  const onInvite = useCallback(
    (payload) => {
      if (!payload?.callId || !payload?.roomId) return;
      const fromUserId = String(payload.fromUserId || '');
      const fromPayloadName = String(payload.fromDisplayName || payload.callerDisplayName || '').trim();
      setIncoming({
        callId: String(payload.callId),
        roomId: String(payload.roomId),
        fromUserId,
        callerName: fromPayloadName,
        media: payload.media === 'audio' ? 'audio' : 'video',
      });
    },
    []
  );

  useEffect(() => {
    if (!incoming?.fromUserId) {
      setResolvedCallerName('');
      return undefined;
    }
    if (incoming.callerName) {
      setResolvedCallerName(incoming.callerName);
      return undefined;
    }
    const fromFriends = resolveFriendDisplayNameFromList(friendsQuery.data, incoming.fromUserId);
    if (fromFriends) {
      setResolvedCallerName(fromFriends);
      return undefined;
    }
    let cancelled = false;
    userService
      .getProfile(incoming.fromUserId)
      .then((resp) => {
        if (cancelled) return;
        const u = resp?.data?.data ?? resp?.data;
        const name =
          String(u?.displayName || u?.username || '').trim() || getUserDisplayName(u);
        if (name) setResolvedCallerName(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [incoming?.fromUserId, incoming?.callerName, friendsQuery.data]);

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

  /** call:accepted — caller (đã ring) hoặc callee (vừa nhấn chấp nhận). */
  useEffect(() => {
    if (!isAuthenticated || !connected) return undefined;

    const onAccepted = (p) => {
      if (!p?.callId || !p?.roomId) return;
      const callId = String(p.callId);

      if (outboundRinging && String(outboundRinging.callId) === callId) {
        const calleeId = String(outboundRinging.calleeId || p.toUserId || '');
        const prof = resolveFriendProfileFromList(friendsQuery.data, calleeId);
        enterFriendCall(p, {
          peerUserId: calleeId,
          peerLabel: outboundRinging.peerLabel || prof.name || '',
          peerAvatar: prof.avatar,
        });
        return;
      }

      if (incoming && String(incoming.callId) === callId) {
        const prof = resolveFriendProfileFromList(friendsQuery.data, incoming.fromUserId);
        enterFriendCall(p, {
          peerUserId: incoming.fromUserId,
          peerLabel:
            incoming.callerName ||
            resolvedCallerName ||
            prof.name ||
            p.fromDisplayName ||
            '',
          peerAvatar: prof.avatar,
        });
      }
    };

    const onRejected = (p) => {
      if (outboundRinging && String(p?.callId) === String(outboundRinging.callId)) {
        clearOutboundRinging();
        toast(t('friendChat.callRejected'));
      }
      if (incoming && String(p?.callId) === String(incoming.callId)) {
        clearIncoming();
      }
    };

    const onCancelled = (p) => {
      const id = String(p?.callId || '');
      if (outboundRinging && String(outboundRinging.callId) === id) clearOutboundRinging();
      if (incoming && String(incoming.callId) === id) clearIncoming();
    };

    const onTimeout = (p) => {
      const id = String(p?.callId || '');
      if (outboundRinging && String(outboundRinging.callId) === id) {
        clearOutboundRinging();
        toast(t('friendChat.callTimeout'));
      }
      if (incoming && String(incoming.callId) === id) clearIncoming();
    };

    const onEnded = (p) => {
      const id = String(p?.callId || '');
      if (outboundRinging && String(outboundRinging.callId) === id) clearOutboundRinging();
      if (incoming && String(incoming.callId) === id) clearIncoming();
    };

    on('call:accepted', onAccepted);
    on('call:rejected', onRejected);
    on('call:cancelled', onCancelled);
    on('call:timeout', onTimeout);
    on('call:ended', onEnded);

    return () => {
      off('call:accepted', onAccepted);
      off('call:rejected', onRejected);
      off('call:cancelled', onCancelled);
      off('call:timeout', onTimeout);
      off('call:ended', onEnded);
    };
  }, [
    isAuthenticated,
    connected,
    outboundRinging,
    incoming,
    resolvedCallerName,
    friendsQuery.data,
    on,
    off,
    enterFriendCall,
    clearOutboundRinging,
    clearIncoming,
    t,
  ]);

  /** Đối phương gác máy → đóng modal + cleanup mediasoup (modal nằm ngoài SocketProvider). */
  useEffect(() => {
    const activeCallId = session?.callId;
    if (!isAuthenticated || !connected || !activeCallId) return undefined;

    const onRemoteEnded = (payload) => {
      if (String(payload?.callId || '') !== String(activeCallId)) return;
      closeFriendCall();
      toast(t('friendChat.callEndedRemote'));
    };

    on('call:ended', onRemoteEnded);
    return () => off('call:ended', onRemoteEnded);
  }, [isAuthenticated, connected, session?.callId, on, off, closeFriendCall, t]);

  const handleAccept = async () => {
    if (!incoming || busy) return;
    setBusy(true);
    try {
      const acceptRes = await friendCallService.accept(incoming.callId);
      const acceptData = acceptRes?.data?.data ?? acceptRes?.data;
      const prof = resolveFriendProfileFromList(friendsQuery.data, incoming.fromUserId);
      const peerLabel =
        incoming.callerName ||
        resolvedCallerName ||
        resolveFriendDisplayNameFromList(friendsQuery.data, incoming.fromUserId) ||
        t('friendChat.friendDefault');
      enterFriendCall(
        {
          callId: acceptData?.callId || incoming.callId,
          roomId: acceptData?.roomId || incoming.roomId,
          media: incoming.media,
          fromUserId: incoming.fromUserId,
          fromDisplayName: peerLabel || prof.name,
        },
        {
          peerUserId: incoming.fromUserId,
          peerLabel: peerLabel || prof.name || '',
          peerAvatar: prof.avatar,
        }
      );
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

  const outgoingPeer =
    outboundRinging?.peerLabel?.trim() ||
    (outboundRinging?.calleeId ? t('friendChat.friendDefault') : '');

  const incomingCallerName = useMemo(() => {
    if (!incoming) return '';
    return (
      incoming.callerName ||
      resolvedCallerName ||
      resolveFriendDisplayNameFromList(friendsQuery.data, incoming.fromUserId) ||
      t('friendChat.friendDefault')
    );
  }, [incoming, resolvedCallerName, friendsQuery.data, t]);

  return (
    <>
      {outboundRinging ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="friend-outgoing-call-title"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-col items-center text-center">
              {outboundRinging.media === 'video' ? (
                <Video className="mb-3 h-12 w-12 text-violet-600" aria-hidden />
              ) : (
                <Phone className="mb-3 h-12 w-12 text-emerald-600" aria-hidden />
              )}
              <h2
                id="friend-outgoing-call-title"
                className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
              >
                {outgoingPeer || t('friendChat.callRinging')}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('friendChat.callRinging')}
                {' · '}
                {outboundRinging.media === 'video'
                  ? t('friendChat.incomingCallVideo')
                  : t('friendChat.incomingCallAudio')}
              </p>
              <button
                type="button"
                onClick={() => void cancelOutboundRinging()}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                <PhoneOff className="h-4 w-4" />
                {t('friendChat.cancelCall')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {incoming ? (
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
                {incomingCallerName}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {t('friendChat.incomingCallTitle')}
                {' · '}
                {incoming.media === 'video'
                  ? t('friendChat.incomingCallVideo')
                  : t('friendChat.incomingCallAudio')}
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
      ) : null}
    </>
  );
}
