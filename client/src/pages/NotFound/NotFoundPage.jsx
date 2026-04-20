import { Link } from 'react-router-dom';
import { Rocket } from 'lucide-react';
import { GradientButton } from '../../components/Shared';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import { appShellBg } from '../../theme/shellTheme';

function NotFoundPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const shell = isDarkMode
    ? 'min-h-screen flex items-center justify-center bg-[#050810] px-6'
    : `min-h-screen flex items-center justify-center px-6 ${appShellBg(false)}`;

  return (
    <div className={shell}>
      <div className="text-center">
        <div className={`mb-6 flex justify-center ${isDarkMode ? 'text-cyan-400' : 'text-cyan-600'}`}>
          <Rocket className="h-24 w-24 animate-float" strokeWidth={1.35} aria-hidden />
        </div>
        <h1 className="mb-4 bg-gradient-to-r from-cyan-500 to-teal-600 bg-clip-text text-6xl font-black text-transparent">
          404
        </h1>
        <p className={`mb-8 text-2xl ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('notFound.title')}</p>
        <Link to="/dashboard">
          <GradientButton variant="primary">{t('notFound.cta')}</GradientButton>
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
