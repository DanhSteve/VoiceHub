import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { mergeDmSnippetMap } from '../utils/dmConversationList';
import { mergeMessagesById, replaceOptimisticWithServer } from '../utils/dmChatHelpers';
import dmMessageService from '../services/dmMessageService';

const SEND_ACK_MS = 12000;

/**
 * Socket + mark-read + typing cho FriendChatPage.
 */
export function useFriendDmRealtime({
  landingDemo,
  on,
  off,
  emit,
  currentUserId,
  selectedFriendId,
  setMessages,
  setLastDmByFriendId,
  setUnreadByPeer,
  setPeerTyping,
  pendingSendsRef,
  t,
  onDmSendRejected,
}) {
  const typingStopTimerRef = useRef(null);
  const markReadInFlightRef = useRef(false);

  const myIdStr = currentUserId ? String(currentUserId) : '';

  const isMessageForPeer = useCallback(
    (m, peerId) => {
      if (!m || !peerId) return false;
      const sender = m.senderId?._id || m.senderId;
      const receiver = m.receiverId?._id || m.receiverId;
      if (!sender || !receiver) return false;
      const senderStr = String(sender);
      const receiverStr = String(receiver);
      const peerStr = String(peerId);
      return (
        (senderStr === myIdStr && receiverStr === peerStr) ||
        (senderStr === peerStr && receiverStr === myIdStr)
      );
    },
    [myIdStr]
  );

  const refreshUnread = useCallback(async () => {
    if (landingDemo || !currentUserId) return;
    try {
      const resp = await dmMessageService.getUnreadByPeer();
      const data = dmMessageService.unwrap(resp);
      setUnreadByPeer(data?.byPeer || {});
    } catch {
      /* ignore */
    }
  }, [landingDemo, currentUserId, setUnreadByPeer]);

  const markConversationRead = useCallback(
    async (peerId) => {
      if (landingDemo || !peerId || markReadInFlightRef.current) return;
      markReadInFlightRef.current = true;
      try {
        await dmMessageService.markConversationRead(peerId);
        setUnreadByPeer((prev) => {
          const next = { ...prev };
          delete next[String(peerId)];
          return next;
        });
        setMessages((prev) =>
          prev.map((m) => {
            const sid = String(m.senderId?._id || m.senderId || '');
            if (sid !== String(peerId)) return m;
            if (String(m.receiverId?._id || m.receiverId || '') !== myIdStr) return m;
            return { ...m, isRead: true, readAt: m.readAt || new Date().toISOString() };
          })
        );
      } catch {
        /* ignore */
      } finally {
        markReadInFlightRef.current = false;
      }
    },
    [landingDemo, myIdStr, setMessages, setUnreadByPeer]
  );

  const emitTypingStart = useCallback(() => {
    if (!selectedFriendId || landingDemo) return;
    emit('friend:typing_start', { receiverId: selectedFriendId });
  }, [emit, landingDemo, selectedFriendId]);

  const emitTypingStop = useCallback(() => {
    if (!selectedFriendId || landingDemo) return;
    emit('friend:typing_stop', { receiverId: selectedFriendId });
  }, [emit, landingDemo, selectedFriendId]);

  const notifyTyping = useCallback(() => {
    emitTypingStart();
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      emitTypingStop();
      typingStopTimerRef.current = null;
    }, 2800);
  }, [emitTypingStart, emitTypingStop]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => {
    if (landingDemo || !selectedFriendId) return undefined;
    const peer = String(selectedFriendId);
    const timer = setTimeout(() => markConversationRead(peer), 400);
    return () => clearTimeout(timer);
  }, [landingDemo, selectedFriendId, markConversationRead]);

  useEffect(() => {
    if (landingDemo) return;
    if (!on || !off || !myIdStr) return;

    const bumpLastDm = (m) => {
      setLastDmByFriendId((prev) => mergeDmSnippetMap(prev, m, myIdStr, t));
    };

    const appendIfRelevant = (m) => {
      if (!isMessageForPeer(m, selectedFriendId)) return;
      setMessages((prev) => {
        const id = m._id || m.id;
        if (id && prev.some((x) => (x._id || x.id) === id)) return prev;
        return [...prev, m];
      });
    };

    const handleNewMessage = (m) => {
      bumpLastDm(m);
      const sender = String(m.senderId?._id || m.senderId || '');
      if (sender !== myIdStr) {
        refreshUnread();
        if (selectedFriendId && sender === String(selectedFriendId)) {
          markConversationRead(String(selectedFriendId));
        }
      }
      appendIfRelevant(m);
      if (selectedFriendId && String(m.senderId?._id || m.senderId) === String(selectedFriendId)) {
        setPeerTyping(false);
      }
    };

    const handleSentMessage = (m) => {
      bumpLastDm(m);
      if (!isMessageForPeer(m, selectedFriendId)) return;

      const pending = pendingSendsRef.current;
      let matchedTempId = null;
      for (const [tempId, meta] of pending.entries()) {
        if (
          String(meta.receiverId) === String(m.receiverId?._id || m.receiverId) &&
          String(meta.content) === String(m.content || '')
        ) {
          matchedTempId = tempId;
          pending.delete(tempId);
          break;
        }
      }

      setMessages((prev) => replaceOptimisticWithServer(prev, m, matchedTempId));
    };

    const failPendingSends = (errPayload) => {
      const msg = errPayload?.message || t('friendChat.sendFail');
      const pending = pendingSendsRef.current;
      for (const [tempId] of [...pending.entries()]) {
        pending.delete(tempId);
        setMessages((prev) =>
          prev.map((x) =>
            String(x._id || x.id) === String(tempId)
              ? { ...x, _sendStatus: 'failed', _sendError: msg }
              : x
          )
        );
      }
      onDmSendRejected?.(errPayload);
    };

    const handleSocketError = (err) => {
      const code = err?.code;
      let toastMsg = err?.message || t('friendChat.sendFail');
      if (code === 'dm_blocked') {
        toastMsg =
          err?.blockerId && String(err.blockerId) !== myIdStr
            ? t('friendChat.blockedByPeerBanner')
            : t('friendChat.dmBlocked');
      } else if (code === 'dm_not_friends') {
        toastMsg = t('friendChat.dmNotFriends');
      }
      toast.error(toastMsg);
      failPendingSends(err);
    };

    const handleSendFailed = (payload) => {
      if (!payload) return;
      if (
        selectedFriendId &&
        payload.receiverId &&
        String(payload.receiverId) !== String(selectedFriendId)
      ) {
        return;
      }
      handleSocketError(payload);
    };

    const handleFriendBlocked = (payload) => {
      if (!payload || String(payload.blockedId) !== myIdStr) return;
      if (
        selectedFriendId &&
        String(payload.blockerId) === String(selectedFriendId)
      ) {
        onDmSendRejected?.({
          code: 'dm_blocked',
          blockerId: payload.blockerId,
          message: t('friendChat.blockedByPeerBanner'),
        });
      }
    };

    const handleFriendUnblocked = (payload) => {
      if (!payload) return;
      const peer =
        String(payload.blockerId) === myIdStr
          ? payload.blockedId
          : String(payload.blockedId) === myIdStr
            ? payload.blockerId
            : null;
      if (peer && selectedFriendId && String(peer) === String(selectedFriendId)) {
        onDmSendRejected?.({ code: 'dm_unblocked', blockerId: null });
      }
    };

    const handleMessagesRead = (payload) => {
      if (!payload || String(payload.readerId) === myIdStr) return;
      const peer = String(payload.peerId || payload.readerId || '');
      if (selectedFriendId && peer !== String(selectedFriendId)) return;
      const readAt = payload.readAt || new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => {
          const sid = String(m.senderId?._id || m.senderId || '');
          if (sid !== myIdStr) return m;
          return { ...m, isRead: true, readAt: m.readAt || readAt };
        })
      );
    };

    const handleTypingStart = (p) => {
      if (String(p?.senderId) === String(selectedFriendId)) setPeerTyping(true);
    };

    const handleTypingStop = (p) => {
      if (String(p?.senderId) === String(selectedFriendId)) setPeerTyping(false);
    };

    const patchMessage = (m) => {
      if (!m) return;
      const id = m._id || m.id;
      if (!id) return;
      setMessages((prev) => {
        const idx = prev.findIndex((x) => String(x._id || x.id) === String(id));
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...m };
        return next;
      });
    };

    const handleMessageEdited = (m) => patchMessage(m);
    const handleMessageReaction = (m) => patchMessage(m);
    const handleMessageRecalled = (m) => patchMessage(m);
    const handleMessageDeleted = (p) => {
      const id = p?.messageId || p?._id || p?.id;
      if (!id) return;
      setMessages((prev) => prev.filter((x) => String(x._id || x.id) !== String(id)));
    };

    on('friend:new_message', handleNewMessage);
    on('friend:sent', handleSentMessage);
    on('friend:send_failed', handleSendFailed);
    on('friend:blocked', handleFriendBlocked);
    on('friend:unblocked', handleFriendUnblocked);
    on('error', handleSocketError);
    on('friend:messages_read', handleMessagesRead);
    on('friend:typing_start', handleTypingStart);
    on('friend:typing_stop', handleTypingStop);
    on('friend:message_edited', handleMessageEdited);
    on('friend:message_reaction', handleMessageReaction);
    on('friend:message_recalled', handleMessageRecalled);
    on('friend:message_deleted', handleMessageDeleted);

    return () => {
      off('friend:new_message', handleNewMessage);
      off('friend:sent', handleSentMessage);
      off('friend:send_failed', handleSendFailed);
      off('friend:blocked', handleFriendBlocked);
      off('friend:unblocked', handleFriendUnblocked);
      off('error', handleSocketError);
      off('friend:messages_read', handleMessagesRead);
      off('friend:typing_start', handleTypingStart);
      off('friend:typing_stop', handleTypingStop);
      off('friend:message_edited', handleMessageEdited);
      off('friend:message_reaction', handleMessageReaction);
      off('friend:message_recalled', handleMessageRecalled);
      off('friend:message_deleted', handleMessageDeleted);
    };
  }, [
    landingDemo,
    on,
    off,
    myIdStr,
    selectedFriendId,
    isMessageForPeer,
    setMessages,
    setLastDmByFriendId,
    setPeerTyping,
    pendingSendsRef,
    markConversationRead,
    refreshUnread,
    onDmSendRejected,
    t,
  ]);

  /** Timeout: đánh failed nếu không nhận friend:sent */
  const armSendTimeout = useCallback(
    (tempId) => {
      setTimeout(() => {
        const pending = pendingSendsRef.current;
        if (!pending.has(tempId)) return;
        pending.delete(tempId);
        setMessages((prev) =>
          prev.map((x) =>
            String(x._id || x.id) === String(tempId)
              ? { ...x, _sendStatus: 'failed', _sendError: t('friendChat.sendTimeout') }
              : x
          )
        );
      }, SEND_ACK_MS);
    },
    [pendingSendsRef, setMessages, t]
  );

  return {
    notifyTyping,
    refreshUnread,
    markConversationRead,
    armSendTimeout,
  };
}
