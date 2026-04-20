// Import lazy và Suspense từ React để tối ưu performance
// lazy: cho phép load component chỉ khi cần thiết (code splitting)
// Suspense: hiển thị fallback UI trong khi component đang được load
import { lazy, Suspense } from 'react';

// Import Route và Routes từ react-router-dom để quản lý điều hướng
// Routes: container chứa tất cả các route
// Route: định nghĩa từng đường dẫn và component tương ứng
import { Navigate, Route, Routes } from 'react-router-dom';

// Import ProtectedRoute để bảo vệ routes cần đăng nhập
import ProtectedRoute from './components/ProtectedRoute';
import BrandPageLoader from './components/Shared/BrandPageLoader';

/* ========================================
   LAZY LOADING CÁC PAGES
   Tại sao dùng lazy()?
   - Thay vì load tất cả pages ngay từ đầu (500KB)
   - Chỉ load page nào user đang truy cập (~150KB ban đầu)
   - Giảm thời gian load trang đầu từ 2s xuống 0.6s
   - Các page khác sẽ load khi user click vào link
======================================== */

// Lazy load trang chủ - file HomePage.jsx nằm trong ./pages/Auth/
const HomePage = lazy(() => import('./pages/Auth/HomePage'));

// Lazy load trang đăng nhập - kết nối với AuthContext để xác thực
const LoginPage = lazy(() => import('./pages/Auth/LoginPage'));

// Lazy load trang đăng ký - tạo user mới qua auth-service
const RegisterPage = lazy(() => import('./pages/Auth/RegisterPage'));

// Lazy load trang xác thực email
const VerifyEmailPage = lazy(() => import('./pages/Auth/VerifyEmailPage'));

// Lazy load trang quên mật khẩu
const ForgotPasswordPage = lazy(() => import('./pages/Auth/ForgotPasswordPage'));

// Lazy load trang đặt lại mật khẩu
const ResetPasswordPage = lazy(() => import('./pages/Auth/ResetPasswordPage'));

// Lazy load trang điều khoản dịch vụ
const TermsOfServicePage = lazy(() => import('./pages/Auth/TermsOfServicePage'));

// Lazy load trang chính sách bảo mật
const PrivacyPolicyPage = lazy(() => import('./pages/Auth/PrivacyPolicyPage'));

// Lazy load dashboard - trang tổng quan sau khi đăng nhập
const DashboardPage = lazy(() => import('./pages/Dashboard/DashboardPage'));

// Lazy load trang chat cũ (sẽ dần thay thế bằng 2 trang mới)
const ChatPage = lazy(() => import('./pages/Chat/ChatPage'));

// Lazy load trang chat bạn bè
const FriendChatPage = lazy(() => import('./pages/Chat/FriendChatPage'));

// Lazy load trang chat doanh nghiệp
const OrgChatPage = lazy(() => import('./pages/Chat/OrgChatPage'));

// Lazy load phòng voice chat - :roomId là dynamic parameter
// Kết nối với WebRTC để gọi voice, sử dụng simple-peer
const VoiceRoomPage = lazy(() => import('./pages/Voice/VoiceRoomPage'));

// Lazy load trang profile cá nhân - hiển thị thông tin user
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage'));

// Lazy load trang tổ chức - quản lý organizations
// Kết nối với organization-service
const OrganizationsPage = lazy(() => import('./pages/Organization/OrganizationsPage'));

// Cài đặt tổ chức full màn hình — đặt trước /organizations
const OrganizationSettingsPage = lazy(() => import('./pages/Organization/OrganizationSettingsPage'));

// Đơn gia nhập tổ chức (trang riêng, có :orgId)
const JoinApplicationPage = lazy(() => import('./pages/Organization/JoinApplicationPage'));

// Lazy load trang thông báo - hiển thị notifications realtime
const NotificationsPage = lazy(() => import('./pages/Notifications/NotificationsPage'));

// Lazy load trang analytics - thống kê và biểu đồ
const AnalyticsPage = lazy(() => import('./pages/Analytics/AnalyticsPage'));

// Trang tài liệu (UI demo + tương tác cục bộ)
const DocumentsPage = lazy(() => import('./pages/Documents/DocumentsPage'));

// Lazy load trang lịch - quản lý sự kiện và meetings
const CalendarPage = lazy(() => import('./pages/Calendar/CalendarPage'));

// Trang công việc (task)
const TasksPage = lazy(() => import('./pages/Tasks/TasksPage'));

// Lazy load trang cài đặt - thay đổi preferences
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'));

// Lazy load trang 404 - hiển thị khi route không tồn tại
const NotFoundPage = lazy(() => import('./pages/NotFound/NotFoundPage'));

/* ========================================
   MAIN APP COMPONENT
   - Được import vào main.jsx
   - Được wrap bởi AuthProvider, SocketProvider, ThemeProvider
   - Quản lý toàn bộ routing của ứng dụng
======================================== */
function App() {
  return (
    // Suspense: lazy routes — BrandPageLoader khi đang tải chunk
    <Suspense fallback={<BrandPageLoader />}>
      {/* Routes: container quản lý tất cả các route */}
      <Routes>
        {/* ===== PUBLIC ROUTES =====
            Không cần đăng nhập, ai cũng truy cập được */}
        
        {/* Route trang chủ - path "/" */}
        <Route path="/" element={<HomePage />} />
        
        {/* Route đăng nhập - path "/login" */}
        {/* LoginPage sẽ gọi authService.login() → auth-service */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Route đăng ký - path "/register" */}
        {/* RegisterPage sẽ gọi authService.register() → auth-service */}
        <Route path="/register" element={<RegisterPage />} />
        
        {/* Route xác thực email - path "/verify-email?token=xxx" */}
        {/* VerifyEmailPage sẽ gọi authService.verifyEmail() → auth-service */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Route quên mật khẩu */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        {/* Route đặt lại mật khẩu qua token */}
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Route điều khoản dịch vụ */}
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />

        {/* Route chính sách bảo mật */}
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

        {/* ===== PROTECTED ROUTES =====
            Cần đăng nhập mới truy cập được
            Guest (chưa đăng nhập) sẽ bị redirect về trang chủ */}
        
        {/* Dashboard - trang chính sau khi login */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } />
        
        {/* Chat cũ - tạm thời giữ để tránh lỗi route cũ */}
        <Route path="/chat" element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        } />

        {/* Chat bạn bè */}
        <Route path="/chat/friends" element={
          <ProtectedRoute>
            <FriendChatPage />
          </ProtectedRoute>
        } />

        {/* Chat doanh nghiệp */}
        <Route path="/chat/organization" element={
          <ProtectedRoute>
            <OrgChatPage />
          </ProtectedRoute>
        } />
        
        {/* Voice chat room - :roomId là dynamic param */}
        {/* VD: /voice/room123 → roomId = "room123" */}
        {/* Sử dụng WebRTC peer-to-peer để gọi voice */}
        {/* Guest KHÔNG được truy cập */}
        <Route path="/voice" element={
          <ProtectedRoute>
            <VoiceRoomPage />
          </ProtectedRoute>
        } />
        <Route path="/voice/:roomId" element={
          <ProtectedRoute>
            <VoiceRoomPage />
          </ProtectedRoute>
        } />
        
        {/* Tasks - quản lý công việc */}
        <Route path="/tasks" element={
          <ProtectedRoute>
            <TasksPage />
          </ProtectedRoute>
        } />
        
        {/* Profile - thông tin cá nhân */}
        {/* Hiển thị avatar, name, email từ AuthContext */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        } />
        
        {/* Đơn gia nhập — đặt trước /organizations/:orgId/settings */}
        <Route
          path="/organizations/join/:orgId"
          element={
            <ProtectedRoute>
              <JoinApplicationPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/organizations/:orgId/settings"
          element={
            <ProtectedRoute>
              <OrganizationSettingsPage />
            </ProtectedRoute>
          }
        />

        {/* Organizations - quản lý tổ chức */}
        {/* CRUD operations với organization-service */}
        {/* Guest KHÔNG được truy cập */}
        <Route path="/organizations" element={
          <ProtectedRoute>
            <OrganizationsPage />
          </ProtectedRoute>
        } />
        
        {/* Friends - tạm khóa giao diện riêng, gom vào trang Tin nhắn */}
        <Route path="/friends" element={
          <Navigate to="/chat/friends" replace />
        } />
        
        {/* Documents - quản lý tài liệu (giao diện + thao tác cục bộ) */}
        <Route path="/documents" element={
          <ProtectedRoute>
            <DocumentsPage />
          </ProtectedRoute>
        } />
        
        {/* Notifications - thông báo */}
        {/* Realtime notifications qua Socket.IO */}
        <Route path="/notifications" element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        } />
        
        {/* Calendar - lịch làm việc */}
        {/* Hiển thị events, meetings, deadlines */}
        <Route path="/calendar" element={
          <ProtectedRoute>
            <CalendarPage />
          </ProtectedRoute>
        } />
        
        {/* Analytics - thống kê & báo cáo (minh họa + liên kết tới module khác) */}
        <Route path="/analytics" element={
          <ProtectedRoute>
            <AnalyticsPage />
          </ProtectedRoute>
        } />
        
        {/* Settings - cài đặt */}
        {/* Thay đổi theme, language, notifications preferences */}
        <Route path="/settings" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />

        {/* ===== 404 NOT FOUND =====
            Catch-all route cho mọi path không match */}
        {/* path="*" nghĩa là bất kỳ route nào không được định nghĩa ở trên */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

// Export App component để import vào main.jsx
export default App;
