import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  Calendar,
  ChevronUp,
  FileText,
  Heart,
  LayoutGrid,
  LogIn,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MoreHorizontal,
  PictureInPicture2,
  Plus,
  Search,
  Settings,
  Share2,
  UserPlus,
  Users,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import api from '../../services/api';
import { organizationAPI } from '../../services/api/organizationAPI';
import userService from '../../services/userService';
import friendService from '../../services/friendService';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import { appShellBg } from '../../theme/shellTheme';
import { useLocale } from '../../context/LocaleContext';
import {
  buildLayoutTiles,
  gridWrapperClass,
  tileItemClass,
} from './voiceMeetingLayout';

/** Nút thanh họp: icon + (badge) + chevron + nhãn — tham chiếu layout Zoom/Teams (hình 1) */
function VoiceToolbarControl({
  label,
  icon: Icon,
  iconOff,
  onClick,
  chevron = true,
  badge,
  active = true,
  pressed = false,
}) {
  const OffIcon = iconOff || Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
        pressed ? 'bg-sky-500/25 ring-1 ring-sky-400/50' : ''
      }`}
    >
      <div className="flex items-center justify-center gap-0.5">
        {active ? (
          <Icon className="h-6 w-6 shrink-0 text-white" strokeWidth={1.75} />
        ) : (
          <OffIcon className="h-6 w-6 shrink-0 text-red-400" strokeWidth={1.75} />
        )}
        {badge != null && (
          <span className="text-xs font-semibold tabular-nums text-white/90">{badge}</span>
        )}
        {chevron && <ChevronUp className="h-3 w-3 shrink-0 text-white/40" aria-hidden />}
      </div>
      <span className="max-w-[72px] text-center text-[11px] leading-tight text-white/60 group-hover:text-white/85">
        {label}
      </span>
    </button>
  );
}

const getSignalBaseUrl = () => {
  const explicit = import.meta.env.VITE_VOICE_SIGNAL_URL;
  if (explicit) return explicit;
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

function formatCallDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseMembersRes(res) {
  const raw = res?.data ?? res;
  const arr = raw?.data ?? raw;
  return Array.isArray(arr) ? arr : [];
}

function parseOrgListRes(res) {
  if (!res) return [];
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
}

function memberUserId(m) {
  const u = m?.user;
  if (u && typeof u === 'object') return String(u._id || u.id || '');
  return String(u || '');
}

function deptMatchesMember(m, deptId) {
  const d = m?.department;
  const did = d && typeof d === 'object' ? d._id || d.id : d;
  return String(did || '') === String(deptId || '');
}

function VoiceRoomPage({ landingDemo = false } = {}) {
  const navigate = useNavigate();
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const safeRoomId = roomId?.startsWith(':') ? roomId.slice(1) || '' : roomId || '';
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const timeLocale = locale === 'en' ? 'en-US' : 'vi-VN';

  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasLocalVideoTrack, setHasLocalVideoTrack] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [remoteSpeakingMap, setRemoteSpeakingMap] = useState({});
  const [joining, setJoining] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [viewStage, setViewStage] = useState('home'); // home | prejoin | inRoom
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [meetingCode, setMeetingCode] = useState(safeRoomId || '');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [clockTick, setClockTick] = useState(0);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [prejoinAudioEnabled, setPrejoinAudioEnabled] = useState(true);
  const [prejoinVideoEnabled, setPrejoinVideoEnabled] = useState(true);

  /** free = phòng tự do (mời bạn bè); org = theo tổ chức + phòng ban */
  const [roomKind, setRoomKind] = useState('free');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const [rightPanel, setRightPanel] = useState(null); // null | 'chat' | 'people'
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteCandidates, setInviteCandidates] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  const [roomMessages, setRoomMessages] = useState([]);
  const [roomChatInput, setRoomChatInput] = useState('');
  const [roomChatEmojiOpen, setRoomChatEmojiOpen] = useState(false);
  const [allowParticipantChat, setAllowParticipantChat] = useState(true);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('vh.voice.layoutMode') || 'auto');
  const [maxTiles, setMaxTiles] = useState(() => Number(localStorage.getItem('vh.voice.maxTiles') || 6));
  const [hideNoVideo, setHideNoVideo] = useState(() => localStorage.getItem('vh.voice.hideNoVideo') === '1');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipOpen, setPipOpen] = useState(false);
  const [pipBox, setPipBox] = useState({ x: 80, y: 90, w: 360, h: 204 });
  const pipDragRef = useRef(null);
  const pipResizeRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('audio');
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [selectedCamId, setSelectedCamId] = useState('');
  const [sendResolution, setSendResolution] = useState('auto');
  const [recvResolution, setRecvResolution] = useState('auto');

  const localVideoRef = useRef(null);
  const prejoinVideoRef = useRef(null);
  const prejoinStreamRef = useRef(null);
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
  const currentRoomRef = useRef(safeRoomId || 'room1');
  const audioLevelMonitorsRef = useRef(new Map());
  const meetingRootRef = useRef(null);
  const moreMenuWrapRef = useRef(null);
  const pipVideoRef = useRef(null);

  const localDisplayName = useMemo(
    () => user?.displayName || user?.fullName || user?.name || user?.email?.split('@')[0] || t('common.you'),
    [user, t]
  );
  const localAvatar = user?.avatar || null;
  const currentUserId = useMemo(() => String(user?._id || user?.id || user?.userId || ''), [user]);

  useEffect(() => {
    setDisplayNameInput((prev) => (prev.trim() ? prev : localDisplayName));
  }, [localDisplayName]);

  useEffect(() => {
    const kind = searchParams.get('kind');
    if (kind === 'org' || kind === 'free') setRoomKind(kind);
    const oid = searchParams.get('orgId');
    if (oid) setSelectedOrgId(oid);
    const did = searchParams.get('deptId');
    if (did) setSelectedDeptId(did);
  }, [searchParams]);

  useEffect(() => {
    if (viewStage !== 'prejoin' || roomKind !== 'org') return undefined;
    let cancelled = false;
    (async () => {
      setOrgsLoading(true);
      try {
        const res = await organizationAPI.getOrganizations();
        const list = parseOrgListRes(res);
        if (!cancelled) setOrganizations(list);
      } catch {
        if (!cancelled) setOrganizations([]);
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewStage, roomKind]);

  useEffect(() => {
    if (viewStage !== 'prejoin' || roomKind !== 'org' || !selectedOrgId) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getDepartments(selectedOrgId);
        const raw = res?.data ?? res;
        const arr = raw?.data ?? raw;
        const list = Array.isArray(arr) ? arr : [];
        if (!cancelled) setDepartments(list);
      } catch {
        if (!cancelled) setDepartments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewStage, roomKind, selectedOrgId]);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (viewStage !== 'inRoom') {
      setCallDurationSec(0);
      return undefined;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setCallDurationSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [viewStage, activeRoomId]);

  const totalParticipants = useMemo(() => participants.length + 1, [participants.length]);
  const currentMeetingCode = useMemo(() => activeRoomId || safeRoomId || 'room1', [activeRoomId, safeRoomId]);

  const filteredInviteRows = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return inviteCandidates;
    return inviteCandidates.filter(
      (c) =>
        String(c.label || '')
          .toLowerCase()
          .includes(q) ||
        String(c.subtitle || '')
          .toLowerCase()
          .includes(q)
    );
  }, [inviteCandidates, inviteSearch]);

  const layoutTiles = useMemo(
    () =>
      buildLayoutTiles({
        participants,
        hideNoVideo,
        maxTiles,
        isCameraOff,
        hasLocalVideo: hasLocalVideoTrack,
      }),
    [participants, hideNoVideo, maxTiles, isCameraOff, hasLocalVideoTrack]
  );

  const meetingGridClass = useMemo(() => gridWrapperClass(layoutMode), [layoutMode]);

  useEffect(() => {
    localStorage.setItem('vh.voice.layoutMode', layoutMode);
  }, [layoutMode]);
  useEffect(() => {
    localStorage.setItem('vh.voice.maxTiles', String(maxTiles));
  }, [maxTiles]);
  useEffect(() => {
    localStorage.setItem('vh.voice.hideNoVideo', hideNoVideo ? '1' : '0');
  }, [hideNoVideo]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const close = (e) => {
      if (moreMenuWrapRef.current?.contains(e.target)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreMenuOpen]);

  const pipDragging = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const d = pipDragging.current;
      if (!d) return;
      if (d.type === 'move') {
        setPipBox((b) => ({
          ...b,
          x: Math.max(8, Math.min(window.innerWidth - b.w - 8, d.ox + (e.clientX - d.sx))),
          y: Math.max(8, Math.min(window.innerHeight - b.h - 8, d.oy + (e.clientY - d.sy))),
        }));
      } else if (d.type === 'resize') {
        setPipBox((b) => ({
          ...b,
          w: Math.max(200, Math.min(window.innerWidth - b.x - 8, d.ow + (e.clientX - d.sx))),
          h: Math.max(120, Math.min(window.innerHeight - b.y - 8, d.oh + (e.clientY - d.sy))),
        }));
      }
    };
    const onUp = () => {
      pipDragging.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!pipOpen || !pipVideoRef.current) return;
    const s = mediasoupRef.current.localStream;
    if (s && pipVideoRef.current) {
      pipVideoRef.current.srcObject = s;
      pipVideoRef.current.play?.().catch(() => {});
    }
  }, [pipOpen, isCameraOff, hasLocalVideoTrack]);

  useEffect(() => {
    if (!selectedSpeakerId || typeof HTMLMediaElement === 'undefined') return;
    if (!('setSinkId' in HTMLMediaElement.prototype)) return;
    const apply = (el) => {
      if (el?.setSinkId) {
        el.setSinkId(selectedSpeakerId).catch(() => {});
      }
    };
    apply(localVideoRef.current);
    apply(pipVideoRef.current);
    document.querySelectorAll('video').forEach(apply);
  }, [selectedSpeakerId, pipOpen, layoutTiles.length, participants.length]);

  const refreshMediaDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((d) => d.kind === 'audioinput'));
      setAudioOutputs(list.filter((d) => d.kind === 'audiooutput'));
      setVideoInputs(list.filter((d) => d.kind === 'videoinput'));
      const ls = mediasoupRef.current.localStream;
      const at = ls?.getAudioTracks?.()?.[0];
      const vt = ls?.getVideoTracks?.()?.[0];
      const aset = at?.getSettings?.();
      const vset = vt?.getSettings?.();
      if (aset?.deviceId) setSelectedMicId(aset.deviceId);
      if (vset?.deviceId) setSelectedCamId(vset.deviceId);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    if (settingsOpen && viewStage === 'inRoom') refreshMediaDevices();
  }, [settingsOpen, viewStage, refreshMediaDevices]);

  const toggleMeetingFullscreen = useCallback(async () => {
    const el = meetingRootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch (e) {
      console.error(e);
      toast.error(t('voiceRoom.fullscreenFail'));
    }
  }, [t]);

  const applyMicrophoneDevice = useCallback(
    async (deviceId) => {
      if (!deviceId) return;
      setSelectedMicId(deviceId);
      const { localStream, audioProducer } = mediasoupRef.current;
      if (!localStream || !audioProducer) return;
      try {
        const ns = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
          video: false,
        });
        const nt = ns.getAudioTracks()[0];
        if (!nt) return;
        stopAudioLevelMonitor('local');
        localStream.getAudioTracks().forEach((t) => {
          localStream.removeTrack(t);
          t.stop();
        });
        localStream.addTrack(nt);
        startAudioLevelMonitor('local', localStream, (speaking) => {
          setIsLocalSpeaking(speaking && !isMuted);
        });
        await audioProducer.replaceTrack({ track: nt });
        toast.success(t('voiceRoom.micOk'));
      } catch (e) {
        console.error(e);
        toast.error(t('voiceRoom.micFail'));
      }
    },
    [isMuted, t]
  );

  const applyCameraDevice = useCallback(async (deviceId) => {
    if (!deviceId) return;
    setSelectedCamId(deviceId);
    const { localStream, videoProducer, sendTransport } = mediasoupRef.current;
    if (!localStream || !sendTransport) return;
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId } },
      });
      const nt = ns.getVideoTracks()[0];
      if (!nt) return;
      localStream.getVideoTracks().forEach((t) => {
        localStream.removeTrack(t);
        t.stop();
      });
      localStream.addTrack(nt);
      if (videoProducer && !videoProducer.closed) {
        await videoProducer.replaceTrack({ track: nt });
      } else {
        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: nt,
          appData: { mediaTag: 'video' },
        });
      }
      setHasLocalVideoTrack(true);
      setIsCameraOff(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      if (pipVideoRef.current) pipVideoRef.current.srcObject = localStream;
      toast.success(t('voiceRoom.camOk'));
    } catch (e) {
      console.error(e);
      toast.error(t('voiceRoom.camFail'));
    }
  }, [t]);

  const applySendResolutionPref = useCallback(async (mode) => {
    setSendResolution(mode);
    const vt = mediasoupRef.current.localStream?.getVideoTracks?.()?.[0];
    if (!vt || mode === 'auto') return;
    const map = {
      '720': { width: 1280, height: 720 },
      '360': { width: 640, height: 360 },
      '180': { width: 320, height: 180 },
    };
    const dim = map[mode];
    if (!dim) return;
    try {
      await vt.applyConstraints({
        width: { ideal: dim.width },
        height: { ideal: dim.height },
      });
      toast.success(t('voiceRoom.resOk'));
    } catch (e) {
      toast.error(t('voiceRoom.resFail'));
    }
  }, [t]);

  const generateMeetingCode = () => `room-${Math.random().toString(36).slice(2, 8)}`;

  const buildInitials = (name) => {
    const words = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return 'U';
    return words
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');
  };

  const stopAudioLevelMonitor = (key) => {
    const monitor = audioLevelMonitorsRef.current.get(key);
    if (!monitor) return;
    if (monitor.rafId) cancelAnimationFrame(monitor.rafId);
    monitor.source?.disconnect?.();
    monitor.audioContext?.close?.().catch(() => {});
    audioLevelMonitorsRef.current.delete(key);
  };

  const startAudioLevelMonitor = (key, stream, onSpeakingChange) => {
    if (!stream || audioLevelMonitorsRef.current.has(key)) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

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
        const speaking = rms > 0.04;
        if (speaking !== lastSpeaking) {
          lastSpeaking = speaking;
          onSpeakingChange(speaking);
        }
        const monitor = audioLevelMonitorsRef.current.get(key);
        if (monitor) {
          monitor.rafId = requestAnimationFrame(detect);
        }
      };

      audioLevelMonitorsRef.current.set(key, {
        audioContext,
        analyser,
        source,
        rafId: requestAnimationFrame(detect),
      });
    } catch (monitorError) {
      console.warn('startAudioLevelMonitor failed', monitorError);
    }
  };

  const addOrUpdateParticipant = (payload) => {
    setParticipants((prev) => {
      const index = prev.findIndex((p) => p.socketId === payload.socketId);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], ...payload };
        return next;
      }
      return [...prev, payload];
    });
  };

  const removeParticipant = (socketId) => {
    setParticipants((prev) => prev.filter((item) => item.socketId !== socketId));
  };

  /**
   * Gỡ preview trước khi vào phòng.
   * @param {{ keepStreamForRoom?: boolean }} opts — nếu true: stream đã chuyển sang `mediasoupRef.localStream`,
   *   KHÔNG được stop track (nếu stop sẽ làm mất hình trong phòng và hỏng producer).
   */
  const stopPrejoinPreview = (opts = {}) => {
    const { keepStreamForRoom = false } = opts;
    if (prejoinStreamRef.current) {
      const sameAsRoom =
        keepStreamForRoom && mediasoupRef.current.localStream === prejoinStreamRef.current;
      if (sameAsRoom) {
        if (prejoinVideoRef.current) {
          prejoinVideoRef.current.srcObject = null;
        }
        prejoinStreamRef.current = null;
        return;
      }
      prejoinStreamRef.current.getTracks().forEach((track) => track.stop());
      prejoinStreamRef.current = null;
    }
    if (prejoinVideoRef.current) {
      prejoinVideoRef.current.srcObject = null;
    }
  };

  const startPrejoinPreview = async (audioEnabled = true, videoEnabled = true) => {
    stopPrejoinPreview();
    if (!audioEnabled && !videoEnabled) return;

    const mergedStream = new MediaStream();
    let hasAtLeastOneTrack = false;
    let hadPermissionError = false;

    // Xin quyền theo từng loại để không fail toàn bộ preview.
    if (videoEnabled) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          mergedStream.addTrack(videoTrack);
          hasAtLeastOneTrack = true;
        }
      } catch (videoErr) {
        hadPermissionError = true;
        console.warn('Video preview permission error', videoErr);
      }
    }

    if (audioEnabled) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          mergedStream.addTrack(audioTrack);
          hasAtLeastOneTrack = true;
        }
      } catch (audioErr) {
        hadPermissionError = true;
        console.warn('Audio preview permission error', audioErr);
      }
    }

    if (!hasAtLeastOneTrack) {
      if (hadPermissionError) {
        toast.error(t('voiceRoom.previewFail'));
      }
      return;
    }

    prejoinStreamRef.current = mergedStream;
    if (prejoinVideoRef.current) {
      prejoinVideoRef.current.srcObject = mergedStream;
    }

    if (videoEnabled && mergedStream.getVideoTracks().length === 0) {
      setPrejoinVideoEnabled(false);
    }
    if (audioEnabled && mergedStream.getAudioTracks().length === 0) {
      setPrejoinAudioEnabled(false);
    }
  };

  const requestSocket = (eventName, payload) =>
    new Promise((resolve, reject) => {
      const socket = mediasoupRef.current.socket;
      socket.emit(eventName, payload, (response) => {
        if (!response?.success) {
          reject(new Error(response?.error || `Socket request failed: ${eventName}`));
          return;
        }
        resolve(response);
      });
    });

  const ensureRemoteParticipant = (producerMeta) => {
    addOrUpdateParticipant({
      socketId: producerMeta.socketId,
      userId: producerMeta.userId,
      displayName: producerMeta.displayName || 'Participant',
      stream: null,
      audioOn: true,
      videoOn: true,
    });
  };

  const consumeProducer = async (producerMeta) => {
    const { recvTransport, device } = mediasoupRef.current;
    if (!recvTransport || !device) return;

    ensureRemoteParticipant(producerMeta);

    const consumeResp = await requestSocket('voice:consume', {
      roomId: currentRoomRef.current,
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

    addOrUpdateParticipant({
      socketId: producerMeta.socketId,
      userId: producerMeta.userId,
      displayName: producerMeta.displayName || 'Participant',
      stream: currentStream,
      audioOn: producerMeta.kind === 'audio' ? true : undefined,
      videoOn: producerMeta.kind === 'video' ? true : undefined,
    });

    await requestSocket('voice:resumeConsumer', {
      roomId: currentRoomRef.current,
      consumerId: consumer.id,
    });
  };

  const loadInviteCandidates = useCallback(async () => {
    setInviteLoading(true);
    try {
      if (roomKind === 'free') {
        const resp = await friendService.getFriends();
        const payload = resp?.data || resp;
        const result = payload?.data || payload;
        const list = result?.friends || result;
        const friends = Array.isArray(list) ? list : [];
        setInviteCandidates(
          friends.map((f) => {
            const u = f.friendId || f;
            const id = String(u?._id || u?.id || f.id || '');
            const uname = typeof u?.username === 'string' ? u.username.trim() : '';
            return {
              id,
              label:
                u?.displayName || u?.fullName || u?.username || u?.email?.split('@')[0] || id.slice(-6),
              subtitle: u?.email || (uname ? `@${uname}` : '') || '',
              avatar: u?.avatar || null,
            };
          })
        );
        return;
      }
      if (roomKind === 'org' && selectedOrgId && selectedDeptId) {
        const res = await organizationAPI.getMembers(selectedOrgId);
        const members = parseMembersRes(res);
        const filtered = members.filter(
          (m) =>
            String(m?.status || 'active') === 'active' &&
            deptMatchesMember(m, selectedDeptId) &&
            memberUserId(m) !== currentUserId
        );
        const rows = await Promise.all(
          filtered.map(async (m) => {
            const uid = memberUserId(m);
            let label = `…${uid.slice(-6)}`;
            let subtitle = '';
            let avatar = null;
            try {
              const ur = await userService.getProfile(uid);
              const raw = ur?.data ?? ur;
              const p = raw?.data ?? raw;
              label =
                p?.displayName || p?.fullName || p?.username || p?.email?.split('@')[0] || label;
              subtitle = p?.email || '';
              avatar = p?.avatar || null;
            } catch {
              /* giữ mặc định */
            }
            return { id: uid, label, subtitle, avatar };
          })
        );
        setInviteCandidates(rows);
        return;
      }
      setInviteCandidates([]);
    } catch (e) {
      console.error(e);
      toast.error(t('voiceRoom.inviteLoadFail'));
      setInviteCandidates([]);
    } finally {
      setInviteLoading(false);
    }
  }, [roomKind, selectedOrgId, selectedDeptId, currentUserId]);

  useEffect(() => {
    if (!inviteModalOpen) return;
    loadInviteCandidates();
  }, [inviteModalOpen, loadInviteCandidates]);

  useEffect(() => {
    if (!inviteModalOpen) setInviteSearch('');
  }, [inviteModalOpen]);

  const initVoiceRoom = async ({
    targetRoomId,
    audioEnabled = true,
    videoEnabled = true,
    displayName = '',
  }) => {
    const roomTarget = targetRoomId || safeRoomId || 'room1';
    try {
      setJoining(true);
      setError('');
      setParticipants([]);
      currentRoomRef.current = roomTarget;
      setActiveRoomId(roomTarget);

      await api.get(`/voice/rooms/${encodeURIComponent(roomTarget)}/bootstrap`);

      let localStream = prejoinStreamRef.current;
      if (!localStream) {
        if (audioEnabled || videoEnabled) {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: Boolean(audioEnabled),
            video: Boolean(videoEnabled),
          });
        } else {
          localStream = new MediaStream();
        }
      }
      mediasoupRef.current.localStream = localStream;
      // localVideoRef chỉ mount khi viewStage === 'inRoom' — gán srcObject trong ref callback / useEffect
      setHasLocalVideoTrack(localStream.getVideoTracks().length > 0);

      startAudioLevelMonitor('local', localStream, (speaking) => {
        setIsLocalSpeaking(speaking && !isMuted);
      });

      const token = normalizeToken(localStorage.getItem('token'));
      const socket = io(`${getSignalBaseUrl()}/voice`, {
        path: getSignalPath(),
        transports: ['websocket', 'polling'],
        auth: token ? { token } : {},
      });
      mediasoupRef.current.socket = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', (err) => {
        setError(err.message || 'Voice signaling connect error');
      });

      socket.on('voice:peerJoined', (payload) => {
        addOrUpdateParticipant({
          socketId: payload.socketId,
          userId: payload.userId,
          displayName: payload.displayName || 'Participant',
          stream: mediasoupRef.current.remoteStreams.get(payload.socketId) || null,
        });
      });

      socket.on('voice:peerLeft', (payload) => {
        removeParticipant(payload.socketId);
        stopAudioLevelMonitor(`remote:${payload.socketId}`);
        setRemoteSpeakingMap((prev) => {
          const next = { ...prev };
          delete next[payload.socketId];
          return next;
        });
        const stream = mediasoupRef.current.remoteStreams.get(payload.socketId);
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          mediasoupRef.current.remoteStreams.delete(payload.socketId);
        }
      });

      const mediasoupModule = await import('mediasoup-client');
      const DeviceClass = mediasoupModule.Device;

      const joinResp = await requestSocket('voice:joinRoom', { roomId: roomTarget, displayName });
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
        } catch (consumeError) {
          console.error('consume new producer failed', consumeError);
        }
      });
      setIsMuted(!audioTrack);
      setIsCameraOff(!videoTrack);
      setViewStage('inRoom');
      stopPrejoinPreview({ keepStreamForRoom: true });

      const qs = new URLSearchParams();
      qs.set('kind', roomKind);
      if (roomKind === 'org') {
        if (selectedOrgId) qs.set('orgId', selectedOrgId);
        if (selectedDeptId) qs.set('deptId', selectedDeptId);
      }
      navigate(`/voice/${encodeURIComponent(roomTarget)}?${qs.toString()}`, { replace: true });
    } catch (initError) {
      console.error(initError);
      const msg = initError.message || t('voiceRoom.connectFail');
      setError(msg);
      toast.error(msg);
    } finally {
      setJoining(false);
    }
  };

  const leaveRoom = async () => {
    try {
      const { socket, audioProducer, videoProducer, sendTransport, recvTransport, consumers, localStream } =
        mediasoupRef.current;

      if (socket?.connected) {
        socket.emit('voice:leaveRoom', { roomId: currentRoomRef.current });
      }

      for (const consumer of consumers.values()) {
        consumer.close();
      }
      consumers.clear();

      audioProducer?.close();
      videoProducer?.close();
      sendTransport?.close();
      recvTransport?.close();

      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
      stopAudioLevelMonitor('local');
      for (const key of [...audioLevelMonitorsRef.current.keys()]) {
        if (key.startsWith('remote:')) stopAudioLevelMonitor(key);
      }
      setRemoteSpeakingMap({});
      setIsLocalSpeaking(false);
      setHasLocalVideoTrack(false);
      setActiveRoomId(null);
      setViewStage('home');
      setRightPanel(null);
      setInviteModalOpen(false);
      setReactionPickerOpen(false);
      setRoomChatEmojiOpen(false);
      setRoomMessages([]);
      setRoomChatInput('');
      setMoreMenuOpen(false);
      setLayoutModalOpen(false);
      setSettingsOpen(false);
      setPipOpen(false);
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }

      socket?.disconnect();
      navigate('/voice');
    } catch (leaveError) {
      console.error(leaveError);
      setRightPanel(null);
      setInviteModalOpen(false);
      setMoreMenuOpen(false);
      setLayoutModalOpen(false);
      setSettingsOpen(false);
      setPipOpen(false);
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      navigate('/voice');
    }
  };

  const toggleMute = async () => {
    const producer = mediasoupRef.current.audioProducer;
    if (!producer) return;
    if (isMuted) {
      await producer.resume();
    } else {
      await producer.pause();
    }
    setIsMuted((prev) => {
      const nextMuted = !prev;
      if (nextMuted) setIsLocalSpeaking(false);
      return nextMuted;
    });
  };

  const toggleCamera = async () => {
    try {
      const { sendTransport } = mediasoupRef.current;

      // Bat camera lai: mo thiet bi cam that va tao producer moi
      if (isCameraOff) {
        if (!sendTransport) return;

        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = camStream.getVideoTracks()[0];
        if (!newVideoTrack) return;

        if (!mediasoupRef.current.localStream) {
          mediasoupRef.current.localStream = new MediaStream();
        }
        const localStream = mediasoupRef.current.localStream;

        // Dam bao chi co 1 video track local
        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
        localStream.addTrack(newVideoTrack);

        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: newVideoTrack,
          appData: { mediaTag: 'video' },
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        setHasLocalVideoTrack(true);
        setIsCameraOff(false);
        return;
      }

      // Tat camera: close producer + stop track de giai phong camera o he thong
      const producer = mediasoupRef.current.videoProducer;
      if (producer) {
        producer.close();
        mediasoupRef.current.videoProducer = null;
      }

      const localStream = mediasoupRef.current.localStream;
      if (localStream) {
        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      }

      setHasLocalVideoTrack(false);
      setIsCameraOff(true);
    } catch (cameraError) {
      console.error(cameraError);
      toast.error(cameraError.message || t('voiceRoom.cameraToggleFail'));
    }
  };

  useEffect(() => {
    if (landingDemo) return undefined;
    if (safeRoomId) {
      setMeetingCode(safeRoomId);
      setViewStage((prev) => (prev === 'inRoom' ? 'inRoom' : 'prejoin'));
    } else {
      setViewStage('home');
    }
  }, [safeRoomId]);

  useEffect(() => {
    return () => {
      const { socket, localStream, consumers, audioProducer, videoProducer, sendTransport, recvTransport } =
        mediasoupRef.current;
      socket?.disconnect();
      localStream?.getTracks().forEach((track) => track.stop());
      stopPrejoinPreview();
      stopAudioLevelMonitor('local');
      for (const key of [...audioLevelMonitorsRef.current.keys()]) {
        if (key.startsWith('remote:')) stopAudioLevelMonitor(key);
      }
      setRemoteSpeakingMap({});
      setIsLocalSpeaking(false);
      consumers.forEach((consumer) => consumer.close());
      audioProducer?.close();
      videoProducer?.close();
      sendTransport?.close();
      recvTransport?.close();
    };
  }, []);

  useEffect(() => {
    if (landingDemo) return;
    const activeRemoteKeys = new Set();
    participants.forEach((participant) => {
      const key = `remote:${participant.socketId}`;
      activeRemoteKeys.add(key);
      if (participant.stream) {
        startAudioLevelMonitor(key, participant.stream, (speaking) => {
          setRemoteSpeakingMap((prev) => {
            if (prev[participant.socketId] === speaking) return prev;
            return { ...prev, [participant.socketId]: speaking };
          });
        });
      }
    });

    for (const key of [...audioLevelMonitorsRef.current.keys()]) {
      if (key.startsWith('remote:') && !activeRemoteKeys.has(key)) {
        stopAudioLevelMonitor(key);
      }
    }
  }, [participants, landingDemo]);

  useEffect(() => {
    if (landingDemo) return undefined;
    if (viewStage !== 'prejoin') return undefined;
    startPrejoinPreview(prejoinAudioEnabled, prejoinVideoEnabled);
    return () => {
      stopPrejoinPreview();
    };
  }, [viewStage, prejoinAudioEnabled, prejoinVideoEnabled, landingDemo]);

  /** Đảm bảo gán lại stream sau khi vào phòng (ref mount / StrictMode / re-render). */
  useEffect(() => {
    if (landingDemo) return;
    if (viewStage !== 'inRoom') return;
    if (!hasLocalVideoTrack || isCameraOff) return;
    const stream = mediasoupRef.current.localStream;
    const el = localVideoRef.current;
    if (!stream || !el) return;
    const live = stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!live) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play?.().catch(() => {});
    }
  }, [viewStage, hasLocalVideoTrack, isCameraOff, joining, landingDemo]);

  const handleNewMeeting = () => {
    const generated = generateMeetingCode();
    setMeetingCode(generated);
    setPrejoinAudioEnabled(true);
    setPrejoinVideoEnabled(true);
    setRoomKind('free');
    setSelectedOrgId('');
    setSelectedDeptId('');
    setViewStage('prejoin');
  };

  const handleJoinMeeting = () => {
    const code = String(meetingCode || '').trim();
    if (!code) {
      toast.error(t('voiceRoom.meetingIdRequired'));
      return;
    }
    if (roomKind === 'org') {
      if (!selectedOrgId) {
        toast.error(t('voiceRoom.selectOrg'));
        return;
      }
      if (!selectedDeptId) {
        toast.error(t('voiceRoom.selectDept'));
        return;
      }
    }
    initVoiceRoom({
      targetRoomId: code,
      audioEnabled: prejoinAudioEnabled,
      videoEnabled: prejoinVideoEnabled,
      displayName: displayNameInput,
    });
  };

  const clockNow = new Date();
  const dateLine = clockNow
    .toLocaleDateString(timeLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();

  const voiceNav = useMemo(
    () => [
      {
        id: 'new',
        label: t('voiceRoom.newMeeting'),
        icon: Plus,
        onClick: handleNewMeeting,
      },
      {
        id: 'join',
        label: t('voiceRoom.joinNav'),
        icon: LogIn,
        onClick: () => setViewStage('prejoin'),
      },
      {
        id: 'schedule',
        label: t('voiceRoom.schedule'),
        icon: Calendar,
        onClick: () => toast(t('voiceRoom.scheduleSoon'), { icon: '📅' }),
      },
      {
        id: 'share',
        label: t('voiceRoom.screenShare'),
        icon: Monitor,
        onClick: () => toast(t('voiceRoom.screenShareSoon'), { icon: '🖥️' }),
      },
      {
        id: 'notes',
        label: t('voiceRoom.notes'),
        icon: FileText,
        onClick: () => toast(t('voiceRoom.notesSoon'), { icon: '📝' }),
      },
    ],
    [t]
  );

  /** Khung lobby: sáng = cùng tông shell app; tối = nền đen (trước khi vào phòng) */
  const voiceLobby = useMemo(
    () =>
      `flex min-h-0 flex-1 w-full flex-row overflow-hidden ${
        isDarkMode ? 'bg-black' : 'bg-white/55 backdrop-blur-sm'
      }`,
    [isDarkMode]
  );

  const renderMeetingTile = (tile, index) => {
    const extra = tileItemClass(layoutMode, index);
    if (tile.kind === 'local') {
      return (
        <div
          key="local"
          className={`relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border md:min-h-[260px] ${
            isLocalSpeaking && !isMuted
              ? 'border-emerald-400/60 shadow-[0_0_24px_rgba(52,211,153,0.25)]'
              : 'border-white/10'
          } bg-black/40 ${extra}`}
        >
          {hasLocalVideoTrack && !isCameraOff ? (
            <video
              ref={(node) => {
                localVideoRef.current = node;
                const stream = mediasoupRef.current.localStream;
                if (node && stream && node.srcObject !== stream) {
                  node.srcObject = stream;
                  node.play?.().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              muted
              className="h-full min-h-[200px] w-full flex-1 object-cover"
            />
          ) : (
            <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900/80 to-black/80 md:min-h-[260px]">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-3xl font-bold text-white shadow-lg">
                {localAvatar && String(localAvatar).startsWith('http') ? (
                  <img src={localAvatar} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  buildInitials(localDisplayName)
                )}
              </div>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
              {displayNameInput || localDisplayName}
            </span>
            <span className="rounded-md bg-violet-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {t('voiceRoom.youBadge')}
            </span>
            {isMuted && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600/90">
                <MicOff className="h-4 w-4 text-white" aria-hidden />
              </span>
            )}
          </div>
        </div>
      );
    }
    const participant = tile.participant;
    return (
      <div
        key={participant.socketId}
        className={`relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border bg-black/40 md:min-h-[260px] ${
          remoteSpeakingMap[participant.socketId]
            ? 'border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
            : 'border-white/10'
        } ${extra}`}
      >
        {participant.stream && participant.stream.getVideoTracks().length > 0 ? (
          <video
            autoPlay
            playsInline
            ref={(node) => {
              if (!node) return;
              if (node.srcObject !== participant.stream) {
                node.srcObject = participant.stream;
              }
            }}
            className="h-full min-h-[200px] w-full flex-1 object-cover"
          />
        ) : (
          <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 bg-zinc-900/80 md:min-h-[260px]">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-xl font-bold text-white">
              {buildInitials(participant.displayName || participant.userId || 'P')}
            </div>
            <span className="text-xs text-gray-500">{t('voiceRoom.camOff')}</span>
          </div>
        )}
        <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-2.5 py-1 text-xs text-white">
          {participant.displayName || participant.userId || t('voiceRoom.memberFallback')}
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen flex ${isDarkMode ? 'bg-[#050810]' : appShellBg(false)}`}>
      <NavigationSidebar landingDemo={landingDemo} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {viewStage !== 'inRoom' ? (
          <div className={voiceLobby}>
            {/* Cột trái: menu (hình 1) */}
            <aside
              className={`flex w-52 shrink-0 flex-col gap-1 border-r px-3 py-6 md:w-56 ${
                isDarkMode ? 'border-white/10' : 'border-slate-200 bg-white/50'
              }`}
            >
              {voiceNav.map((item) => {
                const active =
                  (item.id === 'new' && viewStage === 'home') ||
                  (item.id === 'join' && viewStage === 'prejoin');
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onClick}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? isDarkMode
                          ? 'border border-cyan-500/50 bg-white/[0.06] text-white shadow-[0_0_28px_rgba(6,182,212,0.2)]'
                          : 'border border-cyan-500/60 bg-cyan-50 text-slate-900 shadow-md'
                        : isDarkMode
                          ? 'text-gray-500 hover:bg-white/5 hover:text-gray-200'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" strokeWidth={1.75} />
                    <span className="text-sm font-medium leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 md:px-8">
              {/* Đồng hồ + ngày */}
              <div className="mb-8 text-center">
                <div
                  className={`text-4xl font-bold tabular-nums tracking-[0.2em] md:text-5xl md:tracking-[0.25em] ${
                    isDarkMode ? 'text-white' : 'text-slate-900'
                  }`}
                  suppressHydrationWarning
                  data-clock-tick={clockTick}
                >
                  {clockNow.toLocaleTimeString(timeLocale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </div>
                <p
                  className={`mt-3 text-[11px] font-medium uppercase tracking-[0.2em] md:text-xs ${
                    isDarkMode ? 'text-gray-500' : 'text-slate-600'
                  }`}
                >
                  {dateLine}
                </p>
              </div>

              {viewStage === 'home' && (
                <div
                  className={`flex min-h-[min(520px,70vh)] flex-1 flex-col items-center justify-center rounded-2xl border px-6 py-16 ${
                    isDarkMode
                      ? 'border-white/10 bg-[#121212]'
                      : 'border-slate-200 bg-white shadow-md'
                  }`}
                >
                  <p
                    className={`text-lg md:text-xl ${isDarkMode ? 'text-white' : 'text-slate-800'}`}
                  >
                    {t('voiceRoom.noMeetings')}
                  </p>
                  <button
                    type="button"
                    onClick={handleNewMeeting}
                    className="mt-8 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-900/25 transition hover:brightness-110"
                  >
                    {t('voiceRoom.createNow')}
                  </button>
                </div>
              )}

              {viewStage === 'prejoin' && (
                <div className="flex flex-1 flex-col gap-8 lg:flex-row lg:justify-end lg:gap-12">
                  <div
                    className={`w-full max-w-xl rounded-2xl border p-4 lg:max-w-md ${
                      isDarkMode
                        ? 'border-white/10 bg-[#141414]'
                        : 'border-slate-200 bg-white shadow-sm'
                    }`}
                  >
                    <div
                      className={`relative aspect-video overflow-hidden rounded-xl ${
                        isDarkMode ? 'bg-black/50' : 'bg-slate-200'
                      }`}
                    >
                      {prejoinVideoEnabled ? (
                        <video
                          ref={prejoinVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 text-3xl font-bold text-white">
                            {buildInitials(displayNameInput || localDisplayName)}
                          </div>
                          <span
                            className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                          >
                            {t('voiceRoom.camOffShort')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPrejoinAudioEnabled((v) => !v)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                          prejoinAudioEnabled
                            ? isDarkMode
                              ? 'border border-white/10 bg-black/40 text-white'
                              : 'border border-slate-200 bg-white text-slate-900 shadow-sm'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {prejoinAudioEnabled ? t('voiceRoom.micOn') : t('voiceRoom.micOff')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrejoinVideoEnabled((v) => !v)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                          prejoinVideoEnabled
                            ? isDarkMode
                              ? 'border border-white/10 bg-black/40 text-white'
                              : 'border border-slate-200 bg-white text-slate-900 shadow-sm'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {prejoinVideoEnabled ? t('voiceRoom.camOn') : t('voiceRoom.camBtnOff')}
                      </button>
                    </div>
                  </div>

                  <div
                    className={`w-full max-w-md rounded-2xl border p-6 md:p-8 lg:shrink-0 ${
                      isDarkMode
                        ? 'border-white/10 bg-[#141414]'
                        : 'border-slate-200 bg-white shadow-sm'
                    }`}
                  >
                    <h2
                      className={`mb-8 text-3xl font-bold lg:text-right ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {t('voiceRoom.joinTitle')}
                    </h2>
                    <div className="space-y-5">
                      <div>
                        <label
                          className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          {t('voiceRoom.roomCode')}
                        </label>
                        <input
                          value={meetingCode}
                          onChange={(e) => setMeetingCode(e.target.value)}
                          placeholder="vox-hacker-room"
                          className={`w-full rounded-xl border px-4 py-3 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 ${
                            isDarkMode
                              ? 'border-white/10 bg-black/50 text-white placeholder:text-gray-600'
                              : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                      </div>
                      <div>
                        <span
                          className={`mb-2 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          {t('voiceRoom.roomKind')}
                        </span>
                        <div
                          className={`flex flex-wrap gap-4 text-sm ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}
                        >
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="voice-room-kind"
                              checked={roomKind === 'free'}
                              onChange={() => {
                                setRoomKind('free');
                                setSelectedOrgId('');
                                setSelectedDeptId('');
                              }}
                              className={`h-4 w-4 text-violet-600 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                            />
                            {t('voiceRoom.roomTypeFree')}
                          </label>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="voice-room-kind"
                              checked={roomKind === 'org'}
                              onChange={() => setRoomKind('org')}
                              className={`h-4 w-4 text-violet-600 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                            />
                            {t('voiceRoom.roomTypeOrg')}
                          </label>
                        </div>
                      </div>
                      {roomKind === 'org' && (
                        <div className="space-y-3">
                          <div>
                            <label
                              className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                            >
                              {t('voiceRoom.orgLabel')}
                            </label>
                            <select
                              value={selectedOrgId}
                              onChange={(e) => {
                                setSelectedOrgId(e.target.value);
                                setSelectedDeptId('');
                              }}
                              disabled={orgsLoading}
                              className={`w-full rounded-xl border px-4 py-3 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40 disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-white/10 bg-black/50 text-white'
                                  : 'border-slate-200 bg-white text-slate-900'
                              }`}
                            >
                              <option value="">
                                {orgsLoading ? t('common.loadingEllipsis') : t('voiceRoom.selectOrgPh')}
                              </option>
                              {organizations.map((o) => (
                                <option key={String(o._id || o.id)} value={String(o._id || o.id)}>
                                  {o.name || t('common.org')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                            >
                              {t('voiceRoom.deptLabel')}
                            </label>
                            <select
                              value={selectedDeptId}
                              onChange={(e) => setSelectedDeptId(e.target.value)}
                              disabled={!selectedOrgId}
                              className={`w-full rounded-xl border px-4 py-3 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40 disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-white/10 bg-black/50 text-white'
                                  : 'border-slate-200 bg-white text-slate-900'
                              }`}
                            >
                              <option value="">{t('voiceRoom.selectDeptPh')}</option>
                              {departments.map((d) => (
                                <option key={String(d._id || d.id)} value={String(d._id || d.id)}>
                                  {d.name || t('common.department')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                      <div>
                        <label
                          className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          {t('voiceRoom.displayName')}
                        </label>
                        <input
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder={localDisplayName}
                          className={`w-full rounded-xl border px-4 py-3 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 ${
                            isDarkMode
                              ? 'border-white/10 bg-black/50 text-white placeholder:text-gray-600'
                              : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                      </div>
                      <label
                        className={`flex cursor-pointer items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={!prejoinAudioEnabled}
                          onChange={(e) => setPrejoinAudioEnabled(!e.target.checked)}
                          className={`h-4 w-4 rounded text-cyan-600 focus:ring-cyan-500 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                        />
                        {t('voiceRoom.muteJoin')}
                      </label>
                      <label
                        className={`flex cursor-pointer items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={!prejoinVideoEnabled}
                          onChange={(e) => setPrejoinVideoEnabled(!e.target.checked)}
                          className={`h-4 w-4 rounded text-cyan-600 focus:ring-cyan-500 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                        />
                        {t('voiceRoom.camOffJoin')}
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleJoinMeeting}
                      className="mt-8 w-full rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 py-3.5 text-center text-base font-semibold text-white shadow-lg transition hover:brightness-110"
                    >
                      {t('voiceRoom.startBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopPrejoinPreview();
                        setViewStage('home');
                      }}
                      className={`mt-4 w-full py-2 text-center text-sm transition ${
                        isDarkMode
                          ? 'text-gray-500 hover:text-gray-300'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('nav.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div ref={meetingRootRef} className="relative flex min-h-0 flex-1 flex-col bg-black">
            {error && (
              <div className="absolute right-5 top-5 z-30 max-w-xs rounded-lg bg-red-950/90 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            )}
            {joining && (
              <div className="absolute right-5 top-16 z-30 rounded-full bg-zinc-900/95 px-4 py-2 text-sm text-gray-300 shadow-lg">
                {t('voiceRoom.connectingRoom')}
              </div>
            )}

            {/* Thanh trạng thái nổi (hình 3) */}
            <div className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-full border border-white/10 bg-zinc-900/95 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-md md:left-8 md:top-6">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                title={connected ? t('voiceRoom.connected') : t('voiceRoom.connecting')}
              />
              <span className="max-w-[140px] truncate font-semibold tracking-tight md:max-w-[220px]">
                {currentMeetingCode}
              </span>
              <span className="text-white/25">|</span>
              <Users className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
              <span className="tabular-nums">{totalParticipants}</span>
              <span className="text-white/25">|</span>
              <span className="tabular-nums text-white/90">{formatCallDuration(callDurationSec)}</span>
            </div>

            <div className="pointer-events-none absolute bottom-28 left-4 z-20 text-left text-sm text-white/90 md:bottom-32 md:left-8">
              <div className="tabular-nums font-medium" suppressHydrationWarning>
                {clockNow.toLocaleTimeString(timeLocale, {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </div>
              <div className="mt-0.5 max-w-[200px] truncate text-xs text-white/45">{currentMeetingCode}</div>
            </div>

            {isFullscreen && (
              <div className="pointer-events-none absolute left-0 right-0 top-0 z-[60] flex justify-center px-4 pt-3">
                <div className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg bg-black/85 px-4 py-2 text-xs text-white shadow-lg backdrop-blur-md md:text-sm">
                  <span className="text-white/85">
                    {t('voiceRoom.fullscreenExitHint')}{' '}
                    <button
                      type="button"
                      className="font-semibold text-sky-400 underline hover:text-sky-300"
                      onClick={() => document.exitFullscreen?.()}
                    >
                      {t('voiceRoom.exitShort')}
                    </button>
                  </span>
                </div>
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-36 pt-24 md:px-8">
              {pipOpen && (
                <div className="pointer-events-none absolute inset-0 z-[25] flex flex-col items-center justify-center gap-4 bg-black/55 px-6 text-center backdrop-blur-sm">
                  <p className="max-w-md text-lg text-white">{t('voiceRoom.pipBody')}</p>
                  <p className="max-w-md text-sm text-white/70">{t('voiceRoom.pipSecondLine')}</p>
                  <button
                    type="button"
                    className="pointer-events-auto rounded-full bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
                    onClick={() => setPipOpen(false)}
                  >
                    {t('voiceRoom.pipRestore')}
                  </button>
                </div>
              )}
              <div className="w-full max-w-5xl">
                <div className="rounded-2xl border-2 border-violet-500/35 bg-black/30 p-4 shadow-[0_0_60px_rgba(139,92,246,0.08)] md:p-6">
                  {layoutTiles.length === 0 ? (
                    <p className="py-12 text-center text-sm text-gray-400">{t('voiceRoom.noVideoTiles')}</p>
                  ) : layoutMode === 'sidebar' && layoutTiles.length > 1 ? (
                    <div className={`${meetingGridClass} min-h-[200px]`}>
                      <div className="min-h-0 min-w-0 flex-1 lg:flex-[3]">{renderMeetingTile(layoutTiles[0], 0)}</div>
                      <div className="flex flex-col gap-3 overflow-y-auto lg:max-h-[min(70vh,560px)] lg:w-52 lg:shrink-0">
                        {layoutTiles.slice(1).map((t, i) => renderMeetingTile(t, i + 1))}
                      </div>
                    </div>
                  ) : (
                    <div className={meetingGridClass}>
                      {layoutTiles.map((t, i) => renderMeetingTile(t, i))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {pipOpen && (
              <div
                className="fixed z-[55] overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl"
                style={{
                  left: pipBox.x,
                  top: pipBox.y,
                  width: pipBox.w,
                  height: pipBox.h,
                }}
              >
                <div
                  className="flex cursor-move items-center justify-between gap-2 border-b border-white/10 bg-zinc-900/95 px-2 py-1.5"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pipDragging.current = {
                      type: 'move',
                      sx: e.clientX,
                      sy: e.clientY,
                      ox: pipBox.x,
                      oy: pipBox.y,
                    };
                  }}
                >
                  <span className="truncate text-[11px] text-white/80">{t('voiceRoom.pipLabel')}</span>
                  <button
                    type="button"
                    className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                    onClick={() => setPipOpen(false)}
                    aria-label={t('voiceRoom.closePipAria')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative bg-black" style={{ height: pipBox.h - 40 }}>
                  {hasLocalVideoTrack && !isCameraOff ? (
                    <video
                      ref={pipVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-sm text-gray-400">
                      {t('voiceRoom.camOffShort')}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize opacity-70"
                    aria-label={t('voiceRoom.zoomAria')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      pipDragging.current = {
                        type: 'resize',
                        sx: e.clientX,
                        sy: e.clientY,
                        ow: pipBox.w,
                        oh: pipBox.h,
                      };
                    }}
                  >
                    <span className="block h-full w-full border-r-2 border-b-2 border-white/50" />
                  </button>
                </div>
              </div>
            )}

            {reactionPickerOpen && (
              <button
                type="button"
                aria-label={t('voiceRoom.closeReactionAria')}
                className="fixed inset-0 z-[34] cursor-default bg-black/20"
                onClick={() => setReactionPickerOpen(false)}
              />
            )}
            {reactionPickerOpen && (
              <div className="fixed bottom-28 left-1/2 z-[36] w-[min(100vw-2rem,22rem)] -translate-x-1/2 rounded-2xl border border-white/15 bg-zinc-900/98 p-3 shadow-2xl backdrop-blur-md md:bottom-32">
                <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t('voiceRoom.reactionsTitle')}
                </p>
                <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto pr-1">
                  {COMPOSER_EMOJI_LIST.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="rounded-lg p-1.5 text-xl transition hover:bg-white/10"
                      onClick={() => {
                        toast(t('voiceRoom.reactSent', { emoji }), { icon: emoji });
                        setReactionPickerOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Thanh điều khiển nổi (hình 3) */}
            <div className="pointer-events-none absolute bottom-4 left-0 right-0 z-30 flex justify-center px-2 md:bottom-8">
              <div className="pointer-events-auto flex max-w-[min(100%,56rem)] flex-wrap items-end justify-between gap-3 rounded-2xl border border-white/10 bg-black/85 px-3 py-3 shadow-2xl backdrop-blur-xl md:gap-6 md:px-6">
                <div className="flex items-end gap-1 sm:gap-3">
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarAudio')}
                    icon={Mic}
                    iconOff={MicOff}
                    active={!isMuted}
                    onClick={toggleMute}
                    chevron
                  />
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarVideo')}
                    icon={Video}
                    iconOff={VideoOff}
                    active={!isCameraOff}
                    onClick={toggleCamera}
                    chevron
                  />
                </div>

                <div className="flex flex-1 flex-wrap items-end justify-center gap-0.5 sm:gap-2 md:gap-4">
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarMembers')}
                    icon={Users}
                    badge={totalParticipants}
                    pressed={rightPanel === 'people'}
                    onClick={() => {
                      setReactionPickerOpen(false);
                      setRightPanel((p) => (p === 'people' ? null : 'people'));
                    }}
                    chevron
                  />
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarReact')}
                    icon={Heart}
                    pressed={reactionPickerOpen}
                    onClick={() => {
                      setRightPanel(null);
                      setReactionPickerOpen((v) => !v);
                    }}
                    chevron
                  />
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarChat')}
                    icon={MessageSquare}
                    pressed={rightPanel === 'chat'}
                    onClick={() => {
                      setReactionPickerOpen(false);
                      setRightPanel((p) => (p === 'chat' ? null : 'chat'));
                    }}
                    chevron
                  />
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarShare')}
                    icon={Share2}
                    onClick={() => toast(t('voiceRoom.screenShareSoon'), { icon: '🖥️' })}
                    chevron
                  />
                  <div className="relative" ref={moreMenuWrapRef}>
                    <VoiceToolbarControl
                      label={t('voiceRoom.toolbarMore')}
                      icon={MoreHorizontal}
                      pressed={moreMenuOpen}
                      onClick={() => {
                        setReactionPickerOpen(false);
                        setMoreMenuOpen((v) => !v);
                      }}
                      chevron={false}
                    />
                    {moreMenuOpen && (
                      <div className="absolute bottom-full left-1/2 z-[45] mb-2 w-[min(calc(100vw-2rem),17rem)] -translate-x-1/2 rounded-xl border border-white/10 bg-zinc-900 py-1.5 shadow-2xl">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setLayoutModalOpen(true);
                          }}
                        >
                          <LayoutGrid className="h-4 w-4 shrink-0 text-white/80" />
                          {t('voiceRoom.layoutTitle')}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            toggleMeetingFullscreen();
                          }}
                        >
                          {isFullscreen ? (
                            <Minimize2 className="h-4 w-4 shrink-0 text-white/80" />
                          ) : (
                            <Maximize2 className="h-4 w-4 shrink-0 text-white/80" />
                          )}
                          {isFullscreen ? t('voiceRoom.fullscreenExit') : t('voiceRoom.fullscreenEnter')}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setPipOpen(true);
                          }}
                        >
                          <PictureInPicture2 className="h-4 w-4 shrink-0 text-white/80" />
                          {t('voiceRoom.openPip')}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setSettingsOpen(true);
                            setSettingsTab('audio');
                          }}
                        >
                          <Settings className="h-4 w-4 shrink-0 text-white/80" />
                          {t('voiceRoom.settingsTitle')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={leaveRoom}
                    className="group flex flex-col items-center gap-1 rounded-xl px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
                    title={t('voiceRoom.endCall')}
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 shadow-lg transition group-hover:bg-red-500">
                      <X className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
                    </div>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-white/70 group-hover:text-white">
                      {t('voiceRoom.endShort')}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`fixed inset-y-0 right-0 z-40 flex h-full w-[min(100vw,22rem)] flex-col border-l border-white/10 bg-[#1a1a1a] shadow-2xl transition-transform duration-300 ease-out ${
                rightPanel ? 'translate-x-0' : 'pointer-events-none translate-x-full'
              }`}
            >
              {rightPanel === 'chat' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <h2 className="text-sm font-semibold text-white">{t('voiceRoom.inCallChatTitle')}</h2>
                    <button
                      type="button"
                      onClick={() => setRightPanel(null)}
                      className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                      aria-label={t('voiceRoom.closeAria')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2 text-xs text-gray-400">
                    <span>{t('voiceRoom.allowChat')}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={allowParticipantChat}
                      onClick={() => setAllowParticipantChat((v) => !v)}
                      className={`relative h-6 w-11 rounded-full transition ${
                        allowParticipantChat ? 'bg-violet-600' : 'bg-zinc-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                          allowParticipantChat ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <p className="mx-4 mt-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-gray-400">
                    {t('voiceRoom.chatSessionNote')}
                  </p>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
                    {roomMessages.map((m) => (
                      <div key={m.id} className="flex justify-end">
                        <div className="max-w-[90%] rounded-2xl rounded-br-md bg-sky-600/90 px-3 py-2 text-sm text-white shadow">
                          {m.text}
                          <div className="mt-1 text-[10px] text-sky-100/80">{m.timeLabel}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="relative border-t border-white/10 p-3">
                    {roomChatEmojiOpen && (
                      <>
                        <button
                          type="button"
                          className="fixed inset-0 z-10 cursor-default"
                          aria-label={t('voiceRoom.emojiCloseAria')}
                          onClick={() => setRoomChatEmojiOpen(false)}
                        />
                        <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-xl">
                          <div className="grid grid-cols-8 gap-1">
                            {COMPOSER_EMOJI_LIST.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                className="rounded p-1 text-lg hover:bg-white/10"
                                onClick={() => {
                                  setRoomChatInput((prev) => `${prev || ''}${emoji}`);
                                  setRoomChatEmojiOpen(false);
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-white/10 px-2 py-2 text-lg text-white/80 hover:bg-white/10"
                        onClick={() => setRoomChatEmojiOpen((v) => !v)}
                        aria-label={t('voiceRoom.emojiBtnAria')}
                      >
                        🙂
                      </button>
                      <input
                        value={roomChatInput}
                        onChange={(e) => setRoomChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            const t = roomChatInput.trim();
                            if (!t || !allowParticipantChat) return;
                            setRoomMessages((prev) => [
                              ...prev,
                              {
                                id: `${Date.now()}`,
                                text: t,
                                timeLabel: clockNow.toLocaleTimeString(timeLocale, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                }),
                              },
                            ]);
                            setRoomChatInput('');
                          }
                        }}
                        disabled={!allowParticipantChat}
                        placeholder={
                          allowParticipantChat ? t('voiceRoom.chatPlaceholder') : t('voiceRoom.chatDisabled')
                        }
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-violet-500/40 focus:outline-none disabled:opacity-50"
                      />
                      <button
                        type="button"
                        className="shrink-0 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
                        disabled={!allowParticipantChat || !roomChatInput.trim()}
                        onClick={() => {
                          const t = roomChatInput.trim();
                          if (!t) return;
                          setRoomMessages((prev) => [
                            ...prev,
                            {
                              id: `${Date.now()}`,
                              text: t,
                              timeLabel: clockNow.toLocaleTimeString(timeLocale, {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              }),
                            },
                          ]);
                          setRoomChatInput('');
                        }}
                      >
                        {t('voiceRoom.sendBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {rightPanel === 'people' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <h2 className="text-sm font-semibold text-white">{t('voiceRoom.everyoneTitle')}</h2>
                    <button
                      type="button"
                      onClick={() => setRightPanel(null)}
                      className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white"
                      aria-label={t('voiceRoom.closeAria')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500"
                    >
                      <UserPlus className="h-4 w-4" />
                      {t('voiceRoom.addPeopleTitle')}
                    </button>
                    <div className="relative mt-3">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        placeholder={t('voiceRoom.searchPeople')}
                        className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-violet-500/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {t('voiceRoom.inMeeting')}
                    </p>
                    <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-sm font-bold text-white">
                          {localAvatar && String(localAvatar).startsWith('http') ? (
                            <img src={localAvatar} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            buildInitials(displayNameInput || localDisplayName)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-white">
                            {displayNameInput || localDisplayName}{' '}
                            <span className="text-gray-500">{t('voiceRoom.you')}</span>
                          </div>
                          <div className="text-xs text-gray-500">{t('voiceRoom.host')}</div>
                        </div>
                      </div>
                    </div>
                    {participants.map((p) => (
                      <div
                        key={p.socketId}
                        className="mt-2 flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-600 text-sm font-bold text-white">
                          {buildInitials(p.displayName || p.userId || 'P')}
                        </div>
                        <div className="min-w-0 flex-1 truncate text-sm text-white">
                          {p.displayName || p.userId || t('voiceRoom.memberFallback')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {inviteModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex max-h-[min(90vh,520px)] w-full max-w-md flex-col rounded-2xl border border-white/10 bg-[#1e1e1e] shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <h3 className="text-base font-semibold text-white">{t('voiceRoom.addPeopleTitle')}</h3>
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      className="rounded-lg p-1 text-white/60 hover:bg-white/10"
                      aria-label={t('voiceRoom.closeAria')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="border-b border-white/5 px-4 py-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                      <input
                        value={inviteSearch}
                        onChange={(e) => setInviteSearch(e.target.value)}
                        placeholder={t('voiceRoom.invitePh')}
                        className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-gray-600 focus:border-violet-500/40 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      {t('voiceRoom.inviteSuggest')}
                      {roomKind === 'org' ? t('voiceRoom.inviteScopeOrg') : t('voiceRoom.inviteScopeFriends')}
                    </p>
                    {inviteLoading ? (
                      <p className="px-3 py-6 text-center text-sm text-gray-500">{t('common.loadingEllipsis')}</p>
                    ) : filteredInviteRows.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-gray-500">
                        {t('voiceRoom.inviteNoMatch')}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {filteredInviteRows.map((row) => (
                          <li
                            key={row.id}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs font-semibold text-white">
                              {row.avatar && String(row.avatar).startsWith('http') ? (
                                <img src={row.avatar} alt="" className="h-full w-full object-cover" />
                              ) : (
                                buildInitials(row.label)
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-white">{row.label}</div>
                              {row.subtitle ? (
                                <div className="truncate text-xs text-gray-500">{row.subtitle}</div>
                              ) : null}
                            </div>
                            <input type="checkbox" className="h-4 w-4 rounded border-white/20" readOnly />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border-t border-white/10 px-4 py-3 text-center text-xs text-gray-500">
                    {t('voiceRoom.inviteFooter')}
                  </div>
                </div>
              </div>
            )}

            {layoutModalOpen && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex max-h-[min(92vh,640px)] w-full max-w-lg flex-col rounded-2xl bg-white text-gray-900 shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                    <div>
                      <h2 className="text-lg font-semibold">{t('voiceRoom.layoutTitle')}</h2>
                      <p className="mt-1 text-xs text-gray-500">{t('voiceRoom.layoutSaved')}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                      onClick={() => setLayoutModalOpen(false)}
                      aria-label={t('voiceRoom.closeAria')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <div className="space-y-3">
                      {[
                        { id: 'auto', label: t('voiceRoom.layoutAuto') },
                        { id: 'tiled', label: t('voiceRoom.layoutTiled') },
                        { id: 'spotlight', label: t('voiceRoom.layoutSpotlight') },
                        { id: 'sidebar', label: t('voiceRoom.layoutSidebar') },
                      ].map((opt) => (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50"
                        >
                          <input
                            type="radio"
                            name="voice-layout-mode"
                            checked={layoutMode === opt.id}
                            onChange={() => setLayoutMode(opt.id)}
                            className="h-4 w-4 text-blue-600"
                          />
                          <span className="text-sm">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">{t('voiceRoom.tileCount')}</span>
                        <span className="text-sm tabular-nums text-gray-600">{maxTiles}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={16}
                        value={maxTiles}
                        onChange={(e) => setMaxTiles(Number(e.target.value))}
                        className="w-full accent-blue-600"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {t('voiceRoom.tileCountHelp')}
                      </p>
                    </div>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3">
                      <span className="text-sm text-gray-800">{t('voiceRoom.hideNoVideo')}</span>
                      <input
                        type="checkbox"
                        checked={hideNoVideo}
                        onChange={(e) => setHideNoVideo(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                    </label>
                  </div>
                  <div className="border-t border-gray-200 px-5 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500"
                      onClick={() => setLayoutModalOpen(false)}
                    >
                      {t('voiceRoom.layoutDone')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settingsOpen &&
              createPortal(
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="flex max-h-[min(92vh,720px)] w-full max-w-3xl overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl"
                  >
                    <aside className="w-52 shrink-0 border-r border-gray-200 bg-gray-50 py-4">
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium ${
                          settingsTab === 'audio'
                            ? 'border-l-4 border-blue-600 bg-white text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                        onClick={() => setSettingsTab('audio')}
                      >
                        {t('voiceRoom.settingsAudioTab')}
                      </button>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium ${
                          settingsTab === 'video'
                            ? 'border-l-4 border-blue-600 bg-white text-blue-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                        onClick={() => setSettingsTab('video')}
                      >
                        {t('voiceRoom.settingsVideoTab')}
                      </button>
                    </aside>
                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                        <h2 className="text-lg font-semibold">{t('voiceRoom.settingsTitle')}</h2>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
                          onClick={() => setSettingsOpen(false)}
                          aria-label={t('voiceRoom.closeAria')}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                        {settingsTab === 'audio' && (
                          <div className="space-y-6">
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">{t('voiceRoom.micLabel')}</label>
                              <select
                                value={selectedMicId}
                                onChange={(e) => applyMicrophoneDevice(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
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
                              <label className="mb-2 block text-sm font-medium text-blue-700">{t('voiceRoom.speakerLabel')}</label>
                              <select
                                value={selectedSpeakerId}
                                onChange={(e) => setSelectedSpeakerId(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
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
                              <p className="mt-1 text-xs text-gray-500">
                                {t('voiceRoom.speakerHint')}
                              </p>
                            </div>
                          </div>
                        )}
                        {settingsTab === 'video' && (
                          <div className="space-y-5">
                            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                              {t('voiceRoom.videoBetaBanner')}
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">{t('voiceRoom.camLabel')}</label>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                <select
                                  value={selectedCamId}
                                  onChange={(e) => applyCameraDevice(e.target.value)}
                                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                                >
                                  {videoInputs.length === 0 ? (
                                    <option value="">{t('common.loadingEllipsis')}</option>
                                  ) : (
                                    videoInputs.map((d) => (
                                      <option key={d.deviceId || d.label} value={d.deviceId}>
                                        {d.label || t('voiceRoom.camFallback', { suffix: d.deviceId?.slice(-6) || '' })}
                                      </option>
                                    ))
                                  )}
                                </select>
                                <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-black">
                                  {hasLocalVideoTrack && !isCameraOff ? (
                                    <video
                                      autoPlay
                                      playsInline
                                      muted
                                      className="h-full w-full object-cover"
                                      ref={(node) => {
                                        if (!node) return;
                                        const s = mediasoupRef.current.localStream;
                                        if (s && node.srcObject !== s) {
                                          node.srcObject = s;
                                          node.play?.().catch(() => {});
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-gray-500">
                                      {t('voiceRoom.noVideoPreview')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">
                                {t('voiceRoom.sendResLabel')}
                              </label>
                              <select
                                value={sendResolution}
                                onChange={(e) => applySendResolutionPref(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                              >
                                <option value="auto">{t('voiceRoom.resAuto')}</option>
                                <option value="720">{t('voiceRoom.res720')}</option>
                                <option value="360">{t('voiceRoom.res360')}</option>
                                <option value="180">{t('voiceRoom.res180')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">
                                {t('voiceRoom.recvResLabel')}
                              </label>
                              <select
                                value={recvResolution}
                                onChange={(e) => setRecvResolution(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                              >
                                <option value="auto">{t('voiceRoom.resAuto')}</option>
                                <option value="720">720p</option>
                                <option value="360">360p</option>
                                <option value="180">180p</option>
                              </select>
                              <p className="mt-1 text-xs text-gray-500">
                                {t('voiceRoom.recvQualityHint')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}
          </div>
        )}
      </div>
    </div>
  );
}

export default VoiceRoomPage;
