import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import FriendCallMediaModal from '../components/Call/FriendCallMediaModal';

const FriendCallSessionContext = createContext(null);
const FALLBACK_SESSION_CTX = {
  session: null,
  openFriendCall: null,
  closeFriendCall: () => {},
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

  const openFriendCall = useCallback((payload) => {
    if (!payload?.roomId || !payload?.callId) return;
    setSession({
      roomId: String(payload.roomId),
      callId: String(payload.callId),
      media: payload.media === 'audio' ? 'audio' : 'video',
      peerLabel: payload.peerLabel != null ? String(payload.peerLabel) : '',
    });
  }, []);

  const closeFriendCall = useCallback(() => {
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      openFriendCall,
      closeFriendCall,
    }),
    [session, openFriendCall, closeFriendCall]
  );

  return (
    <FriendCallSessionContext.Provider value={value}>
      {children}
      <FriendCallMediaModal />
    </FriendCallSessionContext.Provider>
  );
}
