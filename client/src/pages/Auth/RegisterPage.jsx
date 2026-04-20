import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { authInputError, authInputSurface, authPrimaryButtonClass } from '../../components/Auth/authFieldClasses';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();

  const inputOk = authInputSurface(isDarkMode, { dense: true });
  const inputErr = authInputError(isDarkMode, { dense: true });
  const labelCls = isDarkMode ? 'text-slate-200' : 'text-slate-700';
  const mutedCls = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const titleCls = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const linkCyan = isDarkMode ? 'font-semibold text-cyan-400 hover:underline' : 'font-semibold text-cyan-700 hover:underline';
  const chk = isDarkMode
    ? 'mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-slate-600 bg-[#0c1018] text-cyan-500'
    : 'mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 rounded border-slate-300 text-cyan-600';
  const barEmpty = isDarkMode ? 'bg-slate-700' : 'bg-slate-200';
  const btnPrimary = authPrimaryButtonClass(isDarkMode);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const calculatePasswordStrength = (password) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    return strength;
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setFormData({ ...formData, password: newPassword });
    setPasswordStrength(calculatePasswordStrength(newPassword));
  };

  const getStrengthColor = () => {
    if (passwordStrength === 0) return 'from-slate-400 to-slate-500';
    if (passwordStrength === 1) return 'from-red-500 to-orange-500';
    if (passwordStrength === 2) return 'from-amber-500 to-orange-500';
    if (passwordStrength === 3) return 'from-emerald-500 to-teal-500';
    return 'from-emerald-600 to-teal-600';
  };

  const strengthKeys = ['register.strength0', 'register.strength1', 'register.strength2', 'register.strength3', 'register.strength4'];
  const getStrengthText = () => t(strengthKeys[passwordStrength] ?? strengthKeys[0]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.lastName || formData.lastName.trim().length < 1) {
      newErrors.lastName = t('register.errLastNameRequired');
    } else if (formData.lastName.trim().length < 2) {
      newErrors.lastName = t('register.errLastNameMin');
    }

    if (!formData.firstName || formData.firstName.trim().length < 1) {
      newErrors.firstName = t('register.errFirstNameRequired');
    } else if (formData.firstName.trim().length < 2) {
      newErrors.firstName = t('register.errFirstNameMin');
    }

    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t('register.errEmail');
    }

    if (!formData.password || formData.password.length < 8) {
      newErrors.password = t('register.errPasswordMin');
    } else if (passwordStrength < 3) {
      newErrors.password = t('register.errPasswordComplex');
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = t('register.errConfirmRequired');
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = t('register.errConfirmMismatch');
    }

    if (!agreedToTerms) {
      newErrors.terms = t('register.errTerms');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      const firstName = formData.firstName.trim();
      const lastName = formData.lastName.trim();

      const success = await register({
        firstName,
        lastName,
        email: formData.email,
        password: formData.password,
      });

      if (success) {
        navigate('/login', {
          state: {
            message: t('register.successMessage'),
          },
        });
      }
    } catch (error) {
      console.error('[RegisterPage] Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout aside={<AuthMarketingAside />}>
      <h2 className={`text-[1.65rem] font-bold tracking-tight sm:text-[1.85rem] ${titleCls}`}>{t('register.title')}</h2>
      <p className={`mt-3 text-base leading-relaxed sm:text-lg ${mutedCls}`}>{t('register.subtitle')}</p>

      <form className="mt-8 space-y-5" onSubmit={handleRegister}>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.lastName')}</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => {
                setFormData({ ...formData, lastName: e.target.value });
                if (errors.lastName) setErrors({ ...errors, lastName: '' });
              }}
              className={errors.lastName ? inputErr : inputOk}
              placeholder={t('register.placeholderLastName')}
            />
            {errors.lastName && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.lastName}</p>}
          </div>

          <div>
            <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.firstName')}</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => {
                setFormData({ ...formData, firstName: e.target.value });
                if (errors.firstName) setErrors({ ...errors, firstName: '' });
              }}
              className={errors.firstName ? inputErr : inputOk}
              placeholder={t('register.placeholderFirstName')}
            />
            {errors.firstName && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.firstName}</p>}
          </div>
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.email')}</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (errors.email) setErrors({ ...errors, email: '' });
            }}
            className={errors.email ? inputErr : inputOk}
            placeholder={t('register.placeholderEmail')}
          />
          {errors.email && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.email}</p>}
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.password')}</label>
          <input
            type="password"
            value={formData.password}
            onChange={handlePasswordChange}
            className={inputOk}
            placeholder={t('common.passwordPlaceholder')}
          />
          {formData.password && (
            <div className="mt-2">
              <div className="mb-1 flex gap-1">
                {[...Array(4)].map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      idx < passwordStrength ? `bg-gradient-to-r ${getStrengthColor()}` : barEmpty
                    }`}
                  />
                ))}
              </div>
              <p
                className={`text-sm font-semibold bg-gradient-to-r ${getStrengthColor()} bg-clip-text text-transparent`}
              >
                {getStrengthText()}
              </p>
            </div>
          )}
          {errors.password && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.password}</p>}
        </div>

        <div>
          <label className={`mb-2.5 block text-base font-semibold ${labelCls}`}>{t('register.confirmPassword')}</label>
          <input
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => {
              setFormData({ ...formData, confirmPassword: e.target.value });
              if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
            }}
            className={errors.confirmPassword ? inputErr : inputOk}
            placeholder={t('common.confirmPasswordPlaceholder')}
          />
          {errors.confirmPassword && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
          )}
        </div>

        <div>
          <label className={`flex cursor-pointer items-start gap-3 text-base leading-snug ${mutedCls}`}>
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => {
                setAgreedToTerms(e.target.checked);
                if (errors.terms) setErrors({ ...errors, terms: '' });
              }}
              className={`${chk} focus:ring-cyan-600/30`}
            />
            <span>
              {t('register.agreePrefix')}{' '}
              <Link to="/terms-of-service" className={linkCyan}>
                {t('register.termsLink')}
              </Link>{' '}
              {t('register.termsAnd')}{' '}
              <Link to="/privacy-policy" className={linkCyan}>
                {t('register.privacyLink')}
              </Link>
              {t('register.termsSuffix')}
            </span>
          </label>
          {errors.terms && <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{errors.terms}</p>}
        </div>

        <button
          type="submit"
          disabled={
            loading ||
            !agreedToTerms ||
            !formData.firstName ||
            !formData.lastName ||
            !formData.email ||
            !formData.password ||
            !formData.confirmPassword
          }
          className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60 ${btnPrimary}`}
        >
          {loading ? t('register.submitting') : t('register.submit')}
          {!loading && <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />}
        </button>
      </form>
    </AuthPageLayout>
  );
}

export default RegisterPage;
