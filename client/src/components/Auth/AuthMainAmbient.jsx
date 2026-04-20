/**
 * Họa tiết nền khu vực form đăng nhập/đăng ký — nhẹ hơn cột trái, không cạnh tranh với thẻ form.
 */
function AuthMainAmbient({ isDark }) {
  const stroke = isDark ? 'text-cyan-400' : 'text-cyan-600';
  const waveOpacity = isDark ? 'opacity-[0.07]' : 'opacity-[0.11]';

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${stroke}`} aria-hidden>
      <svg
        className={`absolute -right-[20%] top-[8%] h-[min(45vh,380px)] w-[90%] max-w-3xl ${waveOpacity}`}
        viewBox="0 0 480 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0 180 C80 120 160 220 240 150 C320 80 400 200 480 130"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M0 210 C100 160 200 240 300 190 C380 150 440 220 480 170"
          stroke="currentColor"
          strokeWidth="0.85"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
      <div
        className={`absolute -right-1/4 bottom-0 h-[min(50vh,400px)] w-[min(90vw,520px)] rounded-full blur-3xl ${
          isDark ? 'bg-cyan-500/[0.04]' : 'bg-cyan-400/[0.12]'
        }`}
      />
      <div
        className={`absolute left-1/4 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full blur-3xl ${
          isDark ? 'bg-indigo-500/[0.035]' : 'bg-sky-300/[0.15]'
        }`}
      />
    </div>
  );
}

export default AuthMainAmbient;
