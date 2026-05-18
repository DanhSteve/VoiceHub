import { useEffect, useState, useRef, useCallback, cloneElement, Children, isValidElement } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import { useTheme } from '../../context/ThemeContext';
import { threeFrameRightPanel } from '../../theme/shellTheme';

/**
 * Panel thành viên tách khỏi sidebar tổ chức: mặc định thu (~40px) có nhãn "Danh sách thành viên",
 * hover mở rộng (w-80). Luôn nằm bên trái cột bubble tổ chức cố định.
 * Khi menu chuột phải (portal) đang mở, không thu panel theo mouseLeave để người dùng còn bấm được mục;
 * khi đóng menu mà chuột không còn trên panel thì thu lại. Khi panel thu, sidebar đóng menu.
 */
function OrganizationMemberPeekDock({ children }) {
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const dockRef = useRef(null);
  const BASE_W = 384;
  const [openW, setOpenW] = useState(BASE_W);
  const resizingRef = useRef(null);

  const handleMemberMenuClosed = useCallback(() => {
    requestAnimationFrame(() => {
      if (dockRef.current && !dockRef.current.matches(':hover')) {
        setOpen(false);
      }
    });
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const st = resizingRef.current;
      if (!st || !st.active) return;
      const x = e?.clientX ?? 0;
      const dx = x - st.startX; // kéo sang phải => tăng width
      const next = Math.round(st.startW + dx);
      const clamped = Math.max(st.minW, Math.min(st.maxW, next));
      setOpenW(clamped);
      e?.preventDefault?.();
    };
    const onUp = () => {
      const st = resizingRef.current;
      if (!st || !st.active) return;
      resizingRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const child = Children.only(children);
  const injected =
    isValidElement(child) &&
    cloneElement(child, {
      memberDockOpen: open,
      onMemberMenuOpenChange: setMemberMenuOpen,
      onMemberMenuClosed: handleMemberMenuClosed,
    });

  return (
    <div
      ref={dockRef}
      className={`relative h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out ${threeFrameRightPanel(isDarkMode)} ${
        open ? 'w-96' : 'w-10'
      }`}
      style={open ? { width: openW } : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!memberMenuOpen) setOpen(false);
      }}
      title={open ? undefined : t('organizations.memberDockTitle')}
    >
      <div className="flex h-full flex-row" style={{ width: openW, minWidth: BASE_W }}>
        {open ? (
          <div
            className="absolute inset-y-0 left-0 z-30 w-2 cursor-col-resize"
            title="Kéo để nới panel (tối đa +20px)"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              resizingRef.current = {
                active: true,
                startX: e.clientX,
                startW: openW,
                minW: BASE_W,
                maxW: BASE_W + 20,
              };
              e.preventDefault();
            }}
          />
        ) : null}
        <div
          className={`flex w-10 shrink-0 flex-col items-center border-r px-1 py-3 ${
            isDarkMode
              ? 'border-white/10 bg-violet-950/30'
              : 'border-sky-200/80 bg-violet-100/70'
          }`}
        >
          <span
            className={`select-none text-center text-[9px] font-bold uppercase leading-tight tracking-wide [writing-mode:vertical-rl] rotate-180 ${
              isDarkMode ? 'text-gray-200' : 'text-slate-600'
            }`}
            aria-hidden
          >
            {t('organizations.memberDockLabel')}
          </span>
          <span className="mt-2 text-sm text-cyan-400/90" aria-hidden title={t('organizations.memberDockExpand')}>
            ⟨
          </span>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{injected || children}</div>
      </div>
    </div>
  );
}

export default OrganizationMemberPeekDock;
