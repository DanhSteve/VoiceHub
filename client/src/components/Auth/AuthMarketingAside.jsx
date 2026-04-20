import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Cột trái auth — typography lớn hơn một bậc để dễ đọc; nền họa tiết do AuthAsideAmbient xử lý.
 */
function AuthMarketingAside() {
  const { isDarkMode } = useTheme();
  const { t, dict } = useAppStrings();
  const chipLabels = dict.authMarketing.chips;

  const badgeOuter = isDarkMode
    ? 'border-slate-600/55 bg-slate-900/50 text-slate-200'
    : 'border-white/35 bg-white/12 text-white';
  const badgeInner = isDarkMode ? 'text-cyan-300/95' : 'text-white';
  const accentBar = isDarkMode ? 'border-cyan-400/55' : 'border-white/85';
  const h1Main = 'text-white';
  const h1Sub = isDarkMode ? 'text-slate-200' : 'text-white/95';
  const body = isDarkMode ? 'text-slate-300' : 'text-white/92';
  const quote = isDarkMode
    ? 'border-cyan-500/30 bg-slate-900/30 text-slate-400'
    : 'border-white/40 bg-white/[0.08] text-white/85';
  const foot = isDarkMode ? 'text-slate-500' : 'text-white/75';
  const chips = isDarkMode ? 'border-slate-700/50 bg-slate-900/25 text-slate-400' : 'border-white/20 bg-white/[0.08] text-white/88';

  return (
    <div className="flex max-w-lg flex-col gap-8 lg:gap-10">
      <div>
        <p
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium tracking-wide backdrop-blur-sm sm:text-sm ${badgeOuter}`}
        >
          <span className={`font-semibold ${badgeInner}`}>VoiceHub</span>
          <span className={isDarkMode ? 'text-slate-500' : 'text-white/50'} aria-hidden>
            /
          </span>
          <span className={isDarkMode ? 'text-slate-400' : 'text-white/85'}>{t('authMarketing.badgeSub')}</span>
        </p>
      </div>

      <div className={`border-l-[3px] pl-5 sm:pl-7 ${accentBar}`}>
        <h1
          className={`font-semibold leading-snug tracking-tight ${h1Main} text-[1.55rem] sm:text-[1.85rem] xl:text-[2.2rem] xl:leading-[1.2]`}
        >
          {t('authMarketing.h1a')}
          <span className={`mt-2 block font-bold ${h1Sub} text-[1.3rem] sm:text-[1.65rem] xl:text-[1.95rem]`}>
            {t('authMarketing.h1b')}
          </span>
        </h1>
      </div>

      <div className="space-y-5">
        <p className={`text-base leading-[1.75] sm:text-lg ${body}`}>{t('authMarketing.body')}</p>

        <blockquote className={`border-l-2 py-1 pl-5 text-sm font-normal italic leading-relaxed sm:text-base ${quote}`}>
          {t('authMarketing.quote')}
        </blockquote>

        <p className={`text-sm leading-relaxed sm:text-[0.95rem] ${foot}`}>{t('authMarketing.foot')}</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {chipLabels.map((label) => (
          <span
            key={label}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium sm:text-sm ${chips}`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default AuthMarketingAside;
