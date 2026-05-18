import BusinessCardMessageBody from './BusinessCardMessageBody';
import { ChatMessageTextContent } from '../../utils/renderChatMessageContent';

/**
 * Hiá»ƒn thá»‹ tin nháº¯n file/hÃ¬nh: tháº» tá»‡p thay vÃ¬ chuá»—i URL Firebase dÃ i.
 */

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return 'â€”';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** TÃªn file an toÃ n cho thuá»™c tÃ­nh download (Windows/macOS). */
export function safeDownloadFileName(name) {
  const s = String(name || 'download').trim() || 'download';
  return s.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 200);
}

export function guessNameFromUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.split('/').filter(Boolean);
    const last = path[path.length - 1] || 'file';
    let decoded = decodeURIComponent(last.replace(/\+/g, ' '));
    // Bá» prefix UUID (path dáº¡ng .../uuid_tÃªn_gá»‘c.ext)
    decoded = decoded.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ''
    );
    return decoded || 'file';
  } catch {
    return 'file';
  }
}

function guessNameFromStoragePath(storagePath) {
  const p = String(storagePath || '').trim();
  if (!p) return '';
  const parts = p.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  if (!last) return '';
  let out = last.replace(/\+/g, ' ');
  try {
    out = decodeURIComponent(out);
  } catch {
    /* keep original */
  }
  out = out.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');
  return out;
}

function decodeFileNameCandidate(raw) {
  let out = String(raw || '').trim();
  if (!out) return '';
  // Má»™t sá»‘ payload cÃ³ kiá»ƒu query-string: space lÃ  '+'
  out = out.replace(/\+/g, ' ');
  // Decode tá»‘i Ä‘a 2 láº§n Ä‘á»ƒ xá»­ lÃ½ trÆ°á»ng há»£p double-encoded.
  for (let i = 0; i < 2; i++) {
    if (!/%[0-9a-f]{2}/i.test(out)) break;
    try {
      out = decodeURIComponent(out);
    } catch {
      break;
    }
  }
  return out.trim();
}

function resolveDisplayFileName(fileMeta, url) {
  const fromMeta = decodeFileNameCandidate(fileMeta?.originalName);
  if (fromMeta) {
    return fromMeta;
  }

  const fromStoragePath = decodeFileNameCandidate(guessNameFromStoragePath(fileMeta?.storagePath));
  if (fromStoragePath) {
    return fromStoragePath;
  }

  return guessNameFromUrl(url);
}

function iconForFile(name, mime) {
  const m = String(mime || '').toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (m.startsWith('image/')) return 'ðŸ–¼ï¸';
  if (m.startsWith('video/')) return 'ðŸŽ¬';
  if (m.startsWith('audio/')) return 'ðŸŽµ';
  if (m.includes('pdf')) return 'ðŸ“•';
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) return 'ðŸ“¦';
  if (['php', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs'].includes(ext)) return 'ðŸ“„';
  return 'ðŸ“Ž';
}

async function fetchBlob(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(String(res.status));
  return res.blob();
}

export async function downloadToDisk(url, filename) {
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

export async function saveFileWithPicker(url, filename) {
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
 * Tháº» tá»‡p: tÃªn, dung lÆ°á»£ng, má»Ÿ / lÆ°u / táº£i.
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
            <span className="mx-1.5 text-[#4e5257]">Â·</span>
            <span className="text-emerald-400/90">Nháº¥n Ä‘á»ƒ má»Ÿ</span>
          </span>
        </span>
      </button>
      <div className="flex shrink-0 flex-col gap-1.5 border-l border-white/[0.08] pl-2">
        <button
          type="button"
          title="LÆ°u tá»‡p (chá»n thÆ° má»¥c náº¿u trÃ¬nh duyá»‡t há»— trá»£)"
          onClick={(e) => {
            e.stopPropagation();
            saveFileWithPicker(url, name);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-base text-white/90 transition hover:bg-white/[0.08]"
        >
          ðŸ“
        </button>
        <button
          type="button"
          title="Táº£i xuá»‘ng"
          onClick={(e) => {
            e.stopPropagation();
            downloadToDisk(url, name);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-base text-white/90 transition hover:bg-white/[0.08]"
        >
          â¬‡ï¸
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
 * Ná»™i dung bubble: text / áº£nh / file â€” khÃ´ng render URL thÃ´ cho file Ä‘Ã­nh kÃ¨m.
 */
export function ChatMessageAttachmentBody({ message, onImageClick }) {
  const content = message?.content;
  const fm = message?.fileMeta;
  const mt = message?.messageType || 'text';

  if (mt === 'business_card') {
    return <BusinessCardMessageBody message={message} />;
  }


  if (mt === 'image' && isHttpUrl(content)) {
    const alt = resolveDisplayFileName(fm, content) || 'HÃ¬nh áº£nh';
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            if (onImageClick) {
              onImageClick(content, message?._id || message?.id);
            } else {
              window.open(content, '_blank', 'noopener,noreferrer');
            }
          }}
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
            title="LÆ°u áº£nh"
            onClick={() =>
              saveFileWithPicker(
                content,
                resolveDisplayFileName(fm, content) || guessNameFromUrl(content) || 'image.jpg'
              )
            }
            className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-2 py-1 text-xs text-white/90 hover:bg-white/[0.1]"
          >
            ðŸ“ LÆ°u
          </button>
          <button
            type="button"
            title="Táº£i xuá»‘ng"
            onClick={() =>
              downloadToDisk(
                content,
                resolveDisplayFileName(fm, content) || guessNameFromUrl(content) || 'image.jpg'
              )
            }
            className="rounded-lg border border-white/[0.1] bg-white/[0.06] px-2 py-1 text-xs text-white/90 hover:bg-white/[0.1]"
          >
            â¬‡ï¸ Táº£i
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
    <ChatMessageTextContent text={content} className="text-inherit" />
  );
}
