import { useTheme } from '../../context/ThemeContext';

const Modal = ({ isOpen, onClose, title, children, size = "md", layerClassName = "z-[200]" }) => {
  const { isDarkMode } = useTheme();
  if (!isOpen) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
    full: "max-w-[95vw]"
  };

  const overlay = isDarkMode ? 'bg-black/80' : 'bg-slate-900/45';
  const panelBorder = isDarkMode ? 'border border-white/20' : 'border border-slate-200 shadow-xl';
  const headerBar = isDarkMode ? 'border-b border-white/10' : 'border-b border-slate-200';
  const closeBtn = isDarkMode
    ? 'text-white/90 hover:bg-white/10 hover:text-white'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900';

  return (
    <div className={`fixed inset-0 ${layerClassName} flex items-center justify-center p-4 animate-fadeIn`} onClick={onClose}>
      <div className={`absolute inset-0 ${overlay} backdrop-blur-sm`} />
      <div
        className={`relative glass-strong rounded-2xl ${sizes[size]} w-full max-h-[90vh] overflow-hidden animate-scaleIn ${panelBorder}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between p-6 ${headerBar}`}>
          <h2 className="text-2xl font-bold text-gradient">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-2xl transition-all ${closeBtn}`}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="scrollbar-gradient max-h-[calc(90vh-140px)] overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
