import axios from 'axios';
import toast from 'react-hot-toast';
import { getToken, removeToken } from '../../utils/tokenStorage';
import { mapAuthSessionMessageForLogout } from '../../utils/authErrorMessages';
import { isAutoLogoutDisabled } from '../../utils/devAuth';
import {
  isLandingEmbedActive,
  isLandingEmbedWriteGuardActive,
  isWriteHttpMethod,
} from '../../utils/landingEmbedMode';

/** Từ chối im lặng mọi lỗi HTTP khi đang xem demo landing — không đụng toast/redirect */
function rejectLandingEmbedSilent(error) {
  return Promise.reject({
    message: error.response?.data?.message || error.message,
    status: error.response?.status,
    data: error.response?.data,
    code: error.code,
    isLandingEmbedSilent: true,
  });
}

const AUTH_PUBLIC_PATHS = [
  '/auth/register',
  '/auth/login',
  '/auth/refresh-token',
  '/auth/forgot-password',
  '/auth/resend-verification',
  '/auth/reset-password',
  '/auth/verify-email',
];

function isAuthPublicUrl(url) {
  const u = url || '';
  return AUTH_PUBLIC_PATHS.some((p) => u.includes(p));
}

// Đồng bộ với services/api.js: dev dùng '/api' → Vite proxy; prod dùng VITE_API_URL
// Tránh hardcode http://localhost:3000 khi mở UI qua IP LAN.
const API_URL = import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_URL || '/api';

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Tăng lên 60s để tránh timeout khi hash password hoặc database operations
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (isLandingEmbedWriteGuardActive() && isWriteHttpMethod(config.method)) {
      toast('Chế độ demo — không ghi dữ liệu lên server.', { icon: '🔒', duration: 2800 });
      const block = new Error('LANDING_EMBED_WRITE_BLOCKED');
      block.code = 'LANDING_EMBED_WRITE_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    if (isLandingEmbedActive() && !isAuthPublicUrl(config.url)) {
      const block = new Error('LANDING_EMBED_API_BLOCKED');
      block.code = 'LANDING_EMBED_API_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    const token = normalizeToken(getToken());
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    if (error?.code === 'LANDING_EMBED_WRITE_BLOCKED' || error?.isLandingEmbedBlock) {
      return Promise.reject(error);
    }

    if (isLandingEmbedActive()) {
      return rejectLandingEmbedSilent(error);
    }

    const message = error.response?.data?.message || error.message || 'Đã xảy ra lỗi';
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      if (isAutoLogoutDisabled()) {
        console.warn('[apiClient] VITE_DISABLE_AUTO_LOGOUT: bỏ qua logout/redirect (chỉ debug).');
      } else {
        removeToken();
        window.location.href = '/login';
        toast.error(mapAuthSessionMessageForLogout(error.response?.data?.message || error.message));
      }
    } else if (error.response?.status === 403) {
      toast.error('Bạn không có quyền thực hiện hành động này');
    } else if (error.response?.status === 404) {
      toast.error('Không tìm thấy dữ liệu');
    } else if (error.response?.status >= 500) {
      toast.error('Lỗi server. Vui lòng thử lại sau.');
    } else {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default apiClient;
