import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';
import AuthPageLayout from '../../components/Auth/AuthPageLayout';
import AuthMarketingAside from '../../components/Auth/AuthMarketingAside';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

function PrivacyPolicyPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const h1 = isDarkMode ? 'text-white' : 'text-[#0f172a]';
  const h2 = isDarkMode ? 'text-white' : 'text-slate-900';
  const body = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const linkCyan = isDarkMode ? 'text-cyan-400 hover:underline' : 'text-cyan-700 hover:underline';
  const callout = isDarkMode
    ? 'rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] p-4 text-cyan-100'
    : 'rounded-xl border border-cyan-200/90 bg-cyan-50 p-4 text-cyan-950';
  const iconWrap = isDarkMode ? 'bg-cyan-500/15 text-cyan-300' : 'bg-cyan-100 text-cyan-700';

  return (
    <AuthPageLayout aside={<AuthMarketingAside />} contentMaxWidth="max-w-4xl" mainAlign="start">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconWrap}`}>
            <Shield className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div>
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${h1}`}>{t('privacyPolicy.title')}</h1>
            <p className={`mt-2 text-base ${body}`}>{t('privacyPolicy.subtitle')}</p>
          </div>
        </div>
        <Link
          to="/register"
          className={`inline-flex shrink-0 items-center gap-2 self-start text-base font-semibold ${linkCyan}`}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {t('privacyPolicy.backToRegister')}
        </Link>
      </div>

      <div className={`space-y-6 text-base leading-relaxed ${body}`}>
        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>{t('privacyPolicy.s1h')}</h2>
          <p>{t('privacyPolicy.s1p')}</p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>{t('privacyPolicy.s2h')}</h2>
          <p>{t('privacyPolicy.s2p')}</p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>{t('privacyPolicy.s3h')}</h2>
          <p>{t('privacyPolicy.s3p')}</p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>{t('privacyPolicy.s4h')}</h2>
          <p>{t('privacyPolicy.s4p')}</p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>{t('privacyPolicy.s5h')}</h2>
          <p>{t('privacyPolicy.s5p')}</p>
        </section>

        <section>
          <h2 className={`mb-2 text-lg font-semibold ${h2}`}>{t('privacyPolicy.s6h')}</h2>
          <p>{t('privacyPolicy.s6p')}</p>
        </section>

        <section className={callout}>
          <p className="text-base">
            {t('privacyPolicy.callout')}
            <span className="font-semibold">{t('privacyPolicy.calloutEmail')}</span>.
          </p>
        </section>
      </div>
    </AuthPageLayout>
  );
}

export default PrivacyPolicyPage;
