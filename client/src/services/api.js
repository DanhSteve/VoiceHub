/* ========================================
   API.JS - AXIOS INSTANCE & INTERCEPTORS
   Core API client cho toàn bộ app
   
   Chức năng:
   - Tạo axios instance với base config
   - Auto thêm token vào mọi request
   - Handle errors globally
   - Show toast notifications
   - Auto redirect 401 → login
   
   Kết nối đến: api-gateway (port 8000)
   Gateway route request đến các microservices
======================================== */

// Import axios - HTTP client library
import axios from 'axios';
import { getToken, removeToken } from '../utils/tokenStorage';
import { isLandingEmbedActive, isWriteHttpMethod } from '../utils/landingEmbedMode';

// Import toast để show error notifications
import toast from 'react-hot-toast';

/* ========================================
   API BASE URL
   - Production: lấy từ .env → VITE_API_URL
   - Development: http://localhost:13000/api (API Gateway map host trong docker-compose)
   
   API Gateway sẽ route:
   /api/auth/* → auth-service (port 3001)
   /api/users/* → user-service (port 3004)
   /api/chat/* → chat-service (port 3006)
   /api/organizations/* → organization-service (port 3013)
   /api/tasks/* → task-service (port 3009)
   /api/friends/* → friend-service (port 3014)
======================================== */
// Dev: dùng '/api' để request cùng origin → Vite proxy forward tới API Gateway (port 3000)
const API_URL = import.meta.env.VITE_API_URL || '/api';

/* ========================================
   TẠO AXIOS INSTANCE
   Instance này sẽ được dùng bởi tất cả services
   (authService, chatService, userService, ...)
======================================== */
const api = axios.create({
  // Base URL cho mọi request
  // VD: api.get('/auth/me') → GET http://localhost:8000/api/auth/me
  baseURL: API_URL,
  
  // Timeout: 60 giây (60000ms) - match với proxy timeout trong API Gateway
  // Nếu request mất quá 60s → có thể backend đang gặp vấn đề
  // Tránh request treo vô hạn như trước (timeout: 0)
  timeout: 60000,
  
  // Default headers cho mọi request
  headers: {
    // Content-Type: JSON (mọi request gửi JSON)
    'Content-Type': 'application/json',
  },
});

/* ========================================
   REQUEST INTERCEPTOR
   Chạy TRƯỚC KHI gửi mọi request
   
   Nhiệm vụ:
   - Tự động thêm token vào header
   - Không cần manually add token mỗi lần call API
   
   Luồng:
   1. Service gọi api.get('/users')
   2. Interceptor chặn request
   3. Lấy token từ localStorage
   4. Thêm vào header: Authorization: Bearer <token>
   5. Gửi request đi
======================================== */
api.interceptors.request.use(
  // Success handler: modify config trước khi gửi
  (config) => {
    if (isLandingEmbedActive() && isWriteHttpMethod(config.method)) {
      toast('Chế độ demo — không ghi dữ liệu lên server.', { icon: '🔒', duration: 2800 });
      const block = new Error('LANDING_EMBED_WRITE_BLOCKED');
      block.code = 'LANDING_EMBED_WRITE_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    // Danh sách public routes không cần JWT token
    const publicRoutes = [
      '/auth/register',
      '/auth/login',
      '/auth/refresh-token',
      '/auth/forgot-password',
      '/auth/resend-verification',
      '/auth/reset-password',
      '/auth/verify-email', // Verify email chỉ dùng token trong query, KHÔNG dùng JWT
    ];

    const isPublicRoute = publicRoutes.some((route) => config.url?.includes(route));

    /** Demo landing: không gửi request bảo vệ tới gateway — chỉ giả lập UI */
    if (isLandingEmbedActive() && !isPublicRoute) {
      const block = new Error('LANDING_EMBED_API_BLOCKED');
      block.code = 'LANDING_EMBED_API_BLOCKED';
      block.isLandingEmbedBlock = true;
      return Promise.reject(block);
    }

    // Lấy token từ localStorage (được lưu khi login)
    const token = getToken();
    
    // Chỉ thêm JWT token nếu:
    // 1. Token tồn tại và không rỗng
    // 2. Route KHÔNG phải public route (đặc biệt là verify-email)
    if (token && token.trim() !== '' && !isPublicRoute) {
      // Format: "Bearer <token>" (JWT standard)
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Return config để request được gửi đi
    return config;
  },
  
  // Error handler: nếu có lỗi khi prepare request
  (error) => {
    // Reject promise → catch block sẽ bắt lỗi
    return Promise.reject(error);
  }
);

/* ========================================
   RESPONSE INTERCEPTOR
   Chạy SAU KHI nhận response từ server
   
   Nhiệm vụ:
   - Unwrap response.data (không cần .data.data)
   - Handle errors globally
   - Show toast notifications
   - Auto logout khi 401 (Unauthorized)
   - Redirect tương ứng với error code
   
   Luồng:
   1. Server trả response
   2. Interceptor chặn response
   3. Nếu success → return data
   4. Nếu error → show toast, handle theo status code
======================================== */
api.interceptors.response.use(
  /* ----- SUCCESS HANDLER -----
     Response OK (status 200-299) */
  (response) => {
    // Unwrap data: response.data thay vì response.data.data
    // Server trả: { data: { user: {...} } }
    // Interceptor return: { user: {...} }
    // Service nhận trực tiếp data, không cần .data
    return response.data;
  },
  
  /* ----- ERROR HANDLER -----
     Response lỗi (status 400+, 500+, network error) */
  (error) => {
    if (error?.code === 'LANDING_EMBED_WRITE_BLOCKED' || error?.isLandingEmbedBlock) {
      return Promise.reject(error);
    }

    /* Khung demo trên HomePage: không toast / không redirect — tránh "No token" khi có request lạc */
    if (isLandingEmbedActive()) {
      return Promise.reject({
        message: error.response?.data?.message || error.message,
        status: error.response?.status,
        data: error.response?.data,
        code: error.code,
        isLandingEmbedSilent: true,
      });
    }

    console.error('[API] Request error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
      },
    });

    // Xử lý ERR_EMPTY_RESPONSE - server không trả về response
    // Thường xảy ra khi: backend crash, không chạy, hoặc connection bị đứt
    if (error.code === 'ERR_EMPTY_RESPONSE' || error.message?.includes('EMPTY_RESPONSE')) {
      const message = 'Server không phản hồi. Vui lòng kiểm tra:\n- Backend service có đang chạy không\n- API Gateway có hoạt động không\n- Kết nối mạng có ổn định không';
      console.error('[API] ❌ Empty response error - server may be down or crashed');
      console.error('[API] Request details:', {
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL,
        timeout: error.config?.timeout,
      });
      toast.error(message, { duration: 5000 });
      return Promise.reject({
        message,
        status: null,
        code: 'ERR_EMPTY_RESPONSE',
        data: null,
      });
    }

    // Xử lý network errors
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error')) {
      const message = 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.';
      console.error('[API] ❌ Network error');
      toast.error(message);
      return Promise.reject({
        message,
        status: null,
        code: 'ERR_NETWORK',
        data: null,
      });
    }

    // Lấy error message từ response hoặc dùng default
    // Priority: server message > axios message > default
    const message = error.response?.data?.message || error.message || 'Đã xảy ra lỗi';

    // Thông tin URL request để phân biệt auth routes
    const requestUrl = error.config?.url || '';
    const isAuthLoginRoute = requestUrl.includes('/auth/login');
    const isAuthRegisterRoute = requestUrl.includes('/auth/register');
    const isAuthPublicRoute =
      isAuthLoginRoute ||
      isAuthRegisterRoute ||
      requestUrl.includes('/auth/forgot-password') ||
      requestUrl.includes('/auth/resend-verification') ||
      requestUrl.includes('/auth/reset-password') ||
      requestUrl.includes('/auth/verify-email');

    /* ===== XỬ LÝ THEO STATUS CODE ===== */

    // 401 Unauthorized: Token invalid hoặc expired
    if (error.response?.status === 401) {
      // Nếu là các auth public route (login/register/forgot/reset/verify)
      // → KHÔNG auto redirect, để component tự xử lý (hiển thị lỗi đăng nhập, đăng ký, ...)
      if (isAuthPublicRoute) {
        return Promise.reject({
          message,
          status: error.response?.status,
          data: error.response?.data,
          code: error.code,
        });
      }

      // Hiển thị lỗi chi tiết từ server để debug (trước khi redirect)
      console.error('[API] 401 Unauthorized:', { message, url: error.config?.url, data: error.response?.data });
      toast.error(message || 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', { duration: 4000 });

      // Trì hoãn redirect 2s để user đọc được toast và có thể mở console xem chi tiết
      setTimeout(() => {
        removeToken();
        window.location.href = '/login';
      }, 2000);

      return Promise.reject({
        message,
        status: error.response?.status,
        data: error.response?.data,
        code: error.code,
      });
    }
    // 403 Forbidden: Không có quyền
    else if (error.response?.status === 403) {
      toast.error('Bạn không có quyền thực hiện hành động này');
    } 
    // 404 Not Found: Resource không tồn tại
    // Với /friends/search: không hiển thị toast ở đây, để trang Bạn bè tự hiển thị "Không tìm thấy người dùng"
    else if (error.response?.status === 404) {
      const isFriendSearch = requestUrl.includes('/friends/search');
      if (!isFriendSearch) {
        toast.error(message || 'Không tìm thấy dữ liệu');
      }
    } 
    // 503 Service Unavailable: Auth/service tạm không dùng được (không thoát đăng nhập)
    else if (error.response?.status === 503) {
      toast.error(message || 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.');
    }
    // 504 Gateway Timeout: Backend không phản hồi trong thời gian cho phép
    else if (error.response?.status === 504) {
      toast.error('Backend đang xử lý quá lâu. Vui lòng thử lại sau hoặc kiểm tra logs backend.');
      console.error('[API] ❌ Gateway Timeout (504) - Backend may be slow or unresponsive');
    }
    // 500+ Server Error: Lỗi server
    else if (error.response?.status >= 500) {
      toast.error(message || 'Lỗi server. Vui lòng thử lại sau.');
    }
    // Các lỗi khác (400, 422, etc.) không show toast
    // Component tự handle (validation errors, etc.)

    // Reject với error object có cấu trúc nhất quán
    return Promise.reject({
      message,                        // Error message
      status: error.response?.status, // HTTP status code
      data: error.response?.data,     // Full error data từ server
      code: error.code,              // Error code (ERR_NETWORK, etc.)
    });
  }
);

// Export default api instance
// Services import: import api from './api'
export default api;

/* ========================================
   HELPER FUNCTIONS
   Shorthand cho các HTTP methods
   
   Thay vì: api.get(url, config)
   Dùng: apiGet(url, config)
   
   Optional - có thể dùng hoặc không
======================================== */

// GET request: Lấy dữ liệu
// VD: apiGet('/users/123')
export const apiGet = (url, config) => api.get(url, config);

// POST request: Tạo mới
// VD: apiPost('/users', { name: 'John' })
export const apiPost = (url, data, config) => api.post(url, data, config);

// PUT request: Update toàn bộ
// VD: apiPut('/users/123', { name: 'John Updated' })
export const apiPut = (url, data, config) => api.put(url, data, config);

// PATCH request: Update một phần
// VD: apiPatch('/users/123', { name: 'New Name' })
export const apiPatch = (url, data, config) => api.patch(url, data, config);

// DELETE request: Xóa
// VD: apiDelete('/users/123')
export const apiDelete = (url, config) => api.delete(url, config);

/* ========================================
   FLOW DIAGRAM: API REQUEST
   
   Component/Service
        |
        | api.get('/users')
        ↓
   Request Interceptor
        | + Add token to header
        | + Modify config
        ↓
   HTTP Request → Server
        |
        ↓
   Server Response
        |
        ↓
   Response Interceptor
        | + Unwrap data
        | + Handle errors
        | + Show toasts
        ↓
   Component/Service receives data
======================================== */
