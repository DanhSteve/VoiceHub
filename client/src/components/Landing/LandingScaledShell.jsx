import { useTheme } from '../../context/ThemeContext';

/** Tỉ lệ thu nhỏ giao diện rộng (dashboard, chat) trong khung preview landing */
export const LANDING_PREVIEW_SCALE = 0.48;

export function LandingScaledShell({ children }) {
  const { isDarkMode } = useTheme();
  const s = LANDING_PREVIEW_SCALE;
  const inv = 100 / s;
  return (
    <div
      className={`voicehub-landing-embed relative w-full overflow-hidden rounded-2xl border ${
        isDarkMode
          ? 'voicehub-landing-embed--dark border-cyan-500/25 bg-[#050810]'
          : 'border-slate-200 bg-slate-100'
      }`}
      style={{ height: 'min(28rem, 55vh)', maxHeight: '520px' }}
    >
      <div
        className="pointer-events-auto overflow-auto"
        style={{
          width: `${inv}%`,
          height: `${inv}%`,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
