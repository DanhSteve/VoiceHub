import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { useTheme } from '../../context/ThemeContext';
import authService from '../../services/authService';
import { useAppStrings } from '../../locales/appStrings';

function VerifyEmailPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [verified, setVerified] = useState(false);
  const token = searchParams.get('token');
  const hasRunRef = useRef(false);

  const btnPrimary = authPrimaryButtonClass(isDarkMode);
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const iconWrap = isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700';
  const iconWrapSuccess = isDarkMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-100 text-emerald-700';

  useEffect(() => {
    if (!token) {
      toast.error(t('verifyEmail.toastNoToken'));
      navigate('/register', {
        state: {
          error: t('verifyEmail.registerFlashInvalid'),
        },
      });
      return;
    }
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const run = async () => {
      setLoading(true);
      try {
        const response = await authService.verifyEmail(token);

        if (response.success) {
          setVerified(true);
          toast.success(t('verifyEmail.toastSuccess'));
          setTimeout(() => {
            navigate('/login', {
              state: { message: t('verifyEmail.loginFlashVerified') },
            });
          }, 2000);
        } else {
          const errorMessage = response.message || t('verifyEmail.verifyFailedGeneric');
          toast.error(`${t('verifyEmail.verifyFailedPrefix')} ${errorMessage}`);
          setTimeout(() => {
            navigate('/register', { state: { error: errorMessage } });
          }, 2000);
        }
      } catch (error) {
        const errorMessage = error?.message || t('verifyEmail.verifyFailedGeneric');
        toast.error(`${t('verifyEmail.verifyFailedPrefix')} ${errorMessage}`);
        setTimeout(() => {
          navigate('/register', { state: { error: errorMessage } });
        }, 2000);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [token, navigate, t]);

  return (
    <AuthPageLayout aside={<AuthMarketingAside />}>
      {verified ? (
        <>
          <div className="flex flex-col items-center text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${iconWrapSuccess}`}>
              <CheckCircle2 className="h-9 w-9" strokeWidth={1.75} aria-hidden />
            </div>
            <h1 className={`mt-6 text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>{t('verifyEmail.titleSuccess')}</h1>
            <p className={`mt-3 max-w-md text-base leading-relaxed sm:text-lg ${mutedCls}`}>{t('verifyEmail.bodySuccess')}</p>
            <Link
              to="/login"
              className={`mt-8 inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-bold text-white shadow-lg transition ${btnPrimary}`}
            >
              {t('verifyEmail.ctaLogin')}
              <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center text-center">
            <div className={`relative flex h-16 w-16 items-center justify-center rounded-2xl ${iconWrap}`}>
              {loading ? (
                <Loader2 className="h-8 w-8 animate-spin" strokeWidth={1.75} aria-hidden />
              ) : (
                <Sparkles className="h-8 w-8" strokeWidth={1.75} aria-hidden />
              )}
            </div>
            <h1 className={`mt-6 text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>{t('verifyEmail.titlePending')}</h1>
            <p className={`mt-3 max-w-md text-base leading-relaxed sm:text-lg ${mutedCls}`}>
              {loading ? t('verifyEmail.bodyLoading') : t('verifyEmail.bodyDone')}
            </p>
            <div
              className={`mx-auto mt-6 h-1.5 w-44 overflow-hidden rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}
            >
              <div
                className={`h-full w-1/2 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r ${
                  isDarkMode ? 'from-cyan-500 to-teal-500' : 'from-cyan-500 to-sky-500'
                }`}
              />
            </div>
          </div>
        </>
      )}
    </AuthPageLayout>
  );
}

export default VerifyEmailPage;
