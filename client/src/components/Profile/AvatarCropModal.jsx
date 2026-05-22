import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import {
  AVATAR_CROP_VIEWPORT,
  clampAvatarPan,
  cropAvatarToBlob,
  getBaseCoverScale,
} from '../../utils/avatarCropImage';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export default function AvatarCropModal({
  isOpen,
  imageSrc,
  isDarkMode = true,
  title,
  resetLabel,
  cancelLabel,
  applyLabel,
  hint = '',
  applying = false,
  onClose,
  onApply,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imgMeta, setImgMeta] = useState(null);
  const draggingRef = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const imgMetaRef = useRef(imgMeta);

  panRef.current = pan;
  zoomRef.current = zoom;
  imgMetaRef.current = imgMeta;

  useEffect(() => {
    if (!isOpen || !imageSrc) return undefined;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setImgMeta({ w: img.naturalWidth, h: img.naturalHeight });
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    img.src = imageSrc;
    return () => {
      cancelled = true;
    };
  }, [isOpen, imageSrc]);

  const applyPan = useCallback(
    (nextX, nextY) => {
      if (!imgMeta) return;
      const fakeImg = { naturalWidth: imgMeta.w, naturalHeight: imgMeta.h };
      setPan(clampAvatarPan(fakeImg, zoom, nextX, nextY));
    },
    [imgMeta, zoom]
  );

  const handlePointerDown = (e) => {
    e.preventDefault();
    draggingRef.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY, panX: panRef.current.x, panY: panRef.current.y };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      const meta = imgMetaRef.current;
      if (!meta) return;
      const fakeImg = { naturalWidth: meta.w, naturalHeight: meta.h };
      setPan(clampAvatarPan(fakeImg, zoomRef.current, dragStart.current.panX + dx, dragStart.current.panY + dy));
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleApply = async () => {
    if (!imageSrc || applying) return;
    const blob = await cropAvatarToBlob(imageSrc, { zoom, panX: pan.x, panY: pan.y });
    await onApply(blob);
  };

  if (!isOpen || !imageSrc) return null;

  const baseScale = imgMeta ? getBaseCoverScale({ naturalWidth: imgMeta.w, naturalHeight: imgMeta.h }) : 1;
  const scale = baseScale * zoom;
  const drawW = (imgMeta?.w || AVATAR_CROP_VIEWPORT) * scale;
  const drawH = (imgMeta?.h || AVATAR_CROP_VIEWPORT) * scale;
  const imgLeft = AVATAR_CROP_VIEWPORT / 2 - drawW / 2 + pan.x;
  const imgTop = AVATAR_CROP_VIEWPORT / 2 - drawH / 2 + pan.y;

  const shell = isDarkMode
    ? 'w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1e1f28] shadow-2xl'
    : 'w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const heading = isDarkMode ? 'text-white' : 'text-slate-900';
  const muted = isDarkMode ? 'text-gray-400' : 'text-slate-500';

  const tree = (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label={cancelLabel} onClick={onClose} />
      <div className={`relative z-[100001] ${shell}`}>
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className={`text-base font-bold ${heading}`}>{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-1.5 ${isDarkMode ? 'text-gray-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            aria-label={cancelLabel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center px-4 py-5">
          <div
            className="relative touch-none select-none overflow-hidden rounded-full bg-zinc-900 shadow-inner ring-2 ring-white/15"
            style={{ width: AVATAR_CROP_VIEWPORT, height: AVATAR_CROP_VIEWPORT }}
            onPointerDown={handlePointerDown}
          >
            <img
              src={imageSrc}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: drawW,
                height: drawH,
                left: imgLeft,
                top: imgTop,
              }}
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/20"
              aria-hidden
            />
          </div>
          {hint ? <p className={`mt-2 text-center text-xs ${muted}`}>{hint}</p> : null}

          <div className="mt-4 flex w-full max-w-xs items-center gap-3">
            <button
              type="button"
              className={`shrink-0 ${muted} hover:text-white`}
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))}
              aria-label="Thu nhỏ"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.02}
              value={zoom}
              onChange={(e) => {
                const next = Number(e.target.value);
                setZoom(next);
                applyPan(pan.x, pan.y);
              }}
              className="h-1.5 flex-1 cursor-pointer accent-violet-500"
            />
            <button
              type="button"
              className={`shrink-0 ${muted} hover:text-white`}
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))}
              aria-label="Phóng to"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
            <ImageIcon className={`h-5 w-5 shrink-0 ${muted}`} aria-hidden />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={handleReset}
            className={`inline-flex items-center gap-1.5 text-sm font-medium ${isDarkMode ? 'text-gray-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <RotateCcw className="h-4 w-4" />
            {resetLabel}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                isDarkMode ? 'bg-white/10 text-gray-200 hover:bg-white/15' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || !imgMeta}
              className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50"
            >
              {applying ? '…' : applyLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(tree, document.body);
}
