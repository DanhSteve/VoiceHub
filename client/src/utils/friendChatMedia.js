const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

export function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const raw = text.match(URL_REGEX);
  return raw ? [...new Set(raw)] : [];
}

function isStorageAttachmentUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /storage\.googleapis\.com|firebasestorage\.app|googleapis\.com\/storage/i.test(url);
}

export function fileDisplayNameFromMessage(message, fileFallback) {
  const fm = message?.fileMeta;
  const original = typeof fm?.originalName === 'string' ? fm.originalName.trim() : '';
  if (original) return original;

  const content = String(message?.content ?? '');
  if (!/^https?:\/\//i.test(content)) return fileFallback;
  try {
    const pathOnly = content.split('?')[0];
    const u = new URL(pathOnly);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    const decoded = decodeURIComponent(last.replace(/\+/g, ' '));
    const stripped = decoded.replace(/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}_/i, '');
    return stripped || decoded || fileFallback;
  } catch {
    return fileFallback;
  }
}

function isVideoMessage(m) {
  const mt = String(m?.messageType || '').toLowerCase();
  if (mt === 'image') return false;
  const mime = String(m?.fileMeta?.mimeType || '').toLowerCase();
  return mt === 'file' && mime.startsWith('video/');
}

function isImageMessage(m) {
  const mt = String(m?.messageType || '').toLowerCase();
  if (mt === 'image') return true;
  const mime = String(m?.fileMeta?.mimeType || '').toLowerCase();
  return mt === 'file' && mime.startsWith('image/');
}

/**
 * Gom ảnh / video / file / link từ tin DM — dùng chung sidebar + lightbox.
 */
export function buildFriendChatAttachments(messages, { fileFallback = 'Tệp đính kèm' } = {}) {
  const images = [];
  const videos = [];
  const files = [];
  const links = [];

  for (const m of messages || []) {
    if (!m) continue;
    const msgType = m.messageType || 'text';
    const content = String(m.content ?? '');
    const id = m._id || m.id;

    if (isImageMessage(m)) {
      const url = /^https?:\/\//i.test(content) ? content : null;
      if (url) images.push({ id, url, preview: url, at: m.createdAt, kind: 'image' });
    } else if (isVideoMessage(m)) {
      const url = /^https?:\/\//i.test(content) ? content : null;
      if (url) {
        videos.push({ id, url, preview: url, at: m.createdAt, kind: 'video' });
      }
    } else if (msgType === 'file') {
      const url = /^https?:\/\//i.test(content) ? content : null;
      const mime = String(m?.fileMeta?.mimeType || '').toLowerCase();
      if (url && mime.startsWith('image/')) {
        images.push({ id, url, preview: url, at: m.createdAt, kind: 'image' });
      } else {
        files.push({
          id,
          name: fileDisplayNameFromMessage(m, fileFallback),
          url,
          at: m.createdAt,
          fileMeta: m.fileMeta,
        });
      }
    }

    const urls = extractUrls(content);
    const contentPath = content.split('?')[0];
    for (const url of urls) {
      const urlPath = url.split('?')[0];
      if ((msgType === 'file' || msgType === 'image') && urlPath === contentPath) continue;
      if (msgType === 'file' && isStorageAttachmentUrl(url)) continue;
      links.push({
        id: `${id}-${url}`,
        url,
        title: url.length > 48 ? `${url.slice(0, 45)}…` : url,
        at: m.createdAt,
      });
    }
  }

  const byTime = (a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();

  const sortedImages = [...images].sort(byTime);
  const sortedVideos = [...videos].sort(byTime);

  return {
    images: sortedImages,
    videos: sortedVideos,
    files: [...files].sort(byTime),
    links: [...links].sort(byTime),
    /** Grid sidebar + lightbox: ảnh và video */
    mediaItems: [...sortedImages, ...sortedVideos],
    viewerItems: [...sortedImages, ...sortedVideos],
  };
}

export function findViewerIndex(viewerItems, messageId) {
  if (!messageId) return 0;
  const key = String(messageId);
  const idx = viewerItems.findIndex((it) => String(it.id) === key || String(it.id) === `vid:${key}`);
  return idx >= 0 ? idx : 0;
}
