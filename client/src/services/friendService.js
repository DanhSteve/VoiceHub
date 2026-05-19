/* ========================================
   FRIENDSERVICE.JS - FRIENDS API SERVICE
   Quản lý bạn bè, friend requests, block/unblock
   Kết nối: friend-service (port 4005)
   
   Flow thêm bạn:
   1. A gửi request → sendRequest(B.id)
   2. B nhận pending request
   3. B accept → acceptRequest(requestId)
   4. A và B trở thành friends
======================================== */
import api from './api';

const friendService = {
  // Lấy danh sách bạn bè - GET /friends
  // Return: [{ id, name, avatar, status, ... }]
  getFriends: async (params = {}) => {
    return await api.get('/friends', { params });
  },

  // Gửi lời mời kết bạn - POST /friends/request
  // userId: ID của người muốn kết bạn
  sendRequest: async (userId) => {
    return await api.post('/friends/request', { userId });
  },

  // Chấp nhận lời mời - POST /friends/accept/:requestId
  // requestId: ID của friend request
  acceptRequest: async (requestId) => {
    return await api.post(`/friends/accept/${requestId}`);
  },

  // Chấp nhận theo userId người gửi lời mời - POST /friends/:friendId/accept
  acceptFriend: async (friendId) => {
    return await api.post(`/friends/${friendId}/accept`);
  },

  // Từ chối lời mời - DELETE /friends/reject/:requestId
  rejectRequest: async (requestId) => {
    return await api.delete(`/friends/reject/${requestId}`);
  },

  // Từ chối theo userId người gửi lời mời - POST /friends/:friendId/reject
  rejectFriend: async (friendId) => {
    return await api.post(`/friends/${friendId}/reject`);
  },

  // Xóa bạn - DELETE /friends/:friendId
  // friendId: ID của bạn bè muốn xóa
  removeFriend: async (friendId) => {
    return await api.delete(`/friends/${friendId}`);
  },

  // Lấy các lời mời chờ duyệt - GET /friends/pending
  // Return: [{ id, from: {...}, createdAt, ... }]
  getPendingRequests: async (config = {}) => {
    return await api.get('/friends/pending', config);
  },

  // Chặn user - POST /friends/block
  // Khi block: không nhận message, không thấy online status
  blockUser: async (userId) => {
    return await api.post('/friends/block', { userId });
  },

  // Bỏ chặn - DELETE /friends/unblock/:userId
  unblockUser: async (userId) => {
    return await api.delete(`/friends/unblock/${userId}`);
  },

  // Alias: chặn/bỏ chặn qua route legacy đang chạy ổn định
  blockFriend: async (friendId) => {
    return await api.post('/friends/block', { userId: friendId });
  },

  unblockFriend: async (friendId) => {
    return await api.delete(`/friends/unblock/${friendId}`);
  },

  // Tìm bạn theo số điện thoại
  searchByPhone: async (phone) => {
    return await api.get(`/friends/search?phone=${encodeURIComponent(phone)}`);
  },
};

export default friendService;
