/** Hiển thị tệp đính kèm — dùng chung chat bubble và sidebar. */

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function fileTypeBadge(name, mime) {
  const m = String(mime || '').toLowerCase();
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();

  if (m.includes('word') || ['doc', 'docx'].includes(ext)) {
    return { letter: 'W', bg: 'bg-[#2b579a]' };
  }
  if (m.includes('sheet') || m.includes('excel') || ['xls', 'xlsx', 'csv'].includes(ext)) {
    return { letter: 'X', bg: 'bg-[#217346]' };
  }
  if (m.includes('pdf') || ext === 'pdf') {
    return { letter: 'P', bg: 'bg-[#e5252a]' };
  }
  if (m.startsWith('image/')) {
    return { letter: '🖼', bg: 'bg-violet-600' };
  }
  if (m.startsWith('video/')) {
    return { letter: '▶', bg: 'bg-rose-600' };
  }
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) {
    return { letter: 'Z', bg: 'bg-amber-600' };
  }
  return { letter: (ext.slice(0, 1) || 'F').toUpperCase(), bg: 'bg-slate-500' };
}
