import axios from 'axios';
import toast from 'react-hot-toast';
import { applyAuthHeader, removeToken } from '../../utils/tokenStorage';
import { mapAuthSessionMessageForLogout } from '../../utils/authErrorMessages';
import { extractApiErrorMeta, resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isAutoLogoutDisabled } from '../../utils/devAuth';
import {
  isLandingEmbedActive,
  isLandingEmbedWriteGuardActive,
  isWriteHttpMethod,
} from '../../utils/landingEmbedMode';

/** Từ chối im lặng mọi lỗi HTTP khi đang xem demo landing — không đụng toast/redirect */
function rejectLandingEmbedSilent(error) {
  const userMessage = resolveApiErrorMessage(error, 'Đã xảy ra lỗi');
  const meta = extractApiErrorMeta(error);
  return Promise.reject({
    message: userMessage,
    userMessage,
    status: meta.status,
    data: meta.data,
    code: meta.code,
    errorCode: meta.errorCode,
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

import { resolveApiBaseUrl } from '../../utils/browserOrigin';

// Đồng bộ với services/api.js — https://voicehub.local luôn dùng /api same-origin.
const API_URL = resolveApiBaseUrl();

// Create axios instance
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Tăng lên 60s để tránh timeout khi hash password hoặc database operations
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (isLandingEmbedWriteGuardActive() && isWriteHttpMethod(config.method)) {
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

    if (!isAuthPublicUrl(config.url)) {
      applyAuthHeader(config);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

function isLikelyBrowserCacheFailure(error) {
  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('cache') || msg.includes('err_cache');
}

function toNormalizedError(error, fallback = 'Đã xảy ra lỗi') {
  const userMessage = resolveApiErrorMessage(error, fallback);
  const meta = extractApiErrorMeta(error);
  return {
    message: userMessage,
    userMessage,
    status: meta.status,
    data: meta.data,
    code: meta.code,
    errorCode: meta.errorCode,
    original: error,
  };
}

// Response interceptor - Handle errors
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    if (error?.code === 'LANDING_EMBED_WRITE_BLOCKED' || error?.isLandingEmbedBlock) {
      return Promise.reject(error);
    }

    const config = error?.config;
    if (
      config &&
      !config.__cacheBustRetry &&
      !error.response &&
      (isLikelyBrowserCacheFailure(error) || error.code === 'ERR_NETWORK')
    ) {
      const method = String(config.method || 'get').toLowerCase();
      if (method === 'get' || method === 'head') {
        config.__cacheBustRetry = true;
        const prevHeaders =
          config.headers && typeof config.headers.toJSON === 'function'
            ? config.headers.toJSON()
            : { ...(config.headers || {}) };
        config.headers = {
          ...prevHeaders,
          'Cache-Control': 'no-store, no-cache',
          Pragma: 'no-cache',
        };
        if (!isAuthPublicUrl(config.url)) {
          applyAuthHeader(config);
        }
        config.params = { ...(config.params || {}), _nc: Date.now() };
        try {
          return await apiClient.request(config);
        } catch (retryErr) {
          error = retryErr;
        }
      }
    }

    if (isLandingEmbedActive()) {
      return rejectLandingEmbedSilent(error);
    }

    if (config?.skipGlobalErrorHandling) {
      return Promise.reject(error);
    }

    const message = resolveApiErrorMessage(error, 'Đã xảy ra lỗi');
    
    // Handle specific error codes
    if (error.response?.status === 401) {
      if (isAutoLogoutDisabled()) {
        console.warn('[apiClient] VITE_DISABLE_AUTO_LOGOUT: bỏ qua logout/redirect (chỉ debug).');
      } else {
        removeToken();
        window.location.href = '/login';
        const authHint = error.response?.data?.errorCode || error.response?.data?.code || message;
        toast.error(mapAuthSessionMessageForLogout(authHint));
      }
    } else if (error.response?.status === 403) {
      if (!error.config?.skipPermissionDeniedToast) {
        toast.error('Bạn không có quyền thực hiện hành động này');
      }
    } else if (error.response?.status === 404) {
      if (!error.config?.skipNotFoundToast) {
        toast.error('Không tìm thấy dữ liệu');
      }
    } else if (error.response?.status >= 500) {
      toast.error('Lỗi server. Vui lòng thử lại sau.');
    } else {
      toast.error(message);
    }

    return Promise.reject(toNormalizedError(error, 'Đã xảy ra lỗi'));
  }
);

export default apiClient;
