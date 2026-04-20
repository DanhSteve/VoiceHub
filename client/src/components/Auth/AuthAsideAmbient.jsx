/**
 * Họa tiết nền cột trái auth — gợn sóng âm / “spectrum” nhẹ, chủ đề voice & nền tảng (SVG, không ảnh ngoài).
 */
function AuthAsideAmbient({ isDark }) {
  const layer = isDark ? 'text-cyan-400' : 'text-white';
  const waveOpacity = isDark ? 'opacity-[0.22]' : 'opacity-[0.18]';
  const barOpacity = isDark ? 'opacity-[0.2]' : 'opacity-[0.14]';

  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${layer}`}
      aria-hidden
    >
      {/* Sóng ngang — gợi luồng thoại / âm thanh */}
      <svg
        className={`absolute -right-8 bottom-[-5%] h-[min(62vh,520px)] w-[115%] max-w-none ${waveOpacity}`}
        viewBox="0 0 640 360"
        preserveAspectRatio="xMaxYMax meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          d="M0 200 C100 140, 200 260, 320 180 C440 100, 520 220, 640 150"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.55"
          d="M0 240 C140 180, 260 280, 380 210 C480 150, 560 250, 640 190"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="0.85"
          strokeLinecap="round"
          opacity="0.35"
          d="M0 280 C160 230, 300 300, 440 250 C520 210, 580 270, 640 230"
        />
      </svg>

      {/* Thanh tần số trừu tượng — gợi voice / realtime */}
      <svg
        className={`absolute h-28 w-40 sm:h-32 sm:w-48 ${barOpacity} ${isDark ? 'bottom-12 right-6' : 'bottom-10 right-4'}`}
        viewBox="0 0 120 72"
        xmlns="http://www.w3.org/2000/svg"
      >
        {[12, 22, 16, 28, 18, 24, 14].map((h, i) => (
          <rect
            key={i}
            x={8 + i * 15}
            y={64 - h}
            width="5"
            height={h}
            rx="2"
            fill="currentColor"
            opacity={0.35 + i * 0.06}
          />
        ))}
      </svg>

      {/* Vòng gợn sóng — chiều sâu, không che chữ */}
      <div
        className={`absolute -left-1/4 top-1/3 h-[min(70vw,420px)] w-[min(70vw,420px)] rounded-full blur-3xl ${
          isDark ? 'bg-cyan-500/[0.07]' : 'bg-white/[0.14]'
        }`}
      />
      <div
        className={`absolute -right-1/3 bottom-1/4 h-[min(55vw,340px)] w-[min(55vw,340px)] rounded-full blur-3xl ${
          isDark ? 'bg-indigo-500/[0.06]' : 'bg-sky-200/[0.18]'
        }`}
      />
    </div>
  );
}

export default AuthAsideAmbient;
