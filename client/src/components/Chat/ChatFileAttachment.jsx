import friendService from '../../services/friendService';
import toast from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';
import ChatMessageText from './ChatMessageText';

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
  // Một số payload có kiểu query-string: space là '+'
  out = out.replace(/\+/g, ' ');
  // Decode tối đa 2 lần để xử lý trường hợp double-encoded.
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
export function ChatFileCard({ url, fileMeta, className = '', compact = false }) {
  const name = resolveDisplayFileName(fileMeta, url);
  const sizeLabel = formatFileSize(fileMeta?.byteSize);
  const mime = fileMeta?.mimeType || '';
  const icon = iconForFile(name, mime);

  const openFile = (e) => {
    e?.preventDefault?.();
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (compact) {
    return (
      <div
        className={`flex min-w-0 max-w-full flex-col gap-1.5 rounded-lg border border-white/[0.12] bg-[#141821] p-2 text-left ${className}`}
      >
        <button
          type="button"
          onClick={openFile}
          className="flex min-w-0 w-full items-center gap-2 text-left transition hover:opacity-95"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-600/80 to-indigo-700/90 text-base"
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-white">{name}</span>
            <span className="mt-0.5 block text-[10px] leading-tight text-[#8e9297]">
              {sizeLabel}
              <span className="mx-1 text-[#4e5257]">·</span>
              <span className="text-emerald-400/90">Nhấn để mở</span>
            </span>
          </span>
        </button>
        <div className="flex gap-1 border-t border-white/[0.08] pt-1.5">
          <button
            type="button"
            title="Lưu tệp"
            onClick={(e) => {
              e.stopPropagation();
              saveFileWithPicker(url, name);
            }}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.04] text-[10px] text-white/90 transition hover:bg-white/[0.08]"
          >
            📁 Lưu
          </button>
          <button
            type="button"
            title="Tải xuống"
            onClick={(e) => {
              e.stopPropagation();
              downloadToDisk(url, name);
            }}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-white/[0.1] bg-white/[0.04] text-[10px] text-white/90 transition hover:bg-white/[0.08]"
          >
            ⬇️ Tải
          </button>
        </div>
      </div>
    );
  }

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
 * @param {'org'|'friend'|null} mentionVariant — tô màu @mention
 */
export function ChatMessageAttachmentBody({
  message,
  compact = false,
  mentionVariant = null,
  mentionLabels = [],
}) {
  const { isDarkMode } = useTheme();
  const content = message?.content;
  const fm = message?.fileMeta;
  const mt = message?.messageType || 'text';

  if (mt === 'business_card') {
    let card = {};
    try {
      card = typeof content === 'string' ? JSON.parse(content) : content || {};
    } catch {
      card = { fullName: String(content || '') };
    }
    const targetUserId = String(card.userId || card.id || card.memberId || '').trim();
    const fullName = String(card.fullName || card.name || '—').trim() || '—';
    const phone = String(card.phone || '').trim() || '-';
    const email = String(card.email || '').trim() || '-';
    const goToFriendChat = () => {
      const target = targetUserId
        ? `?openDmUserId=${encodeURIComponent(targetUserId)}&composeText=${encodeURIComponent(`Xin chao ${fullName}`)}`
        : '';
      const inWorkspace = typeof window !== 'undefined' && /^\/w\//.test(window.location.pathname);
      const url = `/chat/friends${target}`;
      if (inWorkspace) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      window.location.assign(url);
    };
    return (
      <div
        className={`rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-3 ${compact ? 'min-w-0 max-w-full' : 'min-w-[220px]'}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-bold text-white">
            {String(fullName).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-cyan-100/70">Danh thiếp</div>
            <div className="truncate text-sm font-semibold text-white">Tên: {fullName}</div>
            <div className="truncate text-xs text-cyan-100/75">SĐT: {phone}</div>
            <div className="truncate text-xs text-cyan-100/75">Email: {email}</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={!targetUserId}
            onClick={async () => {
              if (!targetUserId) return;
              try {
                await friendService.sendRequest(targetUserId);
                toast.success('Da gui loi moi ket ban');
              } catch {
                toast.error('Khong the gui loi moi ket ban');
              }
            }}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
          >
            Kết bạn
          </button>
          <button
            type="button"
            onClick={goToFriendChat}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
          >
            Nhắn tin
          </button>
        </div>
      </div>
    );
  }

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
            className={`max-w-full rounded-xl object-contain ${compact ? 'max-h-36' : 'max-h-64'}`}
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
    return <ChatFileCard url={content.trim()} fileMeta={fm} compact={compact} />;
  }

  if (isStorageUrl(content) && fm && mt !== 'image') {
    return <ChatFileCard url={content.trim()} fileMeta={fm} compact={compact} />;
  }

  if (isStorageUrl(content) && !fm) {
    return <ChatFileCard url={content.trim()} fileMeta={null} compact={compact} />;
  }

  return (
    <ChatMessageText
      text={content}
      mentionVariant={mentionVariant}
      mentionLabels={mentionLabels}
      isDarkMode={isDarkMode}
      className="whitespace-pre-wrap break-words leading-relaxed text-inherit"
    />
  );
}
