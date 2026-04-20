import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

const Dropdown = ({ trigger, children, align = 'left' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const { isDarkMode } = useTheme();

  const close = () => setIsOpen(false);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const panelClass = isDarkMode
    ? 'glass-strong rounded-xl border border-white/20 shadow-2xl'
    : 'rounded-xl border border-slate-200 bg-white shadow-xl';

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={`absolute top-full z-[9999] mt-2 min-w-[200px] animate-slideDown ${panelClass} ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
};

export default Dropdown;
