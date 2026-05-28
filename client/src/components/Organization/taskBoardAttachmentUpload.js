import apiClient from '../../services/api/apiClient';

function guessMimeFromFileName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return '';
}

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
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload thất bại (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload: lỗi mạng'));
    xhr.send(file);
  });
}

/**
 * Upload file đính kèm thẻ (Firebase signed URL — cùng luồng chat org_room).
 * @returns {{ name: string, url: string, storagePath?: string, mimeType?: string }}
 */
export async function uploadTaskBoardAttachment(file, onProgress) {
  if (!file) throw new Error('Không có tệp');
  const resolvedMime = file.type || guessMimeFromFileName(file.name) || 'application/octet-stream';

  onProgress?.(5);
  const signedRes = await apiClient.post('/messages/storage/signed-upload', {
    fileName: file.name,
    mimeType: resolvedMime,
    size: file.size,
    retentionContext: 'org_room',
  });
  const payload = signedRes?.data ?? signedRes;
  const data = payload?.data ?? payload;
  if (!data?.uploadUrl || !data?.storagePath) {
    throw new Error(payload?.message || 'Không lấy được URL upload');
  }

  onProgress?.(15);
  await putFileWithProgress(data.uploadUrl, file, resolvedMime, (pct) => {
    onProgress?.(15 + Math.round((pct / 100) * 80));
  });
  onProgress?.(100);

  return {
    name: file.name,
    url: String(data.storagePath),
    storagePath: String(data.storagePath),
    mimeType: resolvedMime,
  };
}
