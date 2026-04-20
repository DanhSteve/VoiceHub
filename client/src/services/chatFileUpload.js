/**
 * Upload file/hình: signed URL từ server → PUT lên Firebase → POST /messages kèm fileMeta.
 * Hiển thị trong chat: `components/Chat/ChatFileAttachment.jsx` (thẻ file / ảnh, không render URL thô).
 */

/**
 * Một số trình duyệt/OS để trống `file.type`; map theo đuôi để server nhận MIME chuẩn (tránh chỉ octet-stream).
 * @param {string} name
 */
function guessMimeFromFileName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (n.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return '';
}

/**
 * PUT file lên signed URL với tiến trình (fetch không hỗ trợ upload progress).
 */
function putFileWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
      else reject(new Error(`Upload Storage thất bại (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload Storage: lỗi mạng'));
    xhr.send(file);
  });
}

/**
 * @param {import('axios').AxiosInstance} api
 * @param {File} file
 * @param {{ retentionContext: 'dm'|'org_room'|'meeting', receiverId?: string, roomId?: string, organizationId?: string }} options
 * @param {(percent: number) => void} [onProgress] — 0–100 (gồm lấy URL + upload + tạo tin)
 */
export async function uploadChatFileAndCreateMessage(api, file, options, onProgress) {
  const {
    retentionContext,
    receiverId,
    roomId,
    organizationId,
  } = options;

  const resolvedMime =
    file.type || guessMimeFromFileName(file.name) || 'application/octet-stream';

  onProgress?.(2);
  const signedRes = await api.post('/messages/storage/signed-upload', {
    fileName: file.name,
    mimeType: resolvedMime,
    size: file.size,
    retentionContext,
  });

  // api.js interceptor đã unwrap axios → signedRes = body JSON { success, data?, message? }
  const payload = signedRes?.data ?? signedRes;
  const data = payload?.data ?? payload;
  if (!data?.uploadUrl || !data?.storagePath) {
    throw new Error(signedRes?.message || payload?.message || 'Không lấy được signed URL');
  }

  onProgress?.(12);
  try {
    await putFileWithProgress(data.uploadUrl, file, resolvedMime, (uploadPct) => {
      onProgress?.(12 + Math.round((uploadPct / 100) * 73));
    });
  } catch (err) {
    const isNetwork =
      err?.name === 'TypeError' ||
      String(err?.message || '').toLowerCase().includes('failed to fetch') ||
      String(err?.message || '').toLowerCase().includes('lỗi mạng');
    if (isNetwork) {
      throw new Error(
        'Upload Storage: trình duyệt không gọi được URL (thường do CORS chưa cấu hình trên bucket Firebase/GCS). ' +
          'Chạy: gsutil cors set docs/firebase-storage-cors.json gs://<FIREBASE_STORAGE_BUCKET> — chi tiết trong docs/FIREBASE_STORAGE.md'
      );
    }
    throw err;
  }

  const isImage = (file.type || '').startsWith('image/');
  const messageType = isImage ? 'image' : 'file';

  const body = {
    content: file.name,
    messageType,
    fileMeta: {
      storagePath: data.storagePath,
      originalName: file.name,
      mimeType: resolvedMime,
      byteSize: file.size,
      retentionContext,
    },
  };
  if (receiverId) body.receiverId = receiverId;
  if (roomId) body.roomId = roomId;
  if (organizationId) body.organizationId = organizationId;

  onProgress?.(88);
  const msgRes = await api.post('/messages', body);
  onProgress?.(100);
  const msgPayload = msgRes?.data ?? msgRes;
  return msgPayload?.data ?? msgPayload;
}

