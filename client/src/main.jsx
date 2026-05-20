/* ========================================
   MAIN.JSX - ENTRY POINT CỦA ỨNG DỤNG
   File này là điểm bắt đầu của React app
   - Mount React vào DOM (index.html)
   - Setup các Providers (Context)
   - Wrap App với Router, Theme, Auth, Socket
======================================== */

// Import React library - core của React
import React from 'react';

// Import ReactDOM để render React vào DOM
// createRoot: API mới của React 18 (thay thế render)
import ReactDOM from 'react-dom/client';

// Import BrowserRouter để enable routing trong app
// BrowserRouter sử dụng HTML5 history API để sync UI với URL
import { BrowserRouter } from 'react-router-dom';

// Import App component chính - chứa tất cả routes
// File: ./App.jsx
import App from './App';

// Import global CSS - styles cho toàn bộ app
// File này có Tailwind directives (@tailwind base/components/utilities)
import './index.css';

/* ========================================
   IMPORT CÁC PROVIDERS (CONTEXT)
   Providers wrap App để cung cấp data/functions
   cho tất cả components con qua Context API
======================================== */

import VoiceHubToaster from './components/Shared/VoiceHubToaster';

// Import AuthProvider để quản lý authentication state
// File: ./context/AuthContext.jsx
// Cung cấp: user, token, login(), logout(), isAuthenticated
import { AuthProvider } from './context/AuthContext';

// Import SocketProvider để quản lý Socket.IO connection
// File: ./context/SocketContext.jsx  
// Cung cấp: socket instance, online users, realtime events
import { SocketProvider } from './context/SocketContext';
import FriendCallRealtimeHost from './components/Call/FriendCallRealtimeHost';
import { FriendCallSessionProvider } from './context/FriendCallSessionContext';

// Import ThemeProvider để quản lý dark/light theme
// File: ./context/ThemeContext.jsx
// Cung cấp: theme state, toggleTheme(), theme colors
import { ThemeProvider } from './context/ThemeContext';
import { LocaleProvider } from './context/LocaleContext';
import { WorkspaceProvider } from './context/WorkspaceContext';

/* ========================================
   RENDER ỨNG DỤNG VÀO DOM
   Luồng chạy:
   1. Tìm element có id="root" trong index.html
   2. Tạo React root từ element đó
   3. Render toàn bộ app tree vào root
======================================== */

// Tìm <div id="root"> trong index.html và tạo React root
// createRoot là concurrent mode của React 18
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode: enable thêm warnings và checks trong development
  // Giúp phát hiện bugs sớm, không ảnh hưởng production
  // VD: warning về deprecated APIs, unsafe lifecycles
  <React.StrictMode>
    {/* BrowserRouter: enable routing cho toàn bộ app
        - Wrap tất cả components cần dùng routing
        - Cung cấp history, location, navigation */}
    <BrowserRouter
      // future flags: enable tính năng mới của React Router v7
      future={{
        // v7_startTransition: dùng React.startTransition cho navigation
        // Giúp UI responsive hơn khi chuyển trang
        v7_startTransition: true,
        
        // v7_relativeSplatPath: thay đổi cách resolve relative paths
        // Chuẩn bị cho React Router v7
        v7_relativeSplatPath: true
      }}
    >
      {/* ===== PROVIDERS HIERARCHY =====
          Thứ tự quan trọng! Từ ngoài vào trong:
          Theme → Auth → Socket → App
          
          Tại sao?
          - Theme ở ngoài cùng: tất cả đều cần theme
          - Auth ở giữa: Socket cần user info từ Auth
          - Socket ở trong: cần user đã login mới connect
      ===== */}
      
      {/* ThemeProvider: cung cấp theme cho toàn app
          - Wrap ngoài cùng vì tất cả components cần theme
          - Provide: isDark, colors, toggleTheme()
          - File: ./context/ThemeContext.jsx */}
      <ThemeProvider>
        <LocaleProvider>
        {/* AuthProvider: quản lý authentication state
            - Provide: user, token, login(), logout()
            - Lưu token vào localStorage
            - Auto refresh khi reload page
            - File: ./context/AuthContext.jsx */}
        <AuthProvider>
          <FriendCallSessionProvider>
            <WorkspaceProvider>
            {/* SocketProvider: quản lý Socket.IO connection
                - Kết nối đến backend socket server
                - Cần user từ AuthContext để authenticate
                - Provide: socket, onlineUsers, emit(), on()
                - File: ./context/SocketContext.jsx */}
            <SocketProvider>
              {/* App component: chứa tất cả routes và pages
                  - File: ./App.jsx
                  - Có thể access tất cả contexts ở trên */}
              <App />
              <FriendCallRealtimeHost />

              {/* Toaster: hiển thị toast notifications
                  - Đặt ở đây để dùng được ở mọi nơi
                  - toast.success(), toast.error() ở bất kỳ component nào */}
              <VoiceHubToaster />
            </SocketProvider>
            </WorkspaceProvider>
          </FriendCallSessionProvider>
        </AuthProvider>
        </LocaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

/* ========================================
   LUỒNG CHẠY KHI APP KHỞI ĐỘNG:
   
   1. Browser load index.html
   2. index.html load main.jsx (qua Vite)
   3. main.jsx chạy:
      - ThemeProvider khởi tạo → load theme từ localStorage
      - AuthProvider khởi tạo → check token, auto login nếu có
      - SocketProvider khởi tạo → connect socket nếu đã login
      - App render → lazy load HomePage
      - Toaster ready → sẵn sàng hiển thị notifications
   
   4. User tương tác:
      - Click link → Router thay đổi URL
      - App.jsx catch route mới
      - Lazy load component tương ứng
      - Component render với data từ Contexts
======================================== */
