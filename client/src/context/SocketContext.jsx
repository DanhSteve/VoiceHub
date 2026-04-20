/* ========================================
   SOCKETCONTEXT.JSX - SOCKET.IO MANAGEMENT
   Quản lý WebSocket connection cho realtime features
   - Chat realtime
   - Online users tracking
   - Voice chat signaling
   - Notifications realtime

   Kết nối: API Gateway (VITE_SOCKET_URL) hoặc trực tiếp socket-service (VITE_SOCKET_DIRECT_URL) + /chat
======================================== */

// Import hooks để build context
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Import Socket.IO client để kết nối WebSocket
// io: function tạo socket connection
import { io } from 'socket.io-client';

// Import useAuth để lấy user info và token
// Cần token để authenticate socket connection
import { useAuth } from './AuthContext';
import { getToken } from '../utils/tokenStorage';
import { isLandingEmbedActive } from '../utils/landingEmbedMode';

// Tạo SocketContext
const SocketContext = createContext(null);

/* ========================================
   CUSTOM HOOK: useSocket()
   Cách dùng: const { socket, emit, on } = useSocket();
   
   Component nào cần realtime features → dùng hook này
   VD: ChatPage cần emit message và listen new messages
======================================== */
function useSocket() {
  const context = useContext(SocketContext);
  
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  
  return context;
}

// Export useSocket để dùng trong components
export { useSocket };

/* ========================================
   SOCKET SERVER URL
   - Dev: mặc định cùng origin Vite (5173) + proxy /socket.io → :3017 (vite.config.js). VITE_SOCKET_URL không dùng trừ khi VITE_SOCKET_USE_GATEWAY=true.
   - VITE_SOCKET_DIRECT_URL: nối thẳng socket-service (vd. http://127.0.0.1:3017), bỏ qua proxy Vite.
   - VITE_SOCKET_URL + VITE_SOCKET_USE_GATEWAY: test Socket qua API Gateway trong dev.
   - Production: VITE_SOCKET_URL hoặc mặc định http://localhost:3000
   - Namespace /chat → khớp socket-service (io.of('/chat'))
======================================== */
const DIRECT_RAW = import.meta.env.VITE_SOCKET_DIRECT_URL;
const DIRECT = DIRECT_RAW && String(DIRECT_RAW).trim() ? String(DIRECT_RAW).trim() : '';
const GATEWAY_URL_RAW = import.meta.env.VITE_SOCKET_URL;
const GATEWAY_URL =
  GATEWAY_URL_RAW && String(GATEWAY_URL_RAW).trim() ? String(GATEWAY_URL_RAW).trim() : '';
const USE_GATEWAY_SOCKET =
  import.meta.env.VITE_SOCKET_USE_GATEWAY === '1' ||
  import.meta.env.VITE_SOCKET_USE_GATEWAY === 'true';

/**
 * Dev: ưu tiên cùng origin với Vite (vd. http://localhost:5173) — GET /socket.io được vite proxy → :3017,
 * tránh 404 khi gateway :3000 chưa proxy /socket.io hoặc SOCKET_SERVICE_URL sai.
 * Bật qua gateway trong dev: VITE_SOCKET_USE_GATEWAY=true + VITE_SOCKET_URL=http://localhost:3000
 * Hoặc: VITE_SOCKET_DIRECT_URL=http://127.0.0.1:3017 (bỏ qua proxy Vite).
 * Production: gateway hoặc VITE_SOCKET_URL / mặc định :3000.
 */
function getDevSocketBaseUrl() {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return 'http://127.0.0.1:3017';
  }
  return window.location.origin;
}

const SOCKET_BASE_URL =
  DIRECT ||
  (import.meta.env.DEV && !USE_GATEWAY_SOCKET ? getDevSocketBaseUrl() : '') ||
  GATEWAY_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:3017' : 'http://localhost:3000');

/** Base URL → Socket.IO URL có namespace /chat (tránh trùng /chat/chat). */
function getSocketIoUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return 'http://localhost:3000/chat';
  if (trimmed.endsWith('/chat')) return trimmed;
  return `${trimmed}/chat`;
}

const SOCKET_IO_URL = getSocketIoUrl(SOCKET_BASE_URL);

if (import.meta.env.DEV) {
  console.log('🔌 [Socket] Configuration:');
  let socketModeLabel = 'default';
  if (DIRECT) socketModeLabel = 'direct (VITE_SOCKET_DIRECT_URL)';
  else if (USE_GATEWAY_SOCKET && GATEWAY_URL) {
    socketModeLabel = 'via gateway (VITE_SOCKET_USE_GATEWAY + VITE_SOCKET_URL)';
  } else if (typeof window !== 'undefined' && window.location?.origin === SOCKET_BASE_URL) {
    socketModeLabel = 'same-origin + Vite proxy /socket.io → :3017';
  } else if (import.meta.env.DEV) {
    socketModeLabel = 'direct (dev fallback → 127.0.0.1:3017)';
  }
  console.log('   Mode:', socketModeLabel);
  console.log('   Base URL:', SOCKET_BASE_URL);
  console.log('   Socket.IO URL (namespace /chat):', SOCKET_IO_URL);
  if (DIRECT) {
    console.log('   VITE_SOCKET_DIRECT_URL:', DIRECT);
  } else if (USE_GATEWAY_SOCKET && GATEWAY_URL) {
    console.log('   VITE_SOCKET_URL:', GATEWAY_URL);
  } else if (GATEWAY_URL && !import.meta.env.DEV) {
    console.log('   VITE_SOCKET_URL:', GATEWAY_URL);
  } else if (import.meta.env.DEV) {
    console.log(
      '   (dev: VITE_SOCKET_URL bị bỏ qua trừ khi VITE_SOCKET_USE_GATEWAY=true; cần socket-service :3017 hoặc proxy Vite)'
    );
  } else {
    console.log('   VITE_SOCKET_URL:', '(default http://localhost:3000)');
  }
  console.log('');
}

/* ========================================
   SOCKETPROVIDER COMPONENT
   Wrap trong main.jsx (bên trong AuthProvider)
   Tự động connect socket khi user login
======================================== */
function SocketProvider({ children }) {
  /* ----- GET USER INFO TỪ AUTHCONTEXT ----- */
  
  // Lấy user và isAuthenticated từ AuthContext
  // Cần user để gửi user info qua socket
  // Chỉ connect socket khi isAuthenticated = true
  const { user, isAuthenticated } = useAuth();

  /** Chỉ id ổn định — tránh reconnect mỗi render khi object `user` đổi tham chiếu */
  const socketUserKey = useMemo(() => {
    if (!user) return '';
    const v = user.userId ?? user._id ?? user.id;
    return v != null && v !== '' ? String(v).trim() : '';
  }, [user]);
  
  /* ----- STATE MANAGEMENT ----- */
  
  // socket: Socket.IO instance (để emit và listen events)
  const [socket, setSocket] = useState(null);
  
  // connected: trạng thái kết nối (true/false)
  const [connected, setConnected] = useState(false);
  
  // connectionError: lỗi kết nối (null hoặc error object)
  const [connectionError, setConnectionError] = useState(null);
  
  // onlineUsers: danh sách user IDs đang online
  // Server emit 'users:online' → update list này
  const [onlineUsers, setOnlineUsers] = useState([]);

  /* ========================================
     useEffect: QUẢN LÝ SOCKET CONNECTION
     
     Luồng hoạt động:
     1. Khi user login (isAuthenticated=true) → connect socket
     2. Khi user logout → disconnect socket
     3. Auto reconnect nếu mất kết nối
     
     Dependencies: [isAuthenticated, user]
     → Re-run khi user login/logout
  ======================================== */
  useEffect(() => {
    // Chỉ connect khi user đã login và đã có id ổn định
    if (isAuthenticated && socketUserKey) {
      // Lấy token từ localStorage để authenticate
      const token = getToken();
      
      /* ----- TẠO SOCKET CONNECTION ----- */
      const newSocket = io(SOCKET_IO_URL, {
        // auth: gửi token lên server để xác thực
        // Server sẽ verify token và lấy user info
        auth: { token },
        
        // Polling trước → ổn định qua API Gateway (HTTP proxy), rồi upgrade WebSocket (server.on('upgrade')).
        // Thử websocket trước dễ gây cảnh báo Firefox khi reload / React StrictMode (socket cũ bị hủy giữa chừng).
        transports: ['polling', 'websocket'],
        
        // reconnection: true = auto reconnect nếu disconnect
        reconnection: true,
        
        // reconnectionDelay: 1s giữa mỗi lần thử reconnect
        reconnectionDelay: 1000,
        
        // reconnectionAttempts: thử 5 lần trước khi bỏ cuộc
        reconnectionAttempts: 5,
      });

      /* ===== SOCKET EVENT LISTENERS ===== */
      
      // Event: 'connect' - khi kết nối thành công
      newSocket.on('connect', () => {
        console.log('✅ [Socket] Connected successfully');
        console.log('   Socket ID:', newSocket.id);
        console.log('   URL:', SOCKET_IO_URL);
        console.log('   Transport:', newSocket.io.engine.transport.name);
        
        setConnected(true);
        setConnectionError(null); // Clear error khi connect success
      });

      // Event: 'disconnect' - khi mất kết nối
      newSocket.on('disconnect', (reason) => {
        console.warn('⚠️ [Socket] Disconnected');
        console.warn('   Reason:', reason);
        
        setConnected(false);
        
        // Nếu disconnect vì server error → log chi tiết
        if (reason === 'io server disconnect') {
          console.error('   Server forced disconnect. Check server logs.');
          setConnectionError(new Error('Server forced disconnect'));
        } else if (reason === 'io client disconnect') {
          console.log('   Client initiated disconnect');
          setConnectionError(null);
        }
      });

      // Event: 'connect_error' - lỗi khi kết nối
      newSocket.on('connect_error', (error) => {
        console.error('❌ [Socket] Connection Error');
        console.error('   Message:', error.message);
        console.error('   Data:', error.data);
        console.error('   Trying to connect to:', SOCKET_IO_URL);
        console.error('');
        console.error('   📋 Debugging checklist:');
        console.error('   1. socket-service đang chạy? — curl http://localhost:3017/health');
        console.error('   2. Dev: Vite proxy /socket.io → :3017 (client/.env VITE_SOCKET_PROXY_TARGET nếu cần đổi target)');
        console.error('   3. Hoặc nối thẳng: VITE_SOCKET_DIRECT_URL=http://127.0.0.1:3017');
        console.error('   4. Socket qua gateway (dev): VITE_SOCKET_USE_GATEWAY=true + VITE_SOCKET_URL + api-gateway SOCKET_SERVICE_URL');
        console.error('   5. CORS / log socket-service (namespace /chat)');
        
        setConnectionError(error);
      });

      // Event: 'error' - khi có lỗi socket (auth errors, etc.)
      newSocket.on('error', (error) => {
        console.error('❌ [Socket] Socket Error');
        console.error('   Error:', error);
        
        setConnectionError(error);
      });

      /* ===== ONLINE USERS TRACKING ===== */
      
      // Event: 'users:online' - server gửi list users online
      // Chạy khi connect hoặc khi có user join/leave
      newSocket.on('users:online', (users) => {
        const list = Array.isArray(users) ? users.map((id) => String(id)) : [];
        setOnlineUsers(list);
      });

      // Event: 'user:connected' - có user mới online
      newSocket.on('user:connected', (userId) => {
        const id = String(userId);
        setOnlineUsers((prev) => [...new Set([...prev.map(String), id])]);
      });

      // Event: 'user:disconnected' - có user offline
      newSocket.on('user:disconnected', (userId) => {
        const id = String(userId);
        setOnlineUsers((prev) => prev.map(String).filter((x) => x !== id));
      });

      // Lưu socket instance vào state
      setSocket(newSocket);

      /* ----- CLEANUP FUNCTION ----- */
      // Chạy khi component unmount hoặc deps thay đổi
      return () => {
        // Đóng socket connection
        newSocket.close();
        
        // Clear socket state
        setSocket(null);
        setConnected(false);
        setConnectionError(null);
      };
    }
  }, [isAuthenticated, socketUserKey]); // Re-run khi login/logout hoặc đổi user id — không phụ thuộc object user

  /* ========================================
     HELPER FUNCTION: emit()
     Gửi event lên server
     
     Cách dùng:
     emit('message:send', { 
       roomId: 'room1', 
       text: 'Hello!' 
     });
     
     Check connected trước khi emit để tránh lỗi
  ======================================== */
  const emit = useCallback(
    (event, data) => {
      if (isLandingEmbedActive()) {
        return;
      }
      // Chỉ emit khi socket connected
      if (socket && connected) {
        socket.emit(event, data);
      } else {
        // Warn nếu chưa connected
        console.warn('Socket not connected. Cannot emit event:', event);
      }
    },
    [socket, connected] // Deps: re-create khi socket/connected change
  );

  /* ========================================
     HELPER FUNCTION: on()
     Listen event từ server
     
     Cách dùng:
     on('message:received', (message) => {
       console.log('New message:', message);
     });
     
     Dùng trong component với useEffect
  ======================================== */
  const on = useCallback(
    (event, callback) => {
      if (socket) {
        socket.on(event, callback);
      }
    },
    [socket]
  );

  /* ========================================
     HELPER FUNCTION: off()
     Remove event listener
     
     Quan trọng! Phải off trong cleanup để tránh memory leak
     
     Cách dùng:
     useEffect(() => {
       const handler = (msg) => console.log(msg);
       on('message', handler);
       
       return () => off('message', handler);
     }, []);
  ======================================== */
  const off = useCallback(
    (event, callback) => {
      if (socket) {
        socket.off(event, callback);
      }
    },
    [socket]
  );

  /* ========================================
     HELPER FUNCTION: joinRoom()
     Join chat room hoặc voice room
     
     Emit event 'room:join' với roomId
     Server sẽ add socket vào room
     Sau đó socket sẽ nhận events của room đó
  ======================================== */
  const joinRoom = useCallback(
    (roomId) => {
      emit('room:join', { roomId });
    },
    [emit] // Phụ thuộc emit function
  );

  /* ========================================
     HELPER FUNCTION: leaveRoom()
     Leave chat room hoặc voice room
     
     Emit 'room:leave' để server remove socket khỏi room
  ======================================== */
  const leaveRoom = useCallback(
    (roomId) => {
      emit('room:leave', { roomId });
    },
    [emit]
  );

  /* ========================================
     CONTEXT VALUE
     Provide cho components con
  ======================================== */
  const value = {
    socket,           // Socket instance (để custom operations)
    connected,        // Connection status: true/false
    connectionError,  // Connection error: null hoặc error object
    onlineUsers,      // Array of online user IDs
    emit,             // Function: emit(event, data)
    on,               // Function: on(event, callback)
    off,              // Function: off(event, callback)
    joinRoom,         // Function: joinRoom(roomId)
    leaveRoom,        // Function: leaveRoom(roomId)
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

// Export SocketProvider để dùng trong main.jsx
export { SocketProvider };

/* ========================================
   CÁCH DÙNG TRONG COMPONENT:
   
   import { useSocket } from './context/SocketContext';
   
   function ChatRoom({ roomId }) {
     const { socket, emit, on, off, joinRoom } = useSocket();
     const [messages, setMessages] = useState([]);
     
     // Join room khi component mount
     useEffect(() => {
       joinRoom(roomId);
     }, [roomId]);
     
     // Listen new messages
     useEffect(() => {
       const handleMessage = (msg) => {
         setMessages(prev => [...prev, msg]);
       };
       
       on('message:received', handleMessage);
       
       // Cleanup: off listener
       return () => off('message:received', handleMessage);
     }, [on, off]);
     
     // Send message
     const sendMessage = (text) => {
       emit('message:send', { roomId, text });
     };
     
     return <div>...</div>;
   }
======================================== */
