/* ========================================
   PROTECTEDROUTE.JSX - ROUTE PROTECTION
   Component bảo vệ routes cần đăng nhập
   - Nếu chưa đăng nhập (Guest) → redirect về trang chủ
   - Nếu đã đăng nhập → render component con
======================================== */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BrandPageLoader from './Shared/BrandPageLoader';

/**
 * ProtectedRoute Component
 * Bảo vệ routes cần đăng nhập
 * 
 * Props:
 * - children: Component cần render nếu đã đăng nhập
 * 
 * Behavior:
 * - Nếu isAuthenticated = false → redirect về "/"
 * - Nếu isAuthenticated = true → render children
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  // Nếu đang loading (check auth) → hiển thị loading
  if (loading) {
    return (
      <BrandPageLoader
        message="Đang kiểm tra..."
        subMessage="Đang xác minh phiên đăng nhập"
      />
    );
  }

  // Nếu chưa đăng nhập → redirect về trang chủ
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Đã đăng nhập → render component con
  return children;
};

export default ProtectedRoute;

