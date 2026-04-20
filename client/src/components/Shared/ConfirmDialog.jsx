import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';

const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  /** z cao hơn menu ngữ cảnh / portal (vd. danh sách thành viên ~9998) */
  layerClassName = 'z-[10050]',
}) => {
  const { isDarkMode } = useTheme();

  if (!isOpen || typeof document === 'undefined') return null;

  const handleConfirm = () => {
    const ret = onConfirm?.();
    Promise.resolve(ret).finally(() => {
      onClose();
    });
  };

  const shell = isDarkMode
    ? 'border border-amber-500/35 bg-slate-900/95 shadow-2xl shadow-amber-900/20'
    : 'border border-amber-400/40 bg-white shadow-2xl shadow-slate-900/10';
  const titleCls = isDarkMode ? 'text-white' : 'text-slate-900';
  const bodyCls = isDarkMode ? 'text-slate-300' : 'text-slate-600';
  const cancelBtn = isDarkMode
    ? 'glass border border-white/10 bg-white/[0.06] px-4 py-3 font-semibold text-slate-100 hover:bg-white/10'
    : 'border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm hover:bg-slate-50';

  return createPortal(
    <div
      className={`fixed inset-0 ${layerClassName} flex items-center justify-center p-4 animate-fadeIn`}
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" aria-hidden />
      <div
        className={`relative rounded-2xl max-w-md w-full animate-scaleIn backdrop-blur-md ${shell}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="p-6">
          <h3 id="confirm-dialog-title" className={`text-xl font-bold mb-3 ${titleCls}`}>
            {title}
          </h3>
          <p className={`mb-6 text-sm leading-relaxed ${bodyCls}`}>{message}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={`flex-1 rounded-xl transition-all ${cancelBtn}`}>
              {cancelText}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-600 to-yellow-600 px-4 py-3 font-semibold text-[#0f1218] shadow-md shadow-amber-900/25 transition-all hover:from-amber-500 hover:to-yellow-500"
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmDialog;
