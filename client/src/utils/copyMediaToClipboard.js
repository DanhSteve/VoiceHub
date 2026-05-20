/**
 * Sao chép ảnh vào clipboard; fallback sang URL nếu CORS/trình duyệt chặn.
 * @returns {'image'|'url'|false}
 */
export async function copyImageToClipboard(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return false;

  try {
    const res = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('fetch failed');
    const blob = await res.blob();
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/png';
    const imageBlob = blob.type === type ? blob : new Blob([blob], { type });
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ [type]: imageBlob })]);
      return 'image';
    }
  } catch {
    /* thử canvas */
  }

  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imageUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
    });
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'image';
    }
  } catch {
    /* fallback URL */
  }

  try {
    await navigator.clipboard.writeText(imageUrl);
    return 'url';
  } catch {
    return false;
  }
}
