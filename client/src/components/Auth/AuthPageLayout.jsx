import { Link, NavLink } from 'react-router-dom';
import { Cloud, Home, Languages, Mic, Moon, Shield, Sun } from 'lucide-react';
import AuthAsideAmbient from './AuthAsideAmbient';
import AuthMainAmbient from './AuthMainAmbient';
import ShellWaveBackdrop from '../Layout/ShellWaveBackdrop';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

function FeatureTile({ icon: Icon, label, isDark }) {
  if (isDark) {
    return (
      <div className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-600/50 bg-slate-900/35 px-2 py-5 text-center shadow-sm ring-1 ring-white/[0.04] transition hover:border-cyan-500/35 hover:bg-slate-800/50 sm:px-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/[0.12] text-cyan-300 transition group-hover:bg-cyan-500/20 group-hover:text-cyan-200">
          <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
        </div>
        <span className="text-base font-semibold tracking-wide text-slate-200">{label}</span>
      </div>
    );
  }
  return (
    <div className="group flex flex-col items-center gap-3 rounded-2xl border border-white/30 bg-white/[0.12] px-2 py-5 text-center backdrop-blur-md transition hover:border-white/45 hover:bg-white/[0.18] sm:px-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white transition group-hover:bg-white/30">
        <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
      </div>
      <span className="text-base font-semibold tracking-wide text-white">{label}</span>
    </div>
  );
}

function AuthPageLayout({ aside, children, contentMaxWidth = 'max-w-lg', mainAlign = 'center' }) {
  const { locale, toggleLocale } = useLocale();
  const { t } = useAppStrings();
  const { isDarkMode, toggleTheme } = useTheme();
  const mainJustify = mainAlign === 'start' ? 'justify-start' : 'justify-center';

  const shellBg = isDarkMode
    ? 'bg-[#050810] text-slate-100'
    : 'bg-gradient-to-b from-sky-100 via-cyan-50/80 to-slate-200 text-slate-900';

  const asideClass = isDarkMode
    ? 'bg-[#101827] text-white shadow-inner'
    : 'bg-gradient-to-br from-[#5eead4] via-[#0ea5e9] to-[#1e3a8a] text-white shadow-inner';

  const headerClass = isDarkMode
    ? 'border-slate-800/60 bg-[#050810]/95 text-slate-100'
    : 'border-sky-200/90 bg-sky-50/95 text-slate-900';

  const homeBtn = isDarkMode
    ? 'border-slate-600 bg-slate-900 text-white hover:bg-slate-800'
    : 'border-slate-300/90 bg-white text-slate-700 hover:bg-slate-50';

  const segmentTrack = isDarkMode ? 'bg-slate-900/90' : 'bg-slate-200/95';

  const themeBtn = isDarkMode
    ? 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800'
    : 'border-slate-300/90 bg-white text-slate-700 hover:bg-slate-50';

  const cardClass = isDarkMode
    ? 'border-slate-700/50 bg-[#151c2c] shadow-[0_24px_64px_-20px_rgba(0,0,0,0.75)]'
    : 'border-slate-200/90 bg-white shadow-[0_20px_56px_-24px_rgba(15,23,42,0.2)]';

  return (
    <div
      className={`relative flex min-h-screen flex-col font-sans lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,40%)_minmax(0,1fr)] ${shellBg}`}
    >
      <ShellWaveBackdrop />
      <aside
        className={`relative z-[1] order-1 flex min-h-[min(44vh,340px)] flex-col justify-between overflow-hidden px-8 py-10 sm:px-10 lg:order-none lg:min-h-screen lg:px-10 lg:py-12 xl:px-12 ${asideClass}`}
      >
        {!isDarkMode && (
          <>
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_0%,rgba(255,255,255,0.22),transparent_55%)]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-0 right-0 h-56 w-56 translate-x-1/3 translate-y-1/3 rounded-full bg-indigo-500/25 blur-3xl"
              aria-hidden
            />
          </>
        )}
        {isDarkMode && (
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_50%_120%,rgba(14,165,233,0.06),transparent_50%)]"
            aria-hidden
          />
        )}

        <AuthAsideAmbient isDark={isDarkMode} />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-between gap-10 lg:gap-12">
          <div className="shrink-0">{aside}</div>
          <div className="grid shrink-0 grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
            <FeatureTile icon={Cloud} label={t('authLayout.featureCloud')} isDark={isDarkMode} />
            <FeatureTile icon={Mic} label={t('authLayout.featureVoice')} isDark={isDarkMode} />
            <FeatureTile icon={Shield} label={t('authLayout.featureSecurity')} isDark={isDarkMode} />
          </div>
        </div>
      </aside>

      <div className="relative z-[1] order-2 flex min-h-0 flex-1 flex-col lg:min-h-screen">
        <header
          className={`flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3.5 backdrop-blur-md sm:gap-3 sm:px-6 ${headerClass}`}
        >
          <Link
            to="/"
            className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold shadow-sm transition sm:text-sm ${homeBtn}`}
          >
            <Home
              className={`h-4 w-4 shrink-0 ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="truncate">{t('authLayout.home')}</span>
          </Link>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className={`flex rounded-full p-1 ${segmentTrack}`}>
              <NavLink
                to="/login"
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                    isActive
                      ? isDarkMode
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'bg-white text-slate-900 shadow-sm'
                      : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                  }`
                }
              >
                {t('authLayout.login')}
              </NavLink>
              <NavLink
                to="/register"
                className={({ isActive }) =>
                  `rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm'
                      : isDarkMode
                        ? 'text-slate-400 hover:text-white'
                        : 'text-slate-600 hover:text-slate-900'
                  }`
                }
              >
                {t('authLayout.register')}
              </NavLink>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm transition ${themeBtn}`}
              aria-label={isDarkMode ? t('authLayout.ariaThemeLight') : t('authLayout.ariaThemeDark')}
            >
              {isDarkMode ? <Sun className="h-4 w-4" strokeWidth={1.75} /> : <Moon className="h-4 w-4" strokeWidth={1.75} />}
            </button>

            <button
              type="button"
              onClick={toggleLocale}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm transition ${themeBtn}`}
              aria-label={t('nav.ariaLang')}
              title={locale === 'vi' ? t('nav.langTitleToEn') : t('nav.langTitleToVi')}
            >
              <Languages className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </header>

        <main
          className={`relative flex flex-1 flex-col ${mainJustify} overflow-hidden px-4 py-8 sm:px-8 sm:py-10 lg:px-12 lg:py-8`}
        >
          <AuthMainAmbient isDark={isDarkMode} />
          <div className={`relative z-10 mx-auto w-full ${contentMaxWidth}`}>
            <div className={`rounded-[1.25rem] border p-6 sm:p-9 ${cardClass}`}>{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AuthPageLayout;
