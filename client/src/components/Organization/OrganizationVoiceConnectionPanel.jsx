import { PhoneOff } from 'lucide-react';

/**
 * Thanh trạng thái voice trên sidebar tổ chức (Discord-style): đã kết nối + ngắt kết nối kênh.
 */
export default function OrganizationVoiceConnectionPanel({
  isDarkMode,
  t,
  connected = false,
  channelLabel = '',
  orgName = '',
  onDisconnect,
}) {
  const path = [channelLabel, orgName].filter(Boolean).join(' / ');
  const statusText = connected ? t('orgPanel.voiceConnectedNow') : t('orgPanel.voiceConnecting');

  return (
    <div
      className={`mx-2 mb-2 mt-1 shrink-0 rounded-xl border px-3 py-2.5 ${
        isDarkMode
          ? 'border-white/[0.08] bg-[#171B24] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border-slate-200/90 bg-slate-50 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold leading-tight ${
              connected
                ? isDarkMode
                  ? 'text-emerald-400'
                  : 'text-emerald-600'
                : isDarkMode
                  ? 'text-[#b5bac1]'
                  : 'text-slate-600'
            }`}
          >
            {statusText}
          </p>
          {path ? (
            <p
              className={`mt-0.5 truncate text-[11px] ${
                isDarkMode ? 'text-[#949ba4]' : 'text-slate-500'
              }`}
            >
              {path}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          title={t('orgPanel.voiceDisconnect')}
          aria-label={t('orgPanel.voiceDisconnect')}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
            isDarkMode
              ? 'bg-[#1D2330] text-[#A1A8B3] hover:bg-[#252b3a] hover:text-[#F3F4F6]'
              : 'bg-white text-slate-600 shadow-sm hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <PhoneOff className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
