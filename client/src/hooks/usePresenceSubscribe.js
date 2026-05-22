import { useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

/**
 * Yêu cầu snapshot presence từ Redis (socket-service) cho danh sách userIds.
 * Kết quả merge vào `onlineUsers` qua event `presence:batch` trong SocketContext.
 */
export function usePresenceSubscribe(userIds = [], { enabled = true } = {}) {
  const { emit, connected } = useSocket();
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || !connected) return undefined;
    const ids = [...new Set((userIds || []).map((id) => String(id).trim()).filter(Boolean))];
    if (!ids.length) return undefined;

    const key = ids.sort().join(',');
    if (key === lastKeyRef.current) return undefined;
    lastKeyRef.current = key;

    emit('presence:subscribe', { userIds: ids.slice(0, 200) });
    return undefined;
  }, [userIds, enabled, connected, emit]);
}
