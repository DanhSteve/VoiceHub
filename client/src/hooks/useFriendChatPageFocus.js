import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

const HEARTBEAT_MS = 30000;

/**
 * Báo server khi user đang ở /chat/friends để không gửi push thông báo DM trùng.
 */
export function useFriendChatPageFocus({ enabled = true } = {}) {
  const { emit, connected } = useSocket();

  useEffect(() => {
    if (!enabled || !connected || typeof emit !== 'function') return undefined;

    const send = (active) => {
      emit('friend:chat_focus', { active: Boolean(active) });
    };

    send(true);
    const timer = setInterval(() => send(true), HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send(false);
      else send(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      send(false);
    };
  }, [enabled, connected, emit]);
}
