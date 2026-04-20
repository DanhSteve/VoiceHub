import { useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GradientButton } from '../../components/Shared';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';

function OrgChatPage() {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const shell = isDarkMode
    ? 'h-screen flex overflow-hidden bg-[#050810] text-slate-100'
    : `h-screen flex overflow-hidden ${appShellBg(false)} text-slate-900`;
  const card = isDarkMode
    ? 'w-full max-w-md rounded-2xl border border-slate-700/80 bg-[#101827]/90 p-6 text-center shadow-xl backdrop-blur-sm'
    : 'w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg';

  return (
    <div className={shell}>
      <NavigationSidebar currentPage={t('orgChat.currentPage')} />
      <div className="flex flex-1 items-center justify-center p-6">
        <div className={card}>
          <h2 className={`mb-2 text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{t('orgChat.title')}</h2>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('orgChat.body1')}</p>
          <p className={`mt-1 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>{t('orgChat.body2')}</p>
          <GradientButton
            type="button"
            variant="primary"
            className="mt-6 w-full py-3 text-sm font-semibold"
            onClick={() => navigate('/chat/friends')}
          >
            {t('orgChat.openFriendChat')}
          </GradientButton>
        </div>
      </div>
    </div>
  );
}

export default OrgChatPage;
