/* ========================================
   AUTHCONTEXT.JSX - AUTHENTICATION CONTEXT
   Quản lý toàn bộ authentication state của app
   - User login/logout/register
   - Lưu token vào localStorage
   - Provide user info cho toàn bộ app
   - Auto check auth khi reload page
======================================== */

// Import hooks từ React để build context
import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from './auth-context';

// Import toast để hiển thị notifications
// Dùng để show "Đăng nhập thành công", "Đăng xuất", etc.
import toast from 'react-hot-toast';

// Import authService để call API authentication
// File: ../services/authService.js - chứa login(), register(), logout()
import authService from '../services/authService';

// Import userService để update user status
import userService from '../services/userService';
import { getToken, setToken, removeToken } from '../utils/tokenStorage';

/* ========================================
   CONTEXT: đối tượng React Context được tạo trong ./auth-context.js (tách file để HMR ổn định).
======================================== */
/* ========================================
   CUSTOM HOOK: useAuth()
   Cách dùng: const { user, login, logout } = useAuth();
   
   Tại sao cần?
   - Thay vì dùng useContext(AuthContext) ở mỗi file
   - Chỉ cần import useAuth() - ngắn gọn hơn
   - Có error handling: báo lỗi nếu dùng ngoài Provider
======================================== */
function useAuth() {
  // Lấy context value từ AuthContext
  const context = useContext(AuthContext);
  
  // Check xem component có được wrap trong AuthProvider không
  // Nếu không → context = null → throw error
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  
  // Return context để component có thể dùng
  // VD: { user, login, logout, isAuthenticated, ... }
  return context;
}

// Export useAuth để dùng trong components
export { useAuth };

/* ========================================
   AUTHPROVIDER COMPONENT
   Wrap toàn bộ app (ở main.jsx)
   Cung cấp auth functions & state cho mọi component
   
   Props:
   - children: các component con (App, Toaster, etc.)
======================================== */
function AuthProvider({ children }) {
  /* ----- STATE MANAGEMENT ----- */
  
  // State lưu thông tin user hiện tại
  // Default: null (Guest role - chưa đăng nhập)
  // Khi login thành công → setUser(userData từ API)
  const [user, setUser] = useState(null);
  
  // State loading: true khi đang check auth hoặc đang login
  // Dùng để hiển thị loading spinner
  const [loading, setLoading] = useState(false);

  /* ========================================
     useEffect: CHECK AUTH KHI APP KHỞI ĐỘNG
     Chạy 1 lần khi component mount
     - Kiểm tra có token trong localStorage không
     - Nếu có → gọi API lấy user info
     - Nếu không → user = null (chưa login)
  ======================================== */
  useEffect(() => {
    // Async function để check authentication
    const checkAuth = async () => {
      try {
        // Lấy token từ localStorage (được lưu khi login)
        const token = getToken();
        
        // Nếu có token → nghĩa là user đã login trước đó
        if (token) {
          // Gọi API để lấy thông tin user hiện tại
          // authService.getCurrentUser() → GET /api/auth/me
          const userData = await authService.getCurrentUser();
          
          // Set user data vào state
          setUser(userData?.data || userData);
        }
      } catch (error) {
        // Nếu có lỗi (token hết hạn, invalid, etc.)
        console.error('Auth check failed:', error);
        
        // Xóa token lỗi khỏi localStorage
        removeToken();
      } finally {
        // Dù thành công hay thất bại cũng set loading = false
        setLoading(false);
      }
    };

    // Chạy checkAuth khi app khởi động
    checkAuth();
  }, []); // Empty deps → chỉ chạy 1 lần khi mount

  /* ========================================
     LOGIN FUNCTION
     Đăng nhập user với email & password
     
     Luồng:
     1. Gọi authService.login() → POST /api/auth/login
     2. Nhận token + user data từ API
     3. Lưu token vào localStorage
     4. Set user vào state
     5. Show toast success
     
     Return: true (thành công) / false (thất bại)
  ======================================== */
  const login = useCallback(async (email, password) => {
    try {
      // Gọi API login qua authService
      // authService.login() → POST /api/auth/login
      // Body: { email, password }
      const response = await authService.login(email, password);
      
      // Backend trả về: { success: true, data: { accessToken, refreshToken, user: {...} } }
      // Hoặc sau interceptor: { accessToken, refreshToken, user: {...} }
      const token = response.accessToken || response.token || response.data?.accessToken;
      const userData = response.user || response.data?.user;
      
      if (!token || !userData) {
        throw new Error('Invalid response from server');
      }
      
      // Lưu token vào localStorage để persist login
      // Token này sẽ được gửi kèm mọi API request
      setToken(token);

      // Cập nhật user state: ưu tiên profile từ user-service (displayName/avatar)
      try {
        const me = await authService.getCurrentUser();
        setUser(me?.data || me);
      } catch (e) {
        setUser(userData);
      }
      
      // Hiển thị toast notification thành công
      toast.success('Đăng nhập thành công!');
      
      // Return true để component biết login OK
      return true;
    } catch (error) {
      // Nếu có lỗi (sai password, user không tồn tại, etc.)
      // Hiển thị error message từ API hoặc message mặc định
      toast.error(error.message || 'Đăng nhập thất bại');
      
      // Return false để component biết login failed
      return false;
    }
  }, []); // Empty deps vì không phụ thuộc state/props nào

  /* ========================================
     REGISTER FUNCTION
     Đăng ký user mới
     
     Luồng tương tự login:
     1. Call API register
     2. Nhận token + user
     3. Lưu token, set user
     4. Auto login sau khi register
     
     Params:
     - userData: { name, email, password, ... }
  ======================================== */
  const register = useCallback(async (userData) => {
    // Khai báo startTime ở ngoài try block để có thể dùng trong catch block
    const startTime = Date.now();
    
    try {
      console.log('[AuthContext] Starting registration for:', userData.email);
      console.log('[AuthContext] Registration data:', {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        hasPassword: !!userData.password,
      });
      
      // Log API endpoint để debug
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
      console.log('[AuthContext] API Base URL:', API_URL);
      console.log('[AuthContext] Register endpoint:', `${API_URL}/auth/register`);
      
      // Gọi API register qua authService
      // authService.register() → POST /api/auth/register
      // Body: { firstName, lastName, email, password }
      const response = await authService.register(userData);
      
      const duration = Date.now() - startTime;
      console.log(`[AuthContext] Registration API call completed in ${duration}ms`);
      console.log('[AuthContext] Full response:', JSON.stringify(response, null, 2));
      
      // Backend trả về: { success: true, message: "...", data: { email, message, emailScheduled, ... } }
      // Sau interceptor: { success: true, message: "...", data: { email, message, emailScheduled, ... } }
      
      // Kiểm tra response structure
      if (!response) {
        console.error('[AuthContext] ❌ Response is null or undefined');
        toast.error('Không nhận được phản hồi từ server');
        return false;
      }
      
      console.log('[AuthContext] Registration response:', {
        success: response.success,
        emailScheduled: response.data?.emailScheduled,
        email: response.data?.email,
        message: response.message,
        hasData: !!response.data,
      });
      
      // Kiểm tra success flag - hiển thị thông báo NGAY LẬP TỨC
      if (response.success === false) {
        const errorMessage = response.message || response.data?.message || 'Đăng ký thất bại';
        console.error('[AuthContext] ❌ Registration failed:', errorMessage);
        toast.error(errorMessage);
        return false;
      }
      
      // Hiển thị thông báo NGAY LẬP TỨC dựa trên response
      // Nếu email được gửi thành công → báo thành công ngay
      if (response.success === true) {
        if (response.data?.emailScheduled === true) {
          // Email đã được lên lịch gửi thành công
          toast.success('✅ Đăng ký thành công! Email xác thực đã được gửi thành công. Vui lòng kiểm tra hộp thư của bạn.');
          console.log('[AuthContext] ✅ Email verification scheduled successfully');
        } else if (response.data?.emailScheduled === false) {
          // Email service chưa được cấu hình
          toast.success(response.message || '✅ Đăng ký thành công! Email service chưa được cấu hình.');
          console.log('[AuthContext] Registration successful, email service not configured');
        } else {
          // Trường hợp khác - vẫn báo thành công
          toast.success(response.message || '✅ Đăng ký thành công!');
          console.log('[AuthContext] Registration successful');
        }
      }
      
      return true;
    } catch (error) {
      // Handle errors: email đã tồn tại, password yếu, timeout, network error, etc.
      console.error('[AuthContext] ❌ Registration error:', error);
      console.error('[AuthContext] Error type:', error?.constructor?.name);
      console.error('[AuthContext] Error details:', {
        message: error?.message,
        status: error?.status,
        data: error?.data,
        code: error?.code,
        response: error?.response,
      });
      
      // Xử lý timeout - request vượt quá 60 giây
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        const duration = Date.now() - startTime;
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
        const message = `Yêu cầu quá thời gian chờ (60s). Backend không phản hồi.\n\nVui lòng kiểm tra:\n1. API Gateway có đang chạy tại ${API_URL}?\n2. Auth Service có đang chạy không?\n3. Kiểm tra logs backend để xem có lỗi không`;
        toast.error(message, { duration: 7000 });
        console.error('[AuthContext] ❌ Request timeout - backend may be slow or unresponsive');
        console.error('[AuthContext] Request took:', duration, 'ms before timeout');
        console.error('[AuthContext] API URL:', API_URL);
        console.error('[AuthContext] Endpoint:', `${API_URL}/auth/register`);
        console.error('[AuthContext] 💡 Hướng dẫn debug:');
        console.error('   1. Kiểm tra API Gateway có chạy: curl http://localhost:3000/health');
        console.error('   2. Kiểm tra Auth Service có chạy: curl http://localhost:3001/health');
        console.error('   3. Xem logs của API Gateway và Auth Service');
        return false;
      }
      
      // Xử lý empty response - server không trả về response
      // Thường xảy ra khi backend crash hoặc không chạy
      if (error?.code === 'ERR_EMPTY_RESPONSE' || error?.message?.includes('EMPTY_RESPONSE')) {
        const message = 'Server không phản hồi. Vui lòng kiểm tra:\n- Backend service có đang chạy không\n- API Gateway có hoạt động không\n- Kết nối mạng có ổn định không';
        toast.error(message, { duration: 5000 });
        console.error('[AuthContext] ❌ Empty response - backend may be down or crashed');
        console.error('[AuthContext] Error occurred after waiting:', Date.now() - startTime, 'ms');
        return false;
      }

      // Xử lý network error
      if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error')) {
        toast.error('Lỗi kết nối mạng. Vui lòng kiểm tra kết nối và thử lại.');
        return false;
      }
      
      // Hiển thị error message từ server hoặc default
      const errorMessage = error?.message || error?.data?.message || 'Đăng ký thất bại';
      toast.error(errorMessage);
      return false;
    }
  }, []);

  /* ========================================
     LOGOUT FUNCTION
     Đăng xuất user
     
     Luồng:
     1. Update status to offline
     2. Call API logout (invalidate token trên server)
     3. Xóa token khỏi localStorage
     4. Set user = null
     5. Socket sẽ disconnect (ở SocketContext)
  ======================================== */
  const logout = useCallback(async () => {
    try {
      // Update status to 'offline' trước khi logout
      try {
        await userService.updateStatus('offline');
      } catch (statusError) {
        console.warn('Failed to update status to offline:', statusError);
        // Vẫn tiếp tục logout dù status update fail
      }

      // Gọi API logout (optional - để invalidate token server-side)
      // authService.logout() → POST /api/auth/logout
      await authService.logout();
      
      removeToken();
      
      // Set user = null → app sẽ redirect về login
      setUser(null);
      
      // Show logout notification
      toast.success('Đăng xuất thành công!');
    } catch (error) {
      // Nếu API lỗi vẫn logout local
      console.error('Logout error:', error);
      
      // Force logout: xóa token và user dù API fail
      removeToken();
      setUser(null);
    }
  }, []);

  /* ========================================
     UPDATE USER FUNCTION
     Cập nhật thông tin user (name, avatar, etc.)
     
     Dùng khi:
     - User edit profile
     - Upload avatar mới
     - Change settings
     
     Params:
     - userData: object chứa fields cần update
       VD: { name: "New Name" } hoặc { avatar: "url" }
  ======================================== */
  const updateUser = useCallback((userData) => {
    // Merge userData mới với user hiện tại
    // ...prev: giữ lại các fields cũ
    // ...userData: override các fields mới
    setUser((prev) => ({ ...prev, ...userData }));
  }, []);

  /* ========================================
     CONTEXT VALUE
     Object này sẽ được provide cho toàn bộ app
     Mọi component dùng useAuth() sẽ nhận được object này
  ======================================== */
  const value = {
    user,              // User hiện tại: { id, name, email, avatar }
    loading,           // Loading state: true/false
    login,             // Function: login(email, password)
    register,          // Function: register(userData)
    logout,            // Function: logout()
    updateUser,        // Function: updateUser(userData)
    isAuthenticated: !!user,  // Boolean: true nếu có user (đã login)
                              // !! convert object → boolean
                              // null → false, object → true
  };

  /* ========================================
     RENDER PROVIDER
     Wrap children với AuthContext.Provider
     Pass value object xuống mọi component con
  ======================================== */
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// AuthContext: re-export từ ./auth-context.js (override cục bộ trong LandingDemoAuth)
export { AuthProvider, AuthContext };

/* ========================================
   CÁCH DÙNG TRONG COMPONENT:
   
   import { useAuth } from './context/AuthContext';
   
   function MyComponent() {
     const { user, login, logout, isAuthenticated } = useAuth();
     
     if (!isAuthenticated) {
       return <LoginForm onSubmit={login} />;
     }
     
     return (
       <div>
         <h1>Hello {user.name}!</h1>
         <button onClick={logout}>Logout</button>
       </div>
     );
   }
======================================== */
