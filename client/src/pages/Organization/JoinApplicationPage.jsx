import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import JoinApplicationForm from '../../components/Organization/JoinApplicationForm';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Trang điền đơn gia nhập tổ chức (thay cho modal).
 * Đường dẫn: /organizations/join/:orgId?name=Tên+TC
 */
export default function JoinApplicationPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const shell = isDarkMode ? 'flex min-h-screen bg-[#0b0e14]' : `flex min-h-screen ${appShellBg(false)}`;
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const organizationName = useMemo(() => {
    const raw = searchParams.get('name') || '';
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [searchParams]);

  const handleSubmitted = () => {
    toast.success(t('joinApplication.toastSent'));
    navigate('/organizations', { replace: true, state: { refreshPendingJoin: true } });
  };

  const handleCancel = () => {
    navigate('/organizations');
  };

  if (!orgId) {
    return (
      <div className={shell}>
        <NavigationSidebar />
        <main className={`flex flex-1 items-center justify-center p-6 ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
          {t('joinApplication.missingOrgId')}
        </main>
      </div>
    );
  }

  return (
    <div className={shell}>
      <NavigationSidebar />
      <main className="flex flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 md:py-12">
          <button
            type="button"
            onClick={handleCancel}
            className="mb-6 text-sm text-cyan-400/90 hover:text-cyan-300 hover:underline"
          >
            {t('joinApplication.backToOrgs')}
          </button>
          <div className="rounded-2xl border border-white/[0.08] bg-[#12151c] p-6 shadow-xl md:p-8">
            <h1 className="mb-1 text-2xl font-bold text-white">{t('joinApplication.title')}</h1>
            {organizationName ? (
              <p className="mb-2 text-lg font-semibold text-[#a29bfe]">{organizationName}</p>
            ) : null}
            <p className="mb-6 text-sm text-gray-400">{t('joinApplication.hint')}</p>
            <JoinApplicationForm
              orgId={orgId}
              organizationName={organizationName}
              onSubmitted={handleSubmitted}
              onCancel={handleCancel}
              showCancel
            />
          </div>
        </div>
      </main>
    </div>
  );
}
