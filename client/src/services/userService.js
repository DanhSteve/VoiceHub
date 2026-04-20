/* ========================================
   USERSERVICE.JS - USER API SERVICE
   Quản lý user profiles, avatars, status
   Kết nối: user-service (port 4001)
======================================== */
import api from './api';

const userService = {
  /** User hiện tại — GET /api/users/me (user-service) */
  getMe: async () => {
    return await api.get('/users/me');
  },

  // Lấy profile của 1 user - GET /users/:userId
  // Dùng khi: xem profile người khác, click vào avatar
  getProfile: async (userId) => {
    return await api.get(`/users/${userId}`);
  },

  // Cập nhật profile của mình — PATCH /users/me (user-service user.routes.js)
  updateProfile: async (data) => {
    return await api.patch('/users/me', data);
  },

  // Upload avatar - POST /users/avatar
  // file: File object từ input[type="file"]
  // Dùng FormData vì upload file (multipart/form-data)
  uploadAvatar: async (file) => {
    const formData = new FormData();
    formData.append('avatar', file); // Key 'avatar' phải match server
    return await api.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Tìm kiếm users - GET /users/search?q=query
  // Dùng khi: search box, add friend, invite member
  searchUsers: async (query) => {
    return await api.get(`/users/search?q=${query}`);
  },

  // Lấy status của user - GET /users/:userId/status
  // Return: 'online' | 'offline' | 'away' | 'busy'
  getUserStatus: async (userId) => {
    return await api.get(`/users/${userId}/status`);
  },

  // Cập nhật status của mình - PATCH /users/me/status
  // status: 'online' | 'away' | 'busy' | 'offline'
  updateStatus: async (status) => {
    return await api.patch('/users/me/status', { status });
  },
};

export default userService;
