const fs = require('fs');

const parseNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const inDocker =
  process.env.MEDIASOUP_IN_DOCKER === '1' ||
  process.env.MEDIASOUP_IN_DOCKER === 'true' ||
  fs.existsSync('/.dockerenv');

/** Nhiều IPv4 trong MEDIASOUP_ANNOUNCED_IP → nhiều ICE candidate (LAN; tránh 127.0.0.1 trong Docker). */
function resolveListenIps(raw) {
  const listenIp = process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0';
  let parts = String(raw || '')
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter((p) => /^\d{1,3}(\.\d{1,3}){3}$/.test(p));

  if (inDocker) {
    const withoutLoopback = parts.filter((ip) => ip !== '127.0.0.1' && ip !== '0.0.0.0');
    if (withoutLoopback.length > 0 && withoutLoopback.length !== parts.length) {
      // eslint-disable-next-line no-console
      console.warn(
        '[voice] Docker: bỏ 127.0.0.1 khỏi MEDIASOUP_ANNOUNCED_IP (UDP loopback → container thường fail trên Docker Desktop Windows).'
      );
      parts = withoutLoopback;
    }
  }

  if (parts.length === 0) {
    return [{ ip: listenIp, announcedIp: undefined }];
  }
  return parts.map((announcedIp) => ({ ip: listenIp, announcedIp }));
}

const listenIps = resolveListenIps(process.env.MEDIASOUP_ANNOUNCED_IP);
const preferTcp =
  process.env.MEDIASOUP_PREFER_TCP === '1' || process.env.MEDIASOUP_PREFER_TCP === 'true';

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line no-console
  console.info(
    '[voice] mediasoup listenIps:',
    JSON.stringify(listenIps),
    preferTcp ? '(preferTcp)' : ''
  );
}

module.exports = {
  worker: {
    rtcMinPort: parseNumber(process.env.RTC_MIN_PORT, 40000),
    rtcMaxPort: parseNumber(process.env.RTC_MAX_PORT, 49999),
    logLevel: process.env.MEDIASOUP_LOG_LEVEL || 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        // Phải khớp Chrome/Firefox produce (stereo) — channels:1 gây "codec not supported".
        channels: 2,
        parameters: {
          minptime: 10,
          useinbandfec: 1,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,
          'profile-level-id': '42e01f',
          'level-asymmetry-allowed': 1,
        },
      },
    ],
  },
  webRtcTransport: {
    listenIps,
    enableUdp: true,
    enableTcp: true,
    preferUdp: !preferTcp,
    initialAvailableOutgoingBitrate: parseNumber(
      process.env.MEDIASOUP_INITIAL_OUTGOING_BITRATE,
      1000000
    ),
  },
};
