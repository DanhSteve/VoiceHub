import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import friendCallService from '../../services/friendCallService';
import { useAuth } from '../../context/AuthContext';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import { useAppStrings } from '../../locales/appStrings';
import { getUserDisplayName } from '../../utils/helpers';

const getSignalBaseUrl = () => {
  const explicit = import.meta.env.VITE_VOICE_SIGNAL_URL;
  if (explicit) return explicit;
  // Dev: dùng cùng origin (Vite) để tránh hardcode gateway localhost:
  // client sẽ proxy /voice-socket về API Gateway trong vite.config.js.
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  return apiUrl.replace(/\/api\/?$/, '');
};

const getSignalPath = () => import.meta.env.VITE_VOICE_SIGNAL_PATH || '/voice-socket';

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

function buildInitials(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '?';
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

/**
 * Modal cuộc gọi 1-1 (mediasoup) — không chuyển trang VoiceRoomPage.
 */
export default function FriendCallMediaModal() {
  const { session, closeFriendCall } = useFriendCallSession();
  const { user } = useAuth();
  const { t } = useAppStrings();

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [remoteTile, setRemoteTile] = useState(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const mediasoupRef = useRef({
    socket: null,
    device: null,
    sendTransport: null,
    recvTransport: null,
    audioProducer: null,
    videoProducer: null,
    consumers: new Map(),
    localStream: null,
    remoteStreams: new Map(),
  });
  const roomIdRef = useRef('');
  const callIdRef = useRef('');

  const displayName =
    getUserDisplayName(user) || user?.email?.split('@')[0] || t('common.you');

  const teardown = useCallback(async () => {
    const {
      socket,
      audioProducer,
      videoProducer,
      sendTransport,
      recvTransport,
      consumers,
      localStream,
    } = mediasoupRef.current;

    const callId = callIdRef.current;
    if (callId) {
      try {
        await friendCallService.end(callId);
      } catch {
        /* ignore */
      }
    }

    if (socket?.connected) {
      socket.emit('voice:leaveRoom', { roomId: roomIdRef.current });
    }
    for (const c of consumers.values()) {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
    consumers.clear();
    audioProducer?.close();
    videoProducer?.close();
    sendTransport?.close();
    recvTransport?.close();
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    socket?.disconnect();

    mediasoupRef.current = {
      socket: null,
      device: null,
      sendTransport: null,
      recvTransport: null,
      audioProducer: null,
      videoProducer: null,
      consumers: new Map(),
      localStream: null,
      remoteStreams: new Map(),
    };
    roomIdRef.current = '';
    callIdRef.current = '';
    setRemoteTile(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (!session?.roomId || !session?.callId) return undefined;

    let cancelled = false;
    const roomTarget = session.roomId;
    const peerLabel = session.peerLabel || t('friendChat.friendDefault');
    const audioEnabled = true;
    const videoEnabled = session.media !== 'audio';

    roomIdRef.current = roomTarget;
    callIdRef.current = session.callId;

    const requestSocket = (eventName, payload) =>
      new Promise((resolve, reject) => {
        const socket = mediasoupRef.current.socket;
        if (!socket) {
          reject(new Error('No voice socket'));
          return;
        }
        socket.emit(eventName, payload, (response) => {
          if (!response?.success) {
            reject(new Error(response?.error || `Socket: ${eventName}`));
            return;
          }
          resolve(response);
        });
      });

    const consumeProducer = async (producerMeta) => {
      const { recvTransport, device } = mediasoupRef.current;
      if (!recvTransport || !device) return;

      const consumeResp = await requestSocket('voice:consume', {
        roomId: roomIdRef.current,
        transportId: recvTransport.id,
        producerId: producerMeta.producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumerParams = consumeResp.consumer;
      const consumer = await recvTransport.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
        appData: {},
      });

      mediasoupRef.current.consumers.set(consumer.id, consumer);

      const currentStream =
        mediasoupRef.current.remoteStreams.get(producerMeta.socketId) || new MediaStream();
      currentStream.addTrack(consumer.track);
      mediasoupRef.current.remoteStreams.set(producerMeta.socketId, currentStream);

      const hasVideo = currentStream.getVideoTracks().length > 0;
      setRemoteTile({
        socketId: producerMeta.socketId,
        displayName: producerMeta.displayName || peerLabel,
        stream: currentStream,
        hasVideo,
      });

      await requestSocket('voice:resumeConsumer', {
        roomId: roomIdRef.current,
        consumerId: consumer.id,
      });
    };

    (async () => {
      setJoining(true);
      setError('');
      setRemoteTile(null);
      try {
        await api.get(`/voice/rooms/${encodeURIComponent(roomTarget)}/bootstrap`, {
          skipGlobalErrorHandling: true,
        }).catch(() => null);
        if (cancelled) return;

        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: audioEnabled,
          video: videoEnabled,
        });
        if (cancelled) {
          localStream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        mediasoupRef.current.localStream = localStream;
        if (localVideoRef.current && videoEnabled) {
          localVideoRef.current.srcObject = localStream;
        }

        const token = normalizeToken(localStorage.getItem('token'));
        const socket = io(`${getSignalBaseUrl()}/voice`, {
          path: getSignalPath(),
          // Qua reverse proxy HTTPS, ưu tiên polling trước để giảm lỗi WS handshake sớm.
          transports: ['polling', 'websocket'],
          auth: token ? { token } : {},
        });
        mediasoupRef.current.socket = socket;

        await new Promise((resolve, reject) => {
          socket.once('connect', resolve);
          socket.once('connect_error', reject);
        });
        if (cancelled) {
          socket.disconnect();
          return;
        }

        socket.on('voice:peerJoined', (payload) => {
          const stream = mediasoupRef.current.remoteStreams.get(payload.socketId) || null;
          setRemoteTile({
            socketId: payload.socketId,
            displayName: payload.displayName || peerLabel,
            stream,
            hasVideo: Boolean(stream?.getVideoTracks?.().length),
          });
        });

        socket.on('voice:peerLeft', (payload) => {
          setRemoteTile((prev) => (prev?.socketId === payload.socketId ? null : prev));
          const st = mediasoupRef.current.remoteStreams.get(payload.socketId);
          if (st) {
            st.getTracks().forEach((tr) => tr.stop());
            mediasoupRef.current.remoteStreams.delete(payload.socketId);
          }
        });

        const mediasoupModule = await import('mediasoup-client');
        const DeviceClass = mediasoupModule.Device;

        const joinResp = await requestSocket('voice:joinRoom', {
          roomId: roomTarget,
          displayName,
        });
        const device = new DeviceClass();
        await device.load({ routerRtpCapabilities: joinResp.rtpCapabilities });
        mediasoupRef.current.device = device;

        const sendTransportData = await requestSocket('voice:createTransport', {
          roomId: roomTarget,
          direction: 'send',
        });
        const sendTransport = device.createSendTransport(sendTransportData.transport);
        mediasoupRef.current.sendTransport = sendTransport;

        sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          requestSocket('voice:connectTransport', {
            roomId: roomTarget,
            transportId: sendTransport.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch(errback);
        });

        sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
          requestSocket('voice:produce', {
            roomId: roomTarget,
            transportId: sendTransport.id,
            kind,
            rtpParameters,
            appData,
          })
            .then((resp) => callback({ id: resp.producerId }))
            .catch(errback);
        });

        const audioTrack = audioEnabled ? localStream.getAudioTracks()[0] : null;
        const videoTrack = videoEnabled ? localStream.getVideoTracks()[0] : null;
        if (audioTrack) {
          mediasoupRef.current.audioProducer = await sendTransport.produce({
            track: audioTrack,
            appData: { mediaTag: 'audio' },
          });
        }
        if (videoTrack) {
          mediasoupRef.current.videoProducer = await sendTransport.produce({
            track: videoTrack,
            appData: { mediaTag: 'video' },
          });
        }

        const recvTransportData = await requestSocket('voice:createTransport', {
          roomId: roomTarget,
          direction: 'recv',
        });
        const recvTransport = device.createRecvTransport(recvTransportData.transport);
        mediasoupRef.current.recvTransport = recvTransport;

        recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
          requestSocket('voice:connectTransport', {
            roomId: roomTarget,
            transportId: recvTransport.id,
            dtlsParameters,
          })
            .then(() => callback())
            .catch(errback);
        });

        const producers = await requestSocket('voice:getProducers', { roomId: roomTarget });
        for (const producerMeta of producers.producers || []) {
          await consumeProducer(producerMeta);
        }

        socket.on('voice:newProducer', async (producerMeta) => {
          try {
            await consumeProducer(producerMeta);
          } catch (e) {
            console.error('friend call consume', e);
          }
        });

        setIsMuted(!audioTrack);
        setIsCameraOff(!videoTrack);
      } catch (e) {
        console.error(e);
        const msg = e?.message || t('voiceRoom.connectFail');
        setError(msg);
        toast.error(msg);
        await teardown();
        closeFriendCall();
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [session?.callId, session?.roomId, session?.media, session?.peerLabel, displayName, t, teardown, closeFriendCall]);

  useEffect(() => {
    const v = remoteVideoRef.current;
    const a = remoteAudioRef.current;
    if (!remoteTile?.stream) {
      if (v) v.srcObject = null;
      if (a) a.srcObject = null;
      return;
    }
    if (remoteTile.hasVideo && v) {
      v.srcObject = remoteTile.stream;
      if (a) a.srcObject = null;
    } else if (a) {
      a.srcObject = remoteTile.stream;
      if (v) v.srcObject = null;
    }
  }, [remoteTile]);

  const handleHangup = async () => {
    await teardown();
    closeFriendCall();
  };

  const toggleMute = async () => {
    const p = mediasoupRef.current.audioProducer;
    if (!p) return;
    if (isMuted) await p.resume();
    else await p.pause();
    setIsMuted((m) => !m);
  };

  const toggleCamera = async () => {
    try {
      const { sendTransport, localStream } = mediasoupRef.current;
      if (!sendTransport || !localStream || session?.media === 'audio') return;

      if (isCameraOff) {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true });
        const vt = cam.getVideoTracks()[0];
        if (!vt) return;
        localStream.getVideoTracks().forEach((tr) => tr.stop());
        localStream.addTrack(vt);
        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: vt,
          appData: { mediaTag: 'video' },
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        setIsCameraOff(false);
      } else {
        mediasoupRef.current.videoProducer?.close();
        mediasoupRef.current.videoProducer = null;
        localStream.getVideoTracks().forEach((tr) => tr.stop());
        if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
        setIsCameraOff(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(t('voiceRoom.camFail'));
    }
  };

  if (!session) return null;

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col bg-zinc-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="friend-call-modal-title"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <h1 id="friend-call-modal-title" className="text-sm font-semibold tracking-tight">
          {session.peerLabel || t('friendChat.incomingCallTitle')}
        </h1>
        <span className="text-xs text-white/50">
          {session.media === 'audio' ? t('friendChat.incomingCallAudio') : t('friendChat.incomingCallVideo')}
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-4">
        {joining && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm">
            {t('friendChat.openingChat')}
          </div>
        )}
        {error && !joining && (
          <p className="max-w-md text-center text-sm text-red-300">{error}</p>
        )}

        <div className="relative aspect-video w-full max-w-3xl overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
          {remoteTile?.hasVideo && remoteTile?.stream ? (
            <video ref={remoteVideoRef} className="h-full w-full object-cover" autoPlay playsInline />
          ) : (
            <>
              <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
              <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 bg-zinc-900">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-violet-600 text-2xl font-bold text-white">
                  {buildInitials(remoteTile?.displayName || session.peerLabel)}
                </div>
                <p className="text-sm text-white/80">{remoteTile?.displayName || session.peerLabel || '…'}</p>
              </div>
            </>
          )}

          {session.media !== 'audio' && (
            <div className="absolute bottom-3 right-3 h-28 w-40 overflow-hidden rounded-lg border border-white/20 bg-black shadow-lg">
              <video ref={localVideoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-4 border-t border-white/10 px-4 py-4">
        <button
          type="button"
          onClick={toggleMute}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            isMuted ? 'bg-red-600/90' : 'bg-white/10 hover:bg-white/20'
          }`}
          aria-label={t('friendChat.callAudio')}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        {session.media !== 'audio' && (
          <button
            type="button"
            onClick={toggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isCameraOff ? 'bg-red-600/90' : 'bg-white/10 hover:bg-white/20'
            }`}
            aria-label={t('friendChat.callVideo')}
          >
            {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
          </button>
        )}
        <button
          type="button"
          onClick={handleHangup}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-500"
          aria-label={t('friendChat.rejectCall')}
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </footer>
    </div>
  );
}
