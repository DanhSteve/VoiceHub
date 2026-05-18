const KEYS = {
  mic: 'vh.voice.micDeviceId',
  speaker: 'vh.voice.speakerDeviceId',
  micVol: 'vh.voice.micVolume',
  speakerVol: 'vh.voice.speakerVolume',
  micMuted: 'vh.voice.micMuted',
  speakerOff: 'vh.voice.speakerOff',
};

export function loadVoiceAudioPrefs() {
  const micVol = Number(localStorage.getItem(KEYS.micVol));
  const speakerVol = Number(localStorage.getItem(KEYS.speakerVol));
  return {
    micDeviceId: localStorage.getItem(KEYS.mic) || '',
    speakerDeviceId: localStorage.getItem(KEYS.speaker) || '',
    micVolume: Number.isFinite(micVol) ? Math.min(100, Math.max(0, micVol)) : 100,
    speakerVolume: Number.isFinite(speakerVol) ? Math.min(100, Math.max(0, speakerVol)) : 100,
    micMuted: localStorage.getItem(KEYS.micMuted) === '1',
    speakerOff: localStorage.getItem(KEYS.speakerOff) === '1',
  };
}

export function saveVoiceAudioPrefs(partial = {}) {
  if (partial.micDeviceId !== undefined) {
    if (partial.micDeviceId) localStorage.setItem(KEYS.mic, partial.micDeviceId);
    else localStorage.removeItem(KEYS.mic);
  }
  if (partial.speakerDeviceId !== undefined) {
    if (partial.speakerDeviceId) localStorage.setItem(KEYS.speaker, partial.speakerDeviceId);
    else localStorage.removeItem(KEYS.speaker);
  }
  if (partial.micVolume !== undefined) {
    localStorage.setItem(KEYS.micVol, String(Math.min(100, Math.max(0, partial.micVolume))));
  }
  if (partial.speakerVolume !== undefined) {
    localStorage.setItem(KEYS.speakerVol, String(Math.min(100, Math.max(0, partial.speakerVolume))));
  }
  if (partial.micMuted !== undefined) {
    localStorage.setItem(KEYS.micMuted, partial.micMuted ? '1' : '0');
  }
  if (partial.speakerOff !== undefined) {
    localStorage.setItem(KEYS.speakerOff, partial.speakerOff ? '1' : '0');
  }
}

export function buildAudioConstraints(deviceId) {
  if (!deviceId) return true;
  return { deviceId: { ideal: deviceId } };
}
