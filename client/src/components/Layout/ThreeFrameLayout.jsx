import { useTheme } from '../../context/ThemeContext';
import { appShellBg, threeFrameRightPanel } from '../../theme/shellTheme';
import NavigationSidebar from './NavigationSidebar';
import ShellWaveBackdrop from './ShellWaveBackdrop';

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
            className={`relative z-[1] flex h-full shrink-0 flex-col overflow-hidden ${rightWidth} ${rightPanel}`}
          >
            <div className="scrollbar-overlay flex-1 min-h-0 overflow-x-visible overflow-y-auto">{right}</div>
          </div>
        ))}
    </div>
  );
};

export default ThreeFrameLayout;
