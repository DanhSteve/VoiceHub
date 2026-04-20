import { useContext, useMemo } from 'react';
import { AuthContext } from '../../context/auth-context';
import { LANDING_DEMO_USER } from '../../constants/landingDemoUser';

/**
 * Ghi đè user đã đăng nhập cục bộ cho preview landing (trang thật cần useAuth).
 */
export function LandingDemoAuth({ children }) {
  const parent = useContext(AuthContext);
  const value = useMemo(() => {
    if (!parent) return null;
    return {
      ...parent,
      user: LANDING_DEMO_USER,
      loading: false,
      isAuthenticated: true,
    };
  }, [parent]);

  if (!value) return children;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
