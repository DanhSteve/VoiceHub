const KEYS = {
  mic: 'vh.voice.micDeviceId',
  speaker: 'vh.voice.speakerDeviceId',
  micVol: 'vh.voice.micVolume',
  speakerVol: 'vh.voice.speakerVolume',
  micMuted: 'vh.voice.micMuted',
  speakerOff: 'vh.voice.speakerOff',
};

function scopedKey(base, userId) {
  const uid = String(userId || '').trim();
  return uid ? `${base}:${uid}` : base;
}

function readBool(key) {
  return localStorage.getItem(key) === '1';
}

/** userId: tách mute/loa theo tài khoản — hai tab Gmail khác nhau không dùng chung micMuted. */
export function loadVoiceAudioPrefs(userId) {
  const micVol = Number(localStorage.getItem(KEYS.micVol));
  const speakerVol = Number(localStorage.getItem(KEYS.speakerVol));
  const micMutedKey = scopedKey(KEYS.micMuted, userId);
  const speakerOffKey = scopedKey(KEYS.speakerOff, userId);
  let micMuted = readBool(micMutedKey);
  let speakerOff = readBool(speakerOffKey);
  if (userId) {
    if (!localStorage.getItem(micMutedKey) && readBool(KEYS.micMuted)) micMuted = true;
    if (!localStorage.getItem(speakerOffKey) && readBool(KEYS.speakerOff)) speakerOff = true;
  }
  return {
    micDeviceId: localStorage.getItem(KEYS.mic) || '',
    speakerDeviceId: localStorage.getItem(KEYS.speaker) || '',
    micVolume: Number.isFinite(micVol) ? Math.min(100, Math.max(0, micVol)) : 100,
    speakerVolume: Number.isFinite(speakerVol) ? Math.min(100, Math.max(0, speakerVol)) : 100,
    micMuted,
    speakerOff,
  };
}

export function saveVoiceAudioPrefs(partial = {}, userId) {
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
    const key = scopedKey(KEYS.micMuted, userId);
    localStorage.setItem(key, partial.micMuted ? '1' : '0');
  }
  if (partial.speakerOff !== undefined) {
    const key = scopedKey(KEYS.speakerOff, userId);
    localStorage.setItem(key, partial.speakerOff ? '1' : '0');
  }
}

/** Khớp VoiceAudioSettingsPanel — ổn định hơn khi dùng BT + mic Realtek. */
export function buildAudioConstraints(deviceId, { strictDevice = true } = {}) {
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  const id = String(deviceId || '').trim();
  if (id) {
    audio.deviceId = strictDevice ? { exact: id } : { ideal: id };
  }
  return audio;
}

/** Xin mic — thử exact device trước, fallback ideal nếu máy đang chiếm thiết bị (BT/voice). */
export async function acquireMicStream(deviceId) {
  const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  if (!mediaDevices?.getUserMedia) {
    throw new Error('Media devices unavailable');
  }
  try {
    return await mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId, { strictDevice: true }),
      video: false,
    });
  } catch (firstErr) {
    if (!String(deviceId || '').trim()) throw firstErr;
    return await mediaDevices.getUserMedia({
      audio: buildAudioConstraints(deviceId, { strictDevice: false }),
      video: false,
    });
  }
}
