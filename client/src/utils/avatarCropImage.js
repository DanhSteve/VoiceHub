const VIEWPORT = 280;
const OUTPUT_SIZE = 512;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot load image'));
    img.src = src;
  });
}

export function getBaseCoverScale(img) {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  return Math.max(VIEWPORT / w, VIEWPORT / h);
}

/** Giới hạn pan để vùng crop luôn được phủ bởi ảnh. */
export function clampAvatarPan(img, zoom, panX, panY) {
  const base = getBaseCoverScale(img);
  const scale = base * zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const minX = VIEWPORT - drawW;
  const minY = VIEWPORT - drawH;
  return {
    x: Math.min(0, Math.max(minX, panX)),
    y: Math.min(0, Math.max(minY, panY)),
  };
}

export async function cropAvatarToBlob(imageSrc, { zoom = 1, panX = 0, panY = 0 } = {}) {
  const img = await loadImage(imageSrc);
  const base = getBaseCoverScale(img);
  const scale = base * zoom;
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const { x, y } = clampAvatarPan(img, zoom, panX, panY);
  const left = VIEWPORT / 2 - drawW / 2 + x;
  const top = VIEWPORT / 2 - drawH / 2 + y;

  const sx = (0 - left) / scale;
  const sy = (0 - top) / scale;
  const sSize = VIEWPORT / scale;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Export failed'));
      },
      'image/jpeg',
      0.92
    );
  });
}

export const AVATAR_CROP_VIEWPORT = VIEWPORT;
