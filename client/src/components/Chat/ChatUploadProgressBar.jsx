/**
 * Thanh tiến trình khi đang upload file/ảnh lên Storage (signed URL + POST tin).
 */
export default function ChatUploadProgressBar({ percent, label = 'Đang tải lên…' }) {
  if (percent == null) return null;
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  return (
    <div className="border-b border-white/[0.08] bg-[#0f1218] px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[11px] text-[#8e9297]">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(p)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width] duration-150 ease-out"
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  );
}
