import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Mic, MicOff, Settings, Volume2, VolumeX } from 'lucide-react';
import { loadVoiceAudioPrefs, saveVoiceAudioPrefs } from '../../pages/Voice/voiceAudioPrefs';

const PTT_KEY = 'vh.voice.pushToTalk';

function clampVolume(v) {
  return Math.min(100, Math.max(0, Number(v) || 0));
}

function deviceLabel(device, fallback) {
  const label = String(device?.label || '').trim();
  return label || fallback;
}

function SplitAudioButton({
  isDarkMode,
  isMutedStyle,
  disabled,
  onMainClick,
  onMenuClick,
  menuOpen,
  mainTitle,
  menuTitle,
  mainIcon,
  mutedIcon,
}) {
  const mainCls = isMutedStyle
    ? isDarkMode
      ? 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
      : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
    : isDarkMode
      ? 'text-slate-200 hover:bg-white/10'
      : 'text-slate-600 hover:bg-slate-200';

  const menuCls = menuOpen
    ? isDarkMode
      ? 'bg-white/10 text-white'
      : 'bg-slate-200 text-slate-900'
    : isDarkMode
      ? 'text-slate-300 hover:bg-white/10'
      : 'text-slate-600 hover:bg-slate-200';

  return (
    <div className="flex h-8 items-center" data-audio-split>
      <button
        type="button"
        disabled={disabled}
        title={mainTitle}
        onClick={onMainClick}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition disabled:opacity-40 ${mainCls}`}
      >
        {isMutedStyle ? mutedIcon : mainIcon}
      </button>
      <button
        type="button"
        title={menuTitle}
        onClick={onMenuClick}
        className={`flex h-8 w-7 shrink-0 items-center justify-center rounded-md transition ${menuCls}`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RadioDeviceRow({ selected, label, sub, onSelect, isDarkMode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
        isDarkMode ? 'hover:bg-white/[0.06] text-white' : 'hover:bg-slate-100 text-slate-900'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{label}</div>
        {sub ? (
          <div className={`truncate text-xs ${isDarkMode ? 'text-[#949ba4]' : 'text-slate-500'}`}>{sub}</div>
        ) : null}
      </div>
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
          selected
            ? 'border-[#5865F2] bg-[#5865F2]'
            : isDarkMode
              ? 'border-[#4e5058]'
              : 'border-slate-300'
        }`}
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}

/**
 * Thanh mic/loa cuối sidebar tổ chức — nút tách + popup nhanh (Discord-style).
 */
export default function OrganizationSidebarAudioBar({
  isDarkMode,
  t,
  voiceUserId = '',
  voiceInChannel = false,
  voiceAudioState = {},
  onToggleMute,
  onToggleSpeaker,
  onAudioPrefChange,
  onOpenOrganizationSettings,
  onOpenVoiceSettings,
}) {
  const initial = loadVoiceAudioPrefs(voiceUserId);
  const [prefMuted, setPrefMuted] = useState(Boolean(initial.micMuted));
  const [prefSpeakerOff, setPrefSpeakerOff] = useState(Boolean(initial.speakerOff));
  const [micId, setMicId] = useState(initial.micDeviceId);
  const [speakerId, setSpeakerId] = useState(initial.speakerDeviceId);
  const [micVolume, setMicVolume] = useState(initial.micVolume);
  const [speakerVolume, setSpeakerVolume] = useState(initial.speakerVolume);
  const [pushToTalk, setPushToTalk] = useState(() => localStorage.getItem(PTT_KEY) === '1');
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [quickMenu, setQuickMenu] = useState(null);
  const [deviceSubmenu, setDeviceSubmenu] = useState(null);

  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  const { isMuted: liveMuted = false, isSpeakerOff: liveSpeakerOff = false, canToggleMute = false } =
    voiceAudioState;

  const isMuted = voiceInChannel ? liveMuted : prefMuted;
  const isSpeakerOff = voiceInChannel ? liveSpeakerOff : prefSpeakerOff;

  useEffect(() => {
    if (!voiceInChannel) return;
    setPrefMuted(liveMuted);
    setPrefSpeakerOff(liveSpeakerOff);
  }, [voiceInChannel, liveMuted, liveSpeakerOff]);

  const handleMicMainClick = () => {
    const next = !isMuted;
    saveVoiceAudioPrefs({ micMuted: next }, voiceUserId);
    if (!voiceInChannel) {
      setPrefMuted(next);
      onAudioPrefChange?.({ micMuted: next, speakerOff: prefSpeakerOff });
      return;
    }
    if (canToggleMute && onToggleMute) {
      onToggleMute();
      return;
    }
    setPrefMuted(next);
    onAudioPrefChange?.({ micMuted: next, speakerOff: isSpeakerOff });
  };

  const handleSpeakerMainClick = () => {
    const next = !isSpeakerOff;
    saveVoiceAudioPrefs({ speakerOff: next }, voiceUserId);
    if (!voiceInChannel) {
      setPrefSpeakerOff(next);
      onAudioPrefChange?.({ micMuted: prefMuted, speakerOff: next });
      return;
    }
    if (onToggleSpeaker) {
      onToggleSpeaker();
      return;
    }
    setPrefSpeakerOff(next);
    onAudioPrefChange?.({ micMuted: isMuted, speakerOff: next });
  };

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((d) => d.kind === 'audioinput'));
      setAudioOutputs(list.filter((d) => d.kind === 'audiooutput'));
    } catch (e) {
      console.warn(e);
    }
  }, []);

  const ensurePermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      await refreshDevices();
    } catch (e) {
      console.warn(e);
    }
  }, [refreshDevices]);

  useEffect(() => {
    if (!quickMenu) return undefined;
    ensurePermission();
    const onDoc = (e) => {
      const root = rootRef.current;
      if (!root?.contains(e.target)) {
        setQuickMenu(null);
        setDeviceSubmenu(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [quickMenu, ensurePermission]);

  const selectedMic = audioInputs.find((d) => d.deviceId === micId) || null;
  const selectedSpeaker = audioOutputs.find((d) => d.deviceId === speakerId) || null;
  const micDisplayName = deviceLabel(selectedMic, t('orgPanel.quickDefaultMic'));
  const speakerDisplayName = deviceLabel(selectedSpeaker, t('orgPanel.quickDefaultSpeaker'));

  const pickMic = (id) => {
    setMicId(id);
    saveVoiceAudioPrefs({ micDeviceId: id });
    setDeviceSubmenu(null);
  };

  const pickSpeaker = (id) => {
    setSpeakerId(id);
    saveVoiceAudioPrefs({ speakerDeviceId: id });
    setDeviceSubmenu(null);
  };

  const onMicVolume = (v) => {
    const n = clampVolume(v);
    setMicVolume(n);
    saveVoiceAudioPrefs({ micVolume: n });
  };

  const onSpeakerVolume = (v) => {
    const n = clampVolume(v);
    setSpeakerVolume(n);
    saveVoiceAudioPrefs({ speakerVolume: n });
  };

  const toggleQuickMenu = (kind) => {
    setDeviceSubmenu(null);
    setQuickMenu((prev) => (prev === kind ? null : kind));
  };

  const popoverShell = isDarkMode
    ? 'rounded-lg border border-[#1e1f22] bg-[#111214] shadow-xl shadow-black/40'
    : 'rounded-lg border border-slate-200 bg-white shadow-xl';

  const rowBtn = isDarkMode
    ? 'hover:bg-white/[0.06] text-white'
    : 'hover:bg-slate-50 text-slate-900';

  const subText = isDarkMode ? 'text-[#949ba4]' : 'text-slate-500';

  const renderDeviceSubmenu = () => {
    if (!deviceSubmenu) return null;
    const isMic = deviceSubmenu === 'mic';
    const list = isMic ? audioInputs : audioOutputs;
    const selectedId = isMic ? micId : speakerId;
    const onPick = isMic ? pickMic : pickSpeaker;

    return (
      <div
        className={`absolute bottom-0 left-full z-50 ml-1 w-[min(280px,calc(100vw-2rem))] py-1 ${popoverShell}`}
        role="menu"
      >
        <RadioDeviceRow
          selected={!selectedId}
          label={t('orgPanel.quickWindowsDefault')}
          sub={list[0] ? deviceLabel(list[0], '') : ''}
          onSelect={() => onPick('')}
          isDarkMode={isDarkMode}
        />
        {list.map((d) => (
          <RadioDeviceRow
            key={d.deviceId}
            selected={selectedId === d.deviceId}
            label={deviceLabel(d, isMic ? t('orgPanel.quickMicFallback') : t('orgPanel.quickSpeakerFallback'))}
            onSelect={() => onPick(d.deviceId)}
            isDarkMode={isDarkMode}
          />
        ))}
      </div>
    );
  };

  const renderQuickPopover = () => {
    if (!quickMenu) return null;
    const isMic = quickMenu === 'mic';

    return (
      <div
        ref={popoverRef}
        className={`absolute bottom-full left-0 z-40 mb-2 w-[min(300px,calc(100vw-2rem))] py-1 ${popoverShell}`}
        role="dialog"
        aria-label={isMic ? t('orgPanel.quickInputDevice') : t('orgPanel.quickOutputDevice')}
      >
        <button
          type="button"
          className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition ${rowBtn}`}
          onClick={() => setDeviceSubmenu(isMic ? 'mic' : 'speaker')}
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">
              {isMic ? t('orgPanel.quickInputDevice') : t('orgPanel.quickOutputDevice')}
            </div>
            <div className={`truncate text-xs ${subText}`}>
              {isMic ? micDisplayName : speakerDisplayName}
            </div>
          </div>
          <ChevronRight className={`h-4 w-4 shrink-0 ${subText}`} />
        </button>

        <div className={`mx-3 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`} />

        <div className="px-3 py-3">
          <div className="mb-2 text-sm font-semibold">
            {isMic ? t('orgPanel.quickInputVolume') : t('orgPanel.quickOutputVolume')}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={isMic ? micVolume : speakerVolume}
            onChange={(e) => (isMic ? onMicVolume(e.target.value) : onSpeakerVolume(e.target.value))}
            className="w-full accent-[#5865F2]"
          />
        </div>

        {isMic ? (
          <button
            type="button"
            className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold transition ${rowBtn}`}
            onClick={() => {
              const next = !pushToTalk;
              setPushToTalk(next);
              localStorage.setItem(PTT_KEY, next ? '1' : '0');
            }}
          >
            <span>{t('orgPanel.quickPushToTalk')}</span>
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded ${
                pushToTalk ? 'bg-[#5865F2] text-white' : isDarkMode ? 'border border-[#4e5058]' : 'border border-slate-300'
              }`}
            >
              {pushToTalk ? (
                <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
                  <path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 1 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
                </svg>
              ) : null}
            </span>
          </button>
        ) : null}

        <div className={`mx-3 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`} />

        <button
          type="button"
          className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold transition ${rowBtn}`}
          onClick={() => {
            setQuickMenu(null);
            setDeviceSubmenu(null);
            onOpenVoiceSettings?.();
          }}
        >
          <span>{t('orgPanel.quickVoiceSettings')}</span>
          <Settings className={`h-4 w-4 ${subText}`} />
        </button>

        {renderDeviceSubmenu()}
      </div>
    );
  };

  const barBorder = isDarkMode ? 'border-white/[0.06]' : 'border-sky-200/70';

  return (
    <div
      ref={rootRef}
      className={`relative flex w-full items-center justify-center gap-1.5 border-t px-3 py-2.5 pb-3 ${barBorder}`}
    >
      <SplitAudioButton
        isDarkMode={isDarkMode}
        isMutedStyle={isMuted}
        disabled={false}
        onMainClick={handleMicMainClick}
        onMenuClick={() => toggleQuickMenu('mic')}
        menuOpen={quickMenu === 'mic'}
        mainTitle={isMuted ? t('orgPanel.voiceUnmute') : t('orgPanel.voiceMute')}
        menuTitle={t('orgPanel.quickMicMenu')}
        mainIcon={<Mic className="h-4 w-4" />}
        mutedIcon={<MicOff className="h-4 w-4" />}
      />
      <SplitAudioButton
        isDarkMode={isDarkMode}
        isMutedStyle={isSpeakerOff}
        disabled={false}
        onMainClick={handleSpeakerMainClick}
        onMenuClick={() => toggleQuickMenu('speaker')}
        menuOpen={quickMenu === 'speaker'}
        mainTitle={isSpeakerOff ? t('orgPanel.voiceSpeakerOn') : t('orgPanel.voiceSpeakerOff')}
        menuTitle={t('orgPanel.quickSpeakerMenu')}
        mainIcon={<Volume2 className="h-4 w-4" />}
        mutedIcon={<VolumeX className="h-4 w-4" />}
      />
      <button
        type="button"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition ${
          isDarkMode ? 'text-slate-200 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'
        }`}
        aria-label={t('orgPanel.orgSettingsAria')}
        title={t('orgPanel.orgSettingsAria')}
        onClick={onOpenOrganizationSettings}
      >
        <Settings className="h-4 w-4" />
      </button>
      {renderQuickPopover()}
    </div>
  );
}
