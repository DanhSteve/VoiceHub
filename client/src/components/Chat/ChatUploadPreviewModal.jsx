import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Xác nhận gửi file/ảnh trước khi upload (DM / org).
 */
export default function ChatUploadPreviewModal({
  open,
  file,
  previewUrl,
  isDarkMode,
  onCancel,
  onConfirm,
  confirmLabel = 'Gửi',
  cancelLabel = 'Huỷ',
  title = 'Xem trước',
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open || !file) return null;

  const panel = isDarkMode
    ? 'border-white/10 bg-[#12151f] text-white'
    : 'border-slate-200 bg-white text-slate-900';
  const muted = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[200] bg-black/50"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div
        className={`fixed left-1/2 top-1/2 z-[210] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-4 shadow-2xl ${panel}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{title}</h3>
          <button type="button" onClick={onCancel} className={`rounded-lg p-1.5 ${muted} hover:opacity-80`}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-3 max-h-[50vh] overflow-auto rounded-xl border border-white/10 bg-black/20 p-2">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt={file.name}
              className="mx-auto max-h-[40vh] max-w-full rounded-lg object-contain"
            />
          ) : (
            <div className={`flex flex-col items-center justify-center gap-2 py-8 ${muted}`}>
              <span className="text-4xl">📎</span>
              <p className="max-w-full truncate px-2 text-center text-sm font-medium text-inherit">
                {file.name}
              </p>
              <p className="text-xs">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              isDarkMode ? 'bg-white/10 hover:bg-white/15' : 'bg-slate-100 hover:bg-slate-200'
            }`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
