import { useCallback, useEffect, useRef, useState } from 'react';
import { saveVoiceAudioPrefs } from './voiceAudioPrefs';

const BAR_COUNT = 12;
/** Hệ số nghe lại giọng mình — tránh hú quá to khi bật loa gần mic */
const MIC_MONITOR_GAIN = 0.72;

function clampVolume(v) {
  return Math.min(100, Math.max(0, Number(v) || 0));
}

function buildMicConstraints(deviceId) {
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (deviceId) audio.deviceId = { ideal: deviceId };
  return { audio };
}

/**
 * Cấu hình mic / loa + kiểm tra đầu vào / đầu ra (dùng trong modal Cài đặt Voice).
 */
export default function VoiceAudioSettingsPanel({
  t,
  isDarkMode = true,
  micId,
  speakerId,
  micVolume,
  speakerVolume,
  onMicIdChange,
  onSpeakerIdChange,
  onMicVolumeChange,
  onSpeakerVolumeChange,
  onApplyMic,
  active = true,
  /** Đang trong kênh voice — không giữ mic test (tránh tranh Realtek/BT với mediasoup). */
  voiceSessionActive = false,
}) {
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [micTesting, setMicTesting] = useState(false);
  const [speakerTesting, setSpeakerTesting] = useState(false);
  const [barLevels, setBarLevels] = useState(() => Array(BAR_COUNT).fill(0.08));
  const [deviceError, setDeviceError] = useState('');

  const testStreamRef = useRef(null);
  const testAudioCtxRef = useRef(null);
  const testAnalyserRef = useRef(null);
  const testGainRef = useRef(null);
  const testSourceRef = useRef(null);
  const testRafRef = useRef(null);
  const monitorGainRef = useRef(null);
  const monitorDestRef = useRef(null);
  const monitorAudioRef = useRef(null);
  const monitorAttachedRef = useRef(false);
  const speakerAudioRef = useRef(null);
  const speakerOscRef = useRef(null);

  const labelClass = isDarkMode ? 'text-gray-300' : 'text-slate-700';
  const fieldClass = isDarkMode
    ? 'w-full rounded-lg border border-white/15 bg-[#1a1a1a] px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/30'
    : 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900';
  const sliderClass = 'w-full accent-cyan-500';

  const stopMicMonitor = useCallback(() => {
    const gain = testGainRef.current;
    const monitorGain = monitorGainRef.current;
    if (gain && monitorGain && monitorAttachedRef.current) {
      try {
        gain.disconnect(monitorGain);
      } catch {
        /* ignore */
      }
      monitorAttachedRef.current = false;
    }
    if (monitorGain) {
      try {
        monitorGain.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (monitorDestRef.current) {
      try {
        monitorDestRef.current.disconnect();
      } catch {
        /* ignore */
      }
      monitorDestRef.current = null;
    }
    monitorGainRef.current = null;
    const audio = monitorAudioRef.current;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
  }, []);

  /** Giải phóng mic + AudioContext — gọi khi dừng test hoặc đóng modal */
  const releaseMicCapture = useCallback(() => {
    if (testRafRef.current) {
      cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    }
    stopMicMonitor();
    if (testSourceRef.current) {
      try {
        testSourceRef.current.disconnect();
      } catch {
        /* ignore */
      }
      testSourceRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((tr) => {
        try {
          tr.stop();
        } catch {
          /* ignore */
        }
      });
      testStreamRef.current = null;
    }
    if (testAudioCtxRef.current) {
      testAudioCtxRef.current.close().catch(() => {});
      testAudioCtxRef.current = null;
    }
    testAnalyserRef.current = null;
    testGainRef.current = null;
    setBarLevels(Array(BAR_COUNT).fill(0.08));
  }, [stopMicMonitor]);

  const stopTestStream = releaseMicCapture;

  const stopSpeakerTest = useCallback(() => {
    if (speakerOscRef.current) {
      try {
        speakerOscRef.current.stop();
      } catch {
        /* ignore */
      }
      speakerOscRef.current.disconnect?.();
      speakerOscRef.current = null;
    }
    const el = speakerAudioRef.current;
    if (el) {
      el.pause();
      el.srcObject = null;
    }
    setSpeakerTesting(false);
  }, []);

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

  const ensureMicPermission = useCallback(async () => {
    setDeviceError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildMicConstraints(micId));
      stream.getTracks().forEach((tr) => tr.stop());
      await refreshDevices();
      return true;
    } catch (e) {
      console.warn(e);
      setDeviceError(t('voiceRoom.audioPermissionFail'));
      return false;
    }
  }, [micId, refreshDevices, t]);

  const startPreviewStream = useCallback(async () => {
    stopTestStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildMicConstraints(micId));
      testStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      const gain = ctx.createGain();
      gain.gain.value = clampVolume(micVolume) / 100;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(gain);
      gain.connect(analyser);
      testSourceRef.current = source;

      testAudioCtxRef.current = ctx;
      testAnalyserRef.current = analyser;
      testGainRef.current = gain;
    } catch (e) {
      console.warn(e);
      setDeviceError(t('voiceRoom.previewFail'));
    }
  }, [micId, micVolume, stopTestStream, t]);

  /** Mở modal: chỉ xin quyền + liệt kê thiết bị (không giữ mic). Đóng modal: tắt hết. */
  useEffect(() => {
    if (!active) {
      setMicTesting(false);
      releaseMicCapture();
      stopSpeakerTest();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      await ensureMicPermission();
      if (!cancelled) await refreshDevices();
    })();
    return () => {
      cancelled = true;
      setMicTesting(false);
      releaseMicCapture();
      stopSpeakerTest();
    };
  }, [active, ensureMicPermission, refreshDevices, releaseMicCapture, stopSpeakerTest]);

  /** Chỉ giữ mic khi đang bấm "Kiểm tra mic" */
  useEffect(() => {
    if (voiceSessionActive && micTesting) {
      setMicTesting(false);
    }
  }, [voiceSessionActive, micTesting]);

  useEffect(() => {
    if (!active) return undefined;
    if (!micTesting || voiceSessionActive) {
      releaseMicCapture();
      return undefined;
    }
    let cancelled = false;
    (async () => {
      await startPreviewStream();
      if (cancelled) releaseMicCapture();
    })();
    return () => {
      cancelled = true;
      releaseMicCapture();
    };
  }, [active, micTesting, micId, voiceSessionActive, startPreviewStream, releaseMicCapture]);

  useEffect(() => {
    if (testGainRef.current) {
      testGainRef.current.gain.value = clampVolume(micVolume) / 100;
    }
    if (monitorGainRef.current && micTesting) {
      monitorGainRef.current.gain.value =
        (clampVolume(micVolume) / 100) *
        (clampVolume(speakerVolume) / 100) *
        MIC_MONITOR_GAIN;
    }
  }, [micVolume, speakerVolume, micTesting]);

  const syncMicMonitor = useCallback(async () => {
    if (!micTesting) {
      stopMicMonitor();
      return;
    }
    const ctx = testAudioCtxRef.current;
    const gain = testGainRef.current;
    if (!ctx || !gain) return;

    stopSpeakerTest();

    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      /* ignore */
    }

    if (!monitorGainRef.current) {
      monitorGainRef.current = ctx.createGain();
    }
    if (!monitorDestRef.current) {
      monitorDestRef.current = ctx.createMediaStreamDestination();
      monitorGainRef.current.connect(monitorDestRef.current);
    }

    monitorGainRef.current.gain.value =
      (clampVolume(micVolume) / 100) *
      (clampVolume(speakerVolume) / 100) *
      MIC_MONITOR_GAIN;

    if (!monitorAttachedRef.current) {
      gain.connect(monitorGainRef.current);
      monitorAttachedRef.current = true;
    }

    const audio = monitorAudioRef.current || new Audio();
    monitorAudioRef.current = audio;
    audio.srcObject = monitorDestRef.current.stream;
    audio.volume = clampVolume(speakerVolume) / 100;
    try {
      if (speakerId && typeof audio.setSinkId === 'function') {
        await audio.setSinkId(speakerId);
      }
      await audio.play();
    } catch (e) {
      console.warn(e);
      setDeviceError(t('voiceRoom.micMonitorFail'));
      setMicTesting(false);
      stopMicMonitor();
    }
  }, [
    micTesting,
    micVolume,
    speakerVolume,
    speakerId,
    stopMicMonitor,
    stopSpeakerTest,
    t,
  ]);

  useEffect(() => {
    syncMicMonitor();
    return () => {
      stopMicMonitor();
    };
  }, [syncMicMonitor, stopMicMonitor]);

  useEffect(() => {
    if (!micTesting || !testAnalyserRef.current) {
      if (!micTesting) setBarLevels(Array(BAR_COUNT).fill(0.08));
      return undefined;
    }

    const analyser = testAnalyserRef.current;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const next = [];
      for (let i = 0; i < BAR_COUNT; i += 1) {
        let sum = 0;
        const start = i * step;
        for (let j = start; j < start + step && j < data.length; j += 1) {
          sum += data[j];
        }
        const avg = sum / step / 255;
        next.push(Math.max(0.08, Math.min(1, avg * 2.2)));
      }
      setBarLevels(next);
      testRafRef.current = requestAnimationFrame(tick);
    };

    testRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (testRafRef.current) cancelAnimationFrame(testRafRef.current);
      testRafRef.current = null;
    };
  }, [micTesting]);

  const handleMicChange = async (deviceId) => {
    onMicIdChange(deviceId);
    saveVoiceAudioPrefs({ micDeviceId: deviceId });
    if (onApplyMic) await onApplyMic(deviceId);
  };

  const handleSpeakerChange = (deviceId) => {
    onSpeakerIdChange(deviceId);
    saveVoiceAudioPrefs({ speakerDeviceId: deviceId });
  };

  const handleMicVolume = (v) => {
    const vol = clampVolume(v);
    onMicVolumeChange(vol);
    saveVoiceAudioPrefs({ micVolume: vol });
  };

  const handleSpeakerVolume = (v) => {
    const vol = clampVolume(v);
    onSpeakerVolumeChange(vol);
    saveVoiceAudioPrefs({ speakerVolume: vol });
  };

  const toggleMicTest = () => {
    if (voiceSessionActive) return;
    setMicTesting((prev) => !prev);
  };

  const playSpeakerTest = async () => {
    if (speakerTesting) {
      stopSpeakerTest();
      return;
    }
    if (micTesting) {
      setMicTesting(false);
    }
    setSpeakerTesting(true);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) throw new Error('no AudioContext');
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = (clampVolume(speakerVolume) / 100) * 0.35;
      osc.type = 'sine';
      osc.frequency.value = 440;
      osc.connect(gain);

      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();

      const audio = speakerAudioRef.current || new Audio();
      speakerAudioRef.current = audio;
      audio.srcObject = dest.stream;
      audio.volume = clampVolume(speakerVolume) / 100;
      if (speakerId && audio.setSinkId) {
        await audio.setSinkId(speakerId);
      }
      await audio.play();

      speakerOscRef.current = osc;
      osc.onended = () => {
        stopSpeakerTest();
        ctx.close().catch(() => {});
      };
      setTimeout(() => {
        try {
          osc.stop();
        } catch {
          /* ignore */
        }
      }, 900);
    } catch (e) {
      console.warn(e);
      setDeviceError(t('voiceRoom.speakerTestFail'));
      setSpeakerTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          {t('voiceRoom.voiceSettingsTitle')}
        </h3>
        <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
          {t('voiceRoom.voiceSettingsDesc')}
        </p>
      </div>

      {deviceError ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{deviceError}</p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${labelClass}`}>{t('voiceRoom.micLabel')}</label>
            <select
              value={micId}
              onChange={(e) => handleMicChange(e.target.value)}
              className={fieldClass}
            >
              {audioInputs.length === 0 ? (
                <option value="">{t('voiceRoom.loadingDevices')}</option>
              ) : (
                audioInputs.map((d) => (
                  <option key={d.deviceId || d.label} value={d.deviceId}>
                    {d.label || t('voiceRoom.micFallback', { suffix: d.deviceId?.slice(-6) || '' })}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={`text-sm font-medium ${labelClass}`}>{t('voiceRoom.micVolumeLabel')}</label>
              <span className={`text-xs tabular-nums ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                {micVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={micVolume}
              onChange={(e) => handleMicVolume(Number(e.target.value))}
              className={sliderClass}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-sm font-medium ${labelClass}`}>{t('voiceRoom.speakerLabel')}</label>
            <select
              value={speakerId}
              onChange={(e) => handleSpeakerChange(e.target.value)}
              className={fieldClass}
            >
              {audioOutputs.length === 0 ? (
                <option value="">{t('voiceRoom.systemDefault')}</option>
              ) : (
                <>
                  <option value="">{t('voiceRoom.defaultOpt')}</option>
                  {audioOutputs.map((d) => (
                    <option key={d.deviceId || d.label} value={d.deviceId}>
                      {d.label || t('voiceRoom.speakerFallback', { suffix: d.deviceId?.slice(-6) || '' })}
                    </option>
                  ))}
                </>
              )}
            </select>
            <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
              {t('voiceRoom.speakerHint')}
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className={`text-sm font-medium ${labelClass}`}>{t('voiceRoom.speakerVolumeLabel')}</label>
              <span className={`text-xs tabular-nums ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                {speakerVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={speakerVolume}
              onChange={(e) => handleSpeakerVolume(Number(e.target.value))}
              className={sliderClass}
            />
          </div>
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-4 ${
          isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
        }`}
      >
        <button
          type="button"
          onClick={toggleMicTest}
          disabled={voiceSessionActive}
          title={voiceSessionActive ? t('voiceRoom.micTestBlockedInCall') : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            micTesting
              ? 'bg-cyan-600 text-white'
              : isDarkMode
                ? 'bg-cyan-600/90 text-white hover:bg-cyan-500'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
          }`}
        >
          {micTesting ? t('voiceRoom.micTestStop') : t('voiceRoom.micTestStart')}
        </button>
        <div className="flex h-10 flex-1 min-w-[140px] items-end justify-center gap-1">
          {barLevels.map((level, i) => (
            <span
              key={i}
              className={`w-2 rounded-sm transition-all duration-75 ${
                micTesting ? 'bg-cyan-400' : isDarkMode ? 'bg-gray-600' : 'bg-slate-300'
              }`}
              style={{ height: `${Math.round(8 + level * 32)}px` }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={playSpeakerTest}
          disabled={speakerTesting}
          className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
            isDarkMode
              ? 'border-white/15 text-gray-200 hover:bg-white/5 disabled:opacity-50'
              : 'border-slate-300 text-slate-800 hover:bg-slate-100 disabled:opacity-50'
          }`}
        >
          {speakerTesting ? t('voiceRoom.speakerTestPlaying') : t('voiceRoom.speakerTestStart')}
        </button>
      </div>
      {voiceSessionActive ? (
        <p className={`text-xs ${isDarkMode ? 'text-amber-400/90' : 'text-amber-700'}`}>
          {t('voiceRoom.micTestBlockedInCall')}
        </p>
      ) : null}
      {micTesting && !voiceSessionActive ? (
        <p className={`text-xs ${isDarkMode ? 'text-cyan-400/90' : 'text-cyan-700'}`}>
          {t('voiceRoom.micTestMonitorHint')}
        </p>
      ) : null}
    </div>
  );
}
