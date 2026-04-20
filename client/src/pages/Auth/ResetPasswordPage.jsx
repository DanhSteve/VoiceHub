import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, KeyRound, LogIn } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { authInputSurface, authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { useTheme } from '../../context/ThemeContext';
import authService from '../../services/authService';
import { useAppStrings } from '../../locales/appStrings';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const inputOk = authInputSurface(isDarkMode, { dense: true });
  const btnPrimary = authPrimaryButtonClass(isDarkMode);
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const labelCls = isDarkMode ? 'text-slate-200' : 'text-slate-700';
  const barEmpty = isDarkMode ? 'bg-slate-700' : 'bg-slate-200';

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^a-zA-Z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  const getStrengthColor = () => {
    if (passwordStrength === 0) return 'from-slate-400 to-slate-500';
    if (passwordStrength === 1) return 'from-red-500 to-orange-500';
    if (passwordStrength === 2) return 'from-amber-500 to-orange-500';
    if (passwordStrength === 3) return 'from-emerald-500 to-teal-500';
    return 'from-emerald-600 to-teal-600';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!token) {
      toast.error(t('resetPassword.toastInvalidToken'));
      return;
    }
    if (password.length < 8) {
      toast.error(t('resetPassword.toastPasswordMin'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('resetPassword.toastConfirmMismatch'));
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      toast.success(t('resetPassword.toastSuccess'));
      navigate('/login', {
        state: { message: t('resetPassword.loginFlashMessage') },
      });
    } catch (error) {
      const message = error?.message || t('resetPassword.toastResetErr');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout aside={<AuthMarketingAside />}>
      <div className="mb-1 flex justify-end">
        <Link
          to="/login"
          className={`inline-flex items-center gap-2 text-base font-semibold ${isDarkMode ? 'text-cyan-400 hover:underline' : 'text-cyan-700 hover:underline'}`}
        >
          <LogIn className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {t('resetPassword.loginLink')}
        </Link>
      </div>

      <div className="mt-3 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700'
          }`}
        >
          <KeyRound className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className={`text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>{t('resetPassword.title')}</h1>
          <p className={`mt-2 text-base leading-relaxed sm:text-lg ${mutedCls}`}>{t('resetPassword.subtitle')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label htmlFor="password" className={`mb-2.5 block text-base font-semibold ${labelCls}`}>
            {t('resetPassword.newPassword')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputOk}
            placeholder={t('common.passwordPlaceholder')}
            autoComplete="new-password"
          />
          {password && (
            <div className="mt-2">
              <div className="mb-1 flex gap-1">
                {[0, 1, 2, 3].map((slot) => (
                  <div
                    key={slot}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      slot < passwordStrength ? `bg-gradient-to-r ${getStrengthColor()}` : barEmpty
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className={`mb-2.5 block text-base font-semibold ${labelCls}`}>
            {t('resetPassword.confirmNewPassword')}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={inputOk}
            placeholder={t('common.confirmPasswordPlaceholder')}
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${btnPrimary}`}
        >
          {loading ? t('resetPassword.updating') : t('resetPassword.update')}
          {!loading && <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />}
        </button>
      </form>

      <Link
        to="/login"
        className={`mt-8 block text-center text-base font-medium ${mutedCls} hover:text-cyan-600 dark:hover:text-cyan-300`}
      >
        {t('resetPassword.backToLogin')}
      </Link>
    </AuthPageLayout>
  );
}

export default ResetPasswordPage;
