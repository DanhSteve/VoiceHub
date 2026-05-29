import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import FriendCallMediaModal from '../components/Call/FriendCallMediaModal';
import friendCallService from '../services/friendCallService';

const FriendCallSessionContext = createContext(null);
const FALLBACK_SESSION_CTX = {
  session: null,
  outboundRinging: null,
  openFriendCall: null,
  closeFriendCall: () => {},
  startOutboundRinging: () => {},
  clearOutboundRinging: () => {},
  cancelOutboundRinging: async () => {},
};

export function useFriendCallSession() {
  const ctx = useContext(FriendCallSessionContext);
  if (!ctx) {
    if (import.meta?.env?.DEV) {
      console.warn('[FriendCallSession] Provider missing, using fallback no-op session context.');
    }
    return FALLBACK_SESSION_CTX;
  }
  return ctx;
}

/**
 * Trạng thái cuộc gọi bạn bè đang mở (modal SFU), không điều hướng sang /voice.
 */
export function FriendCallSessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [outboundRinging, setOutboundRinging] = useState(null);
  const outboundRingingRef = useRef(null);

  const openFriendCall = useCallback((payload) => {
    if (!payload?.roomId || !payload?.callId) return;
    setSession({
      roomId: String(payload.roomId),
      callId: String(payload.callId),
      media: payload.media === 'audio' ? 'audio' : 'video',
      peerLabel: payload.peerLabel != null ? String(payload.peerLabel) : '',
      peerUserId: payload.peerUserId != null ? String(payload.peerUserId) : '',
      peerAvatar: payload.peerAvatar != null ? payload.peerAvatar : null,
    });
  }, []);

  const closeFriendCall = useCallback(() => {
    setSession(null);
  }, []);

  const startOutboundRinging = useCallback((payload) => {
    if (!payload?.callId || !payload?.roomId) return;
    setOutboundRinging({
      callId: String(payload.callId),
      roomId: String(payload.roomId),
      media: payload.media === 'audio' ? 'audio' : 'video',
      peerLabel: payload.peerLabel != null ? String(payload.peerLabel) : '',
      calleeId: payload.calleeId != null ? String(payload.calleeId) : '',
    });
  }, []);

  const clearOutboundRinging = useCallback(() => {
    setOutboundRinging(null);
    outboundRingingRef.current = null;
  }, []);

  const cancelOutboundRinging = useCallback(async () => {
    const id = outboundRingingRef.current?.callId;
    clearOutboundRinging();
    if (!id) return;
    try {
      await friendCallService.cancel(id);
    } catch {
      /* ignore */
    }
  }, [clearOutboundRinging]);

  useEffect(() => {
    outboundRingingRef.current = outboundRinging;
  }, [outboundRinging]);

  useEffect(() => {
    return () => {
      const id = outboundRingingRef.current?.callId;
      if (!id) return;
      friendCallService.cancel(id).catch(() => {});
      outboundRingingRef.current = null;
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      outboundRinging,
      openFriendCall,
      closeFriendCall,
      startOutboundRinging,
      clearOutboundRinging,
      cancelOutboundRinging,
    }),
    [
      session,
      outboundRinging,
      openFriendCall,
      closeFriendCall,
      startOutboundRinging,
      clearOutboundRinging,
      cancelOutboundRinging,
    ]
  );

  return (
    <FriendCallSessionContext.Provider value={value}>
      {children}
      <FriendCallMediaModal />
    </FriendCallSessionContext.Provider>
  );
}
