/** Tính lớp lưới & danh sách ô hiển thị theo chế độ xem phòng voice (Meet-style). */

export const LAYOUT_MODES = ['auto', 'tiled', 'spotlight', 'sidebar'];

export function buildLayoutTiles({
  participants,
  hideNoVideo,
  maxTiles,
  isCameraOff,
  hasLocalVideo,
}) {
  const tiles = [];
  const hideLocal = hideNoVideo && isCameraOff && !hasLocalVideo;
  if (!hideLocal) {
    tiles.push({ kind: 'local', key: 'local' });
  }
  participants.forEach((p) => {
    const hasVid = Boolean(p.stream?.getVideoTracks?.()?.length);
    if (hideNoVideo && !hasVid) return;
    tiles.push({ kind: 'remote', key: p.socketId, participant: p });
  });
  const cap = Math.max(1, Math.min(16, maxTiles || 6));
  return tiles.slice(0, cap);
}

export function gridWrapperClass(layoutMode) {
  switch (layoutMode) {
    case 'tiled':
      return 'grid grid-cols-2 gap-3 sm:grid-cols-3';
    case 'spotlight':
      return 'grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:grid-rows-2 md:auto-rows-fr [&>*:first-child]:md:col-span-2 [&>*:first-child]:md:row-span-2';
    case 'sidebar':
      return 'flex flex-col gap-3 lg:flex-row lg:items-stretch';
    default:
      return 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';
  }
}

export function tileItemClass(layoutMode, index) {
  if (layoutMode !== 'sidebar') return '';
  if (index === 0) return 'min-h-[220px] flex-[3] min-w-0 lg:min-h-[260px]';
  return 'lg:w-44 lg:shrink-0';
}
