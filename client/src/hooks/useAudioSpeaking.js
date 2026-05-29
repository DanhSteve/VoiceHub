import { useEffect, useRef, useState } from 'react';

const DEFAULT_RMS_THRESHOLD = 0.04;

function stopMonitor(monitorsRef, key) {
  const monitor = monitorsRef.current.get(key);
  if (!monitor) return;
  if (monitor.rafId) cancelAnimationFrame(monitor.rafId);
  try {
    monitor.source?.disconnect();
    monitor.analyser?.disconnect();
  } catch {
    /* ignore */
  }
  monitor.audioContext?.close?.().catch?.(() => {});
  monitorsRef.current.delete(key);
}

/**
 * Theo dõi RMS từ MediaStream (mic remote/local) để sáng viền avatar khi đang nói.
 * @param {MediaStream|null|undefined} stream
 * @param {{ enabled?: boolean, threshold?: number, monitorKey?: string }} [opts]
 */
export function useAudioSpeaking(stream, opts = {}) {
  const { enabled = true, threshold = DEFAULT_RMS_THRESHOLD, monitorKey = 'default' } = opts;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const monitorsRef = useRef(new Map());

  useEffect(() => {
    if (!enabled || !stream?.getAudioTracks?.()?.length) {
      setIsSpeaking(false);
      setLevel(0);
      return undefined;
    }

    const key = String(monitorKey);
    stopMonitor(monitorsRef, key);

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return undefined;

      const audioContext = new AudioContextClass();
      void audioContext.resume?.().catch?.(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let lastSpeaking = false;

      const detect = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const normalized = Math.min(1, rms / 0.14);
        setLevel(normalized);
        const speaking = rms > threshold;
        if (speaking !== lastSpeaking) {
          lastSpeaking = speaking;
          setIsSpeaking(speaking);
        }
        const monitor = monitorsRef.current.get(key);
        if (monitor) {
          monitor.rafId = requestAnimationFrame(detect);
        }
      };

      monitorsRef.current.set(key, {
        audioContext,
        analyser,
        source,
        rafId: requestAnimationFrame(detect),
      });
    } catch (e) {
      console.warn('[useAudioSpeaking] failed', e?.message || e);
    }

    return () => {
      stopMonitor(monitorsRef, key);
      setIsSpeaking(false);
      setLevel(0);
    };
  }, [stream, enabled, threshold, monitorKey]);

  return { isSpeaking, level };
}
