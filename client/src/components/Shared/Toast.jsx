import { useTheme } from '../../context/ThemeContext';

/**
 * Thông báo nổi góc màn hình (dùng chung với showToast + useState trong trang).
 */
function Toast({ message, type = 'success', onClose }) {
  const { isDarkMode } = useTheme();
  const isError = type === 'error' || type === 'fail';

  const dark =
    isError
      ? 'border-red-500/40 bg-red-950/95 text-red-50'
      : type === 'info'
        ? 'border-sky-500/40 bg-sky-950/95 text-sky-50'
        : 'border-emerald-500/40 bg-emerald-950/95 text-emerald-50';

  const light =
    isError
      ? 'border-red-200 bg-white text-red-900 shadow-red-100/50'
      : type === 'info'
        ? 'border-sky-200 bg-white text-sky-900 shadow-sky-100/50'
        : 'border-emerald-200 bg-white text-emerald-900 shadow-emerald-100/50';

  return (
    <div
      className={`fixed bottom-6 right-6 z-[300] flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${
        isDarkMode ? dark : light
      }`}
      role="status"
    >
      <p className="flex-1 text-sm font-medium">{message}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-1 opacity-80 transition hover:opacity-100"
          aria-label="Đóng"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default Toast;
