/**
 * Hiển thị tin nhắn file/hình: thẻ tệp thay vì chuỗi URL Firebase dài.
 */

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Tên file an toàn cho thuộc tính download (Windows/macOS). */
export function safeDownloadFileName(name) {
  const s = String(name || 'download').trim() || 'download';
  return s.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 200);
}

function guessNameFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').filter(Boolean);
    const last = path[path.length - 1] || 'file';
    let decoded = decodeURIComponent(last.replace(/\+/g, ' '));
    // Bỏ prefix UUID (path dạng .../uuid_tên_gốc.ext)
    decoded = decoded.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ''
    );
    return decoded || 'file';
  } catch {
    return 'file';
  }
}

function resolveDisplayFileName(fileMeta, url) {
  let raw = fileMeta?.originalName;
  if (raw && String(raw).trim()) {
    try {
      if (/%[0-9a-f]{2}/i.test(raw)) {
        raw = decodeURIComponent(String(raw));
      }
    } catch {
      /* giữ nguyên */
    }
    return String(raw).trim();
  }
  return guessNameFromUrl(url);
}

function iconForFile(name, mime) {
  const m = String(mime || '').toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (m.startsWith('image/')) return '🖼️';
  if (m.startsWith('video/')) return '🎬';
  if (m.startsWith('audio/')) return '🎵';
  if (m.includes('pdf')) return '📕';
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) return '📦';
  if (['php', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs'].includes(ext)) return '📄';
  return '📎';
}

async function fetchBlob(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

async function downloadToDisk(url, filename) {
  try {
    const blob = await fetchBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeDownloadFileName(filename);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

async function saveFileWithPicker(url, filename) {
  const name = safeDownloadFileName(filename || 'file');
  try {
    const blob = await fetchBlob(url);
    if (typeof window !== 'undefined' && window.showSaveFilePicker) {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }
    await downloadToDisk(url, name);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    await downloadToDisk(url, name);
  }
}

/**
 * Thẻ tệp: tên, dung lượng, mở / lưu / tải.
 */
export function ChatFileCard({ url, fileMeta, className = '' }) {
  const name = resolveDisplayFileName(fileMeta, url);
  const sizeLabel = formatFileSize(fileMeta?.byteSize);
  const mime = fileMeta?.mimeType || '';
  const icon = iconForFile(name, mime);

  const openFile = (e) => {
    e?.preventDefault?.();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className={`flex min-w-0 items-stretch gap-3 rounded-xl border border-white/[0.12] bg-[#141821] p-3 text-left ${className}`}
    >
      <button
        type="button"
        onClick={openFile}
        className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-95"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-600/80 to-indigo-700/90 text-xl"
          aria-hidden
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-white">{name}</span>
          <span className="mt-0.5 block text-xs text-[#8e9297]">
            {sizeLabel}
            <span className="mx-1.5 text-[#4e5257]">·</span>
            <span className="text-emerald-400/90">Nhấn để mở</span>
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col gap-1.5 border-l border-white/[0.08] pl-2">
        <button
          type="button"
          title="Lưu tệp (chọn thư mục nếu trình duyệt hỗ trợ)"
          onClick={(e) => {
            e.stopPropagation();
            saveFileWithPicker(url, name);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-base text-white/90 transition hover:bg-white/[0.08]"
        >
          📁
        </button>
        <button
          type="button"
          title="Tải xuống"
          onClick={(e) => {
            e.stopPropagation();
            downloadToDisk(url, name);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-base text-white/90 transition hover:bg-white/[0.08]"
        >
          ⬇️
        </button>
      </div>
    </div>
  );
}

function isHttpUrl(s) {
  return typeof s === 'string' && /^https?:\/\//i.test(s.trim());
}

function isStorageUrl(s) {
  if (!isHttpUrl(s)) return false;
  return (
    /storage\.googleapis\.com/i.test(s) ||
    /firebasestorage\.app/i.test(s) ||
    /firebase/i.test(s)
  );
}

/**
 * Nội dung bubble: text / ảnh / file — không render URL thô cho file đính kèm.
 */
export function ChatMessageAttachmentBody({ message }) {
  const content = message?.content;
  const fm = message?.fileMeta;
  const mt = message?.messageType || 'text';

  if (mt === 'image' && isHttpUrl(content)) {
    const alt = resolveDisplayFileName(fm, content) || 'Hình ảnh';
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => window.open(content, '_blank', 'noopener,noreferrer')}
          className="block overflow-hidden rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
        >
          <img
            src={content}
            alt={alt}
            className="max-h-64 max-w-full rounded-xl object-contain"
          />
        </button>
        <div className="flex justify-end gap-1">
          <button
            type="button"
            title="Lưu ảnh"
            onClick={() =>
              saveFileWithPicker(
                content,
                resolveDisplayFileName(fm, content) || guessNameFromUrl(content) || 'image.jpg'
              )
            }
            className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-2 py-1 text-xs text-white/90 hover:bg-white/[0.1]"
          >
            📁 Lưu
          </button>
          <button
            type="button"
            title="Tải xuống"
            onClick={() =>
              downloadToDisk(
                content,
                resolveDisplayFileName(fm, content) || guessNameFromUrl(content) || 'image.jpg'
              )
            }
            className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-2 py-1 text-xs text-white/90 hover:bg-white/[0.1]"
          >
            ⬇️ Tải
          </button>
        </div>
      </div>
    );
  }

  if (mt === 'file' && isHttpUrl(content)) {
    return <ChatFileCard url={content.trim()} fileMeta={fm} />;
  }

  if (isStorageUrl(content) && fm && mt !== 'image') {
    return <ChatFileCard url={content.trim()} fileMeta={fm} />;
  }

  if (isStorageUrl(content) && !fm) {
    return <ChatFileCard url={content.trim()} fileMeta={null} />;
  }

  return (
    <div className="whitespace-pre-wrap break-words leading-relaxed text-inherit">{content}</div>
  );
}
