import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Circle, Mic, MicOff, PhoneOff, Square, Video, VideoOff } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import friendCallService from '../../services/friendCallService';
import { acquireMicStream, buildAudioConstraints } from '../../pages/Voice/voiceAudioPrefs';
import { useAuth } from '../../context/AuthContext';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import { useAppStrings } from '../../locales/appStrings';
import { getUserDisplayName } from '../../utils/helpers';
import { resolveAppOrigin } from '../../utils/browserOrigin';
import UserAvatar from '../Shared/UserAvatar';

const getSignalBaseUrl = () => resolveAppOrigin() || 'http://127.0.0.1:3000';
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

function pickRecorderMime(hasVideo) {
  const candidates = hasVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || '';
}

async function playRemoteStream(el, stream) {
  if (!el || !stream) return;
  if (el.srcObject !== stream) el.srcObject = stream;
  try {
    await el.play();
  } catch (err) {
    console.warn('[friend-call] remote play', err?.message || err);
  }
}

function buildRecordingStream(localStream, remoteStream) {
  const out = new MediaStream();
  const add = (stream) => {
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (track.readyState === 'live') out.addTrack(track);
    }
  };
  add(localStream);
  add(remoteStream);
  return out;
}

/**
 * Modal cuộc gọi 1-1 (mediasoup) — recv trước produce, hangup/mute phản hồi ngay, cam + ghi âm thật.
 */
export default function FriendCallMediaModal() {
  const { session, closeFriendCall } = useFriendCallSession();
  const { user } = useAuth();
  const { t } = useAppStrings();

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
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
  const tearingDownRef = useRef(false);
  const recordChunksRef = useRef([]);
  const mediaRecorderRef = useRef(null);

  const displayName =
    getUserDisplayName(user) || user?.email?.split('@')[0] || t('common.you');

  const teardown = useCallback(async ({ notifyServer = true } = {}) => {
    if (tearingDownRef.current) return;
    tearingDownRef.current = true;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    mediaRecorderRef.current = null;
    recordChunksRef.current = [];
    setIsRecording(false);

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
    const roomId = roomIdRef.current;

    if (notifyServer && callId) {
      friendCallService.end(callId).catch(() => {});
    }

    if (socket?.connected && roomId) {
      socket.emit('voice:leaveRoom', { roomId });
    }

    for (const c of consumers.values()) {
      try {
        c.close();
      } catch {
        /* ignore */
      }
    }
    consumers.clear();
    try {
      audioProducer?.close();
    } catch {
      /* ignore */
    }
    try {
      videoProducer?.close();
    } catch {
      /* ignore */
    }
    try {
      sendTransport?.close();
    } catch {
      /* ignore */
    }
    try {
      recvTransport?.close();
    } catch {
      /* ignore */
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    try {
      socket?.removeAllListeners();
      socket?.disconnect();
    } catch {
      /* ignore */
    }

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
    tearingDownRef.current = false;
  }, []);

  useEffect(() => {
    if (!session?.roomId || !session?.callId) return undefined;

    let cancelled = false;
    const roomTarget = session.roomId;
    const peerLabel = session.peerLabel || t('friendChat.friendDefault');
    const startWithVideo = session.media !== 'audio';

    roomIdRef.current = roomTarget;
    callIdRef.current = session.callId;
    tearingDownRef.current = false;

    const requestSocket = (eventName, payload) =>
      new Promise((resolve, reject) => {
        const socket = mediasoupRef.current.socket;
        if (!socket?.connected) {
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

    const updateRemoteTile = (socketId, displayNameLabel, stream) => {
      const hasVideo = Boolean(stream?.getVideoTracks?.().length);
      setRemoteTile({
        socketId,
        displayName: displayNameLabel || peerLabel,
        stream,
        hasVideo,
      });
    };

    const consumeProducer = async (producerMeta) => {
      const { recvTransport, device } = mediasoupRef.current;
      if (!recvTransport || !device) return;

      const producerId = String(producerMeta?.producerId || '');
      if (!producerId) return;

      const alreadyConsumed = Array.from(mediasoupRef.current.consumers.values()).some(
        (c) => String(c?.appData?.producerId || '') === producerId
      );
      if (alreadyConsumed) return;

      const consumeResp = await requestSocket('voice:consume', {
        roomId: roomIdRef.current,
        transportId: recvTransport.id,
        producerId,
        rtpCapabilities: device.rtpCapabilities,
      });

      const consumerParams = consumeResp.consumer;
      const consumer = await recvTransport.consume({
        id: consumerParams.id,
        producerId: consumerParams.producerId,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters,
        appData: { producerId },
      });

      mediasoupRef.current.consumers.set(consumer.id, consumer);

      const currentStream =
        mediasoupRef.current.remoteStreams.get(producerMeta.socketId) || new MediaStream();
      currentStream.addTrack(consumer.track);
      mediasoupRef.current.remoteStreams.set(producerMeta.socketId, currentStream);

      updateRemoteTile(
        producerMeta.socketId,
        producerMeta.displayName || peerLabel,
        currentStream
      );

      await requestSocket('voice:resumeConsumer', {
        roomId: roomIdRef.current,
        consumerId: consumer.id,
      });
      consumer.resume();
      if (consumer.track) consumer.track.enabled = true;

      const stream = currentStream;
      requestAnimationFrame(() => {
        if (stream.getVideoTracks().length > 0 && remoteVideoRef.current) {
          void playRemoteStream(remoteVideoRef.current, stream);
        } else if (remoteAudioRef.current) {
          void playRemoteStream(remoteAudioRef.current, stream);
        }
      });
    };

    (async () => {
      setJoining(true);
      setError('');
      setRemoteTile(null);
      setIsCameraOff(!startWithVideo);

      try {
        await api
          .get(`/voice/rooms/${encodeURIComponent(roomTarget)}/bootstrap`, {
            skipGlobalErrorHandling: true,
          })
          .catch(() => null);
        if (cancelled) return;

        const localStream = startWithVideo
          ? await navigator.mediaDevices.getUserMedia({
              audio: buildAudioConstraints(''),
              video: true,
            })
          : await acquireMicStream('');
        if (cancelled) {
          localStream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        mediasoupRef.current.localStream = localStream;
        if (localVideoRef.current && localStream.getVideoTracks().length) {
          localVideoRef.current.srcObject = localStream;
        }

        const token = normalizeToken(localStorage.getItem('token'));
        const socket = io(`${getSignalBaseUrl()}/voice`, {
          path: getSignalPath(),
          transports: ['polling', 'websocket'],
          auth: token ? { token } : {},
        });
        mediasoupRef.current.socket = socket;

        await new Promise((resolve, reject) => {
          if (socket.connected) {
            resolve();
            return;
          }
          socket.once('connect', resolve);
          socket.once('connect_error', reject);
        });
        if (cancelled) return;

        socket.on('voice:peerJoined', (payload) => {
          const stream = mediasoupRef.current.remoteStreams.get(payload.socketId) || null;
          updateRemoteTile(payload.socketId, payload.displayName, stream);
        });

        socket.on('voice:peerLeft', (payload) => {
          setRemoteTile((prev) => (prev?.socketId === payload.socketId ? null : prev));
          const st = mediasoupRef.current.remoteStreams.get(payload.socketId);
          if (st) {
            st.getTracks().forEach((tr) => tr.stop());
            mediasoupRef.current.remoteStreams.delete(payload.socketId);
          }
        });

        socket.on('voice:newProducer', (producerMeta) => {
          void consumeProducer(producerMeta).catch((e) => console.error('[friend-call] consume', e));
        });

        const mediasoupModule = await import('mediasoup-client');
        const DeviceClass = mediasoupModule.Device;

        const joinResp = await requestSocket('voice:joinRoom', {
          roomId: roomTarget,
          displayName,
        });
        const device = new DeviceClass();
        await device.load({ routerRtpCapabilities: joinResp.rtpCapabilities });
        if (!device.canProduce('audio')) {
          throw new Error(t('friendChat.callCodecAudioFail'));
        }
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

        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = true;
          mediasoupRef.current.audioProducer = await sendTransport.produce({
            track: audioTrack,
            appData: { mediaTag: 'audio' },
          });
        }

        if (startWithVideo) {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack && device.canProduce('video')) {
            videoTrack.enabled = true;
            mediasoupRef.current.videoProducer = await sendTransport.produce({
              track: videoTrack,
              appData: { mediaTag: 'video' },
            });
            setIsCameraOff(false);
          }
        }

        setIsMuted(false);
      } catch (e) {
        console.error(e);
        const msg = e?.message || t('voiceRoom.connectFail');
        setError(msg);
        toast.error(msg);
        closeFriendCall();
        await teardown({ notifyServer: true });
      } finally {
        if (!cancelled) setJoining(false);
      }
    })();

    return () => {
      cancelled = true;
      void teardown({ notifyServer: true });
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
      void playRemoteStream(v, remoteTile.stream);
      if (a) a.srcObject = null;
    } else if (a) {
      void playRemoteStream(a, remoteTile.stream);
      if (v) v.srcObject = null;
    }
  }, [remoteTile]);

  const handleHangup = () => {
    closeFriendCall();
    void teardown({ notifyServer: true });
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    const track = mediasoupRef.current.localStream?.getAudioTracks?.()?.[0];
    if (track) track.enabled = !next;
    const producer = mediasoupRef.current.audioProducer;
    if (!producer) return;
    void (next ? producer.pause() : producer.resume()).catch((err) => {
      console.warn('[friend-call] mute', err);
      setIsMuted(!next);
      if (track) track.enabled = next;
    });
  };

  const toggleCamera = async () => {
    const { sendTransport, localStream, device } = mediasoupRef.current;
    if (!sendTransport || !localStream) return;

    try {
      if (isCameraOff) {
        if (!device?.canProduce('video')) {
          toast.error(t('friendChat.callCodecVideoFail'));
          return;
        }
        const cam = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        const vt = cam.getVideoTracks()[0];
        if (!vt) return;

        localStream.getVideoTracks().forEach((tr) => {
          tr.stop();
          localStream.removeTrack(tr);
        });
        localStream.addTrack(vt);

        if (mediasoupRef.current.videoProducer) {
          await mediasoupRef.current.videoProducer.replaceTrack({ track: vt });
        } else {
          mediasoupRef.current.videoProducer = await sendTransport.produce({
            track: vt,
            appData: { mediaTag: 'video' },
          });
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        setIsCameraOff(false);
      } else {
        mediasoupRef.current.videoProducer?.close();
        mediasoupRef.current.videoProducer = null;
        localStream.getVideoTracks().forEach((tr) => {
          tr.stop();
          localStream.removeTrack(tr);
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        setIsCameraOff(true);
      }
    } catch (err) {
      console.error(err);
      toast.error(t('voiceRoom.camFail'));
    }
  };

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    rec.stop();
  }, []);

  const toggleRecord = useCallback(() => {
    if (isRecording) {
      stopRecording();
      return;
    }

    const localStream = mediasoupRef.current.localStream;
    const remoteStream = remoteTile?.stream || null;
    const recordStream = buildRecordingStream(localStream, remoteStream);
    if (!recordStream.getTracks().length) {
      toast.error(t('friendChat.callRecordNoStream'));
      return;
    }

    const hasVideo = recordStream.getVideoTracks().length > 0;
    const mimeType = pickRecorderMime(hasVideo);
    if (!mimeType) {
      toast.error(t('friendChat.callRecordUnsupported'));
      return;
    }

    recordChunksRef.current = [];
    try {
      const recorder = new MediaRecorder(recordStream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (ev) => {
        if (ev.data?.size > 0) recordChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        setIsRecording(false);
        mediaRecorderRef.current = null;
        const blob = new Blob(recordChunksRef.current, { type: mimeType });
        recordChunksRef.current = [];
        if (!blob.size) {
          toast.error(t('friendChat.callRecordEmpty'));
          return;
        }
        const ext = mimeType.includes('video') ? 'webm' : 'webm';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `voicehub-call-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(t('friendChat.callRecordSaved'));
      };
      recorder.start(1000);
      setIsRecording(true);
      toast.success(t('friendChat.callRecordStarted'));
    } catch (err) {
      console.error(err);
      toast.error(t('friendChat.callRecordFail'));
    }
  }, [isRecording, remoteTile, stopRecording, t]);

  if (!session) return null;

  const showLocalVideo = !isCameraOff && mediasoupRef.current.localStream?.getVideoTracks?.().length;

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
            {t('friendChat.callConnecting')}
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
              <audio ref={remoteAudioRef} autoPlay playsInline className="sr-only" />
              <div className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-2 bg-zinc-900">
                <UserAvatar
                  avatar={remoteTile?.avatar}
                  name={remoteTile?.displayName || session.peerLabel}
                  size="2xl"
                />
                <p className="text-sm text-white/80">{remoteTile?.displayName || session.peerLabel || '…'}</p>
              </div>
            </>
          )}

          {showLocalVideo && (
            <div className="absolute bottom-3 right-3 h-28 w-40 overflow-hidden rounded-lg border border-white/20 bg-black shadow-lg">
              <video ref={localVideoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
            </div>
          )}
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-white/10 px-4 py-4">
        <button
          type="button"
          onClick={toggleMute}
          disabled={joining}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            isMuted ? 'bg-red-600/90' : 'bg-white/10 hover:bg-white/20'
          }`}
          aria-label={isMuted ? t('friendChat.callUnmute') : t('friendChat.callMute')}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => void toggleCamera()}
          disabled={joining}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            isCameraOff ? 'bg-white/10 hover:bg-white/20' : 'bg-emerald-600/90 hover:bg-emerald-500'
          }`}
          aria-label={isCameraOff ? t('friendChat.callCamOn') : t('friendChat.callCamOff')}
        >
          {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={toggleRecord}
          disabled={joining}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${
            isRecording ? 'bg-red-600 animate-pulse' : 'bg-white/10 hover:bg-white/20'
          }`}
          aria-label={isRecording ? t('friendChat.callRecordStop') : t('friendChat.callRecordStart')}
        >
          {isRecording ? <Square className="h-5 w-5 fill-current" /> : <Circle className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={handleHangup}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-500"
          aria-label={t('friendChat.callHangup')}
        >
          <PhoneOff className="h-6 w-6" />
        </button>
      </footer>
    </div>
  );
}
