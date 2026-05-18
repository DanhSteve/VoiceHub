import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg, threeFrameRightPanel } from '../../theme/shellTheme';
import NavigationSidebar from './NavigationSidebar';
import ShellWaveBackdrop from './ShellWaveBackdrop';

function parseRightWidthToPx(rightWidth) {
  const s = String(rightWidth || '').trim();
  const m = s.match(/w-\[(\d+)px\]/);
  if (m) return Number(m[1]);
  // Tailwind mặc định: w-80 = 20rem = 320px. Giữ vài mapping phổ biến.
  if (s === 'w-96') return 384;
  if (s === 'w-80') return 320;
  if (s === 'w-72') return 288;
  if (s === 'w-64') return 256;
  return 320;
}

/**
 * Bố cục chuẩn 3 khung (dùng làm layout chính):
 * - Khung 1 (trái): Sidebar nav chỉ icon, cùng chiều cao với viewport.
 * - Khung 2 (giữa): Nội dung chính (Trung tâm điều khiển, v.v.), thanh trượt riêng khi nội dung dài.
 * - Khung 3 (phải, tùy chọn): Panel phụ (Trạng thái nhóm, sự kiện, v.v.), thanh trượt riêng.
 *
 * @param {string} [rightFrameClassName] — Nếu set, thay thế toàn bộ class khung phải (vd. panel hover tự quản lý).
 */
const ThreeFrameLayout = ({
  landingDemo = false,
  left,
  center,
  right = null,
  rightWidth = 'w-80',
  rightFrameClassName = null,
}) => {
  const { isDarkMode } = useTheme();
  const shell = appShellBg(isDarkMode);
  const rightPanel = threeFrameRightPanel(isDarkMode);
  const navLeft = left ?? <NavigationSidebar landingDemo={landingDemo} />;
  const baseRightW = useMemo(() => parseRightWidthToPx(rightWidth), [rightWidth]);
  const [rightW, setRightW] = useState(baseRightW);
  const resizingRef = useRef(null);

  useEffect(() => {
    setRightW(baseRightW);
  }, [baseRightW]);

  useEffect(() => {
    const onMove = (e) => {
      const st = resizingRef.current;
      if (!st || !st.active) return;
      const x = e?.clientX ?? 0;
      const dx = st.startX - x; // kéo sang trái => tăng width
      const next = Math.round(st.startW + dx);
      const clamped = Math.max(st.minW, Math.min(st.maxW, next));
      setRightW(clamped);
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

  return (
    <div className={`relative flex h-screen overflow-hidden ${shell}`}>
      <ShellWaveBackdrop />
      <div className="relative z-[1] h-full shrink-0">{navLeft}</div>

      <div className="relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="scrollbar-overlay flex-1 min-h-0 overflow-x-visible overflow-y-auto">{center}</div>
      </div>

      {right !== null &&
        (rightFrameClassName ? (
          <div className="relative z-[1]">{right}</div>
        ) : (
          <div
            className={`relative z-[1] flex h-full shrink-0 flex-col overflow-hidden ${rightPanel}`}
            style={{ width: rightW }}
          >
            <div
              className="absolute inset-y-0 left-0 z-20 w-2 cursor-col-resize"
              title="Kéo để nới panel (tối đa +20px)"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                resizingRef.current = {
                  active: true,
                  startX: e.clientX,
                  startW: rightW,
                  minW: baseRightW,
                  maxW: baseRightW + 20,
                };
                e.preventDefault();
              }}
            />
            <div className="scrollbar-overlay flex-1 min-h-0 overflow-x-visible overflow-y-auto">{right}</div>
          </div>
        ))}
    </div>
  );
};

export default ThreeFrameLayout;
