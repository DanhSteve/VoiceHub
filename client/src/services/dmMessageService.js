import api from './api';

const unwrap = (resp) => {
  const payload = resp?.data ?? resp;
  return payload?.data !== undefined ? payload.data : payload;
};

const DM_PAGE_SIZE = 50;

export const dmMessageService = {
  pageSize: DM_PAGE_SIZE,

  /** GET /messages?receiverId=&page=&limit= */
  getConversation(peerId, page = 1, limit = DM_PAGE_SIZE) {
    return api.get('/messages', { params: { receiverId: peerId, page, limit } });
  },

  /** GET /messages?receiverId=&markConversationRead=1 */
  markConversationRead(peerId) {
    return api.get('/messages', {
      params: { receiverId: peerId, markConversationRead: 1 },
    });
  },

  /** GET /messages?unreadByPeer=1 */
  getUnreadByPeer() {
    return api.get('/messages', { params: { unreadByPeer: 1 } });
  },

  addReaction(messageId, emoji) {
    return api.post(`/messages/${messageId}/reactions`, { emoji });
  },

  removeReaction(messageId, emoji) {
    return api.delete(`/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  },

  recallMessage(messageId) {
    return api.patch(`/messages/${messageId}/recall`);
  },

  /** GET /messages?receiverId=&search=1&q= */
  searchConversation(peerId, q, page = 1, limit = 50) {
    return api.get('/messages', {
      params: { receiverId: peerId, q, search: 1, page, limit },
    });
  },

  unwrap,
};

export default dmMessageService;
