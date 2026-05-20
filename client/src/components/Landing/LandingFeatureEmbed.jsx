import { lazy, Suspense, useLayoutEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { LandingDemoThemeProvider } from '../../context/ThemeContext';
import { setLandingEmbedActive } from '../../utils/landingEmbedMode';
import { LandingScaledShell } from './LandingScaledShell';
import { LandingDemoAuth } from './LandingDemoAuth';

const LoginPage = lazy(() => import('../../pages/Auth/LoginPage'));
const DashboardPage = lazy(() => import('../../pages/Dashboard/DashboardPage'));
const FriendChatPage = lazy(() => import('../../pages/Chat/FriendChatPage'));
const VoiceRoomPage = lazy(() => import('../../pages/Voice/VoiceRoomPage'));
const OrganizationsPage = lazy(() => import('../../pages/Workspace/OrganizationsPage'));

function Fallback() {
  return (
    <div className="flex min-h-[320px] w-full items-center justify-center bg-[#050810]/40 text-sm text-slate-500">
      Đang tải giao diện…
    </div>
  );
}

/**
 * Chặn Link nội bộ (react-router) trong khung preview — không lồng Router thứ hai.
 * Dùng capture để chặn trước handler của Link.
 */
function LandingEmbedClickLock({ children }) {
  return (
    <div
      role="presentation"
      className="h-full min-h-0 w-full"
      onClickCapture={(e) => {
        const a = e.target.closest?.('a[href]');
        if (!a) return;
        const href = a.getAttribute('href');
        if (href && href.startsWith('/') && !href.startsWith('//')) {
          e.preventDefault();
          e.stopPropagation();
          toast('Bản demo trên trang chủ — liên kết thật có sau khi đăng nhập.', { icon: '🔒' });
        }
      }}
    >
      {children}
    </div>
  );
}

function EmbedInner({ featureId }) {
  const tree = useMemo(() => {
    const wrap = (node) => (
      <LandingEmbedClickLock>
        <Suspense fallback={<Fallback />}>{node}</Suspense>
      </LandingEmbedClickLock>
    );

    switch (featureId) {
      case 'auth':
        return wrap(<LoginPage landingDemo />);
      case 'control':
        return wrap(
          <LandingDemoAuth>
            <DashboardPage landingDemo demoVariant="default" />
          </LandingDemoAuth>
        );
      case 'chat':
        return wrap(
          <LandingDemoAuth>
            <FriendChatPage landingDemo />
          </LandingDemoAuth>
        );
      case 'voice':
        return wrap(
          <LandingDemoAuth>
            <VoiceRoomPage landingDemo />
          </LandingDemoAuth>
        );
      case 'org':
        return wrap(
          <LandingDemoAuth>
            <OrganizationsPage landingDemo />
          </LandingDemoAuth>
        );
      case 'tasks':
        return wrap(
          <LandingDemoAuth>
            <DashboardPage landingDemo demoVariant="tasks" />
          </LandingDemoAuth>
        );
      default:
        return null;
    }
  }, [featureId]);

  return tree;
}

/**
 * Nhúng màn hình thật (cùng mã nguồn) trong khung landing — cùng BrowserRouter,
 * không dùng MemoryRouter (React Router cấm lồng Router).
 */
export default function LandingFeatureEmbed({ featureId }) {
  useLayoutEffect(() => {
    setLandingEmbedActive(true);
    return () => setLandingEmbedActive(false);
  }, []);

  return (
    <LandingDemoThemeProvider>
      <LandingScaledShell>
        <EmbedInner featureId={featureId} />
      </LandingScaledShell>
    </LandingDemoThemeProvider>
  );
}
