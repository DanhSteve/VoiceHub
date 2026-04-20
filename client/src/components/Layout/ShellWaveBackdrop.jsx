import { useId } from 'react';

/**
 * Lớp nền gợn sóng + glow nhẹ — dùng chung app shell (dark/light hài hoà).
 * Đặt trong container `relative`; nội dung cần `relative z-[1]` so với lớp này.
 */
export default function ShellWaveBackdrop({ className = '' }) {
  const gradId = `swg-${useId().replace(/:/g, '')}`;

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className}`}
      aria-hidden
    >
      <div className="absolute -top-28 left-[18%] h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-sky-400/20 blur-3xl dark:bg-cyan-500/[0.11]" />
      <div className="absolute bottom-[-4rem] right-[-3rem] h-[18rem] w-[18rem] rounded-full bg-cyan-300/14 blur-3xl dark:bg-teal-600/[0.09]" />
      <div className="absolute bottom-1/3 left-[-10%] h-48 w-48 rounded-full bg-sky-300/12 blur-2xl dark:bg-cyan-400/[0.06]" />

      <svg
        className="absolute bottom-0 left-0 h-[min(52vh,480px)] w-full text-sky-600/[0.38] dark:text-cyan-400/[0.18]"
        viewBox="0 0 1440 360"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.12" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${gradId})`}
          className="text-sky-500/[0.14] dark:text-cyan-500/[0.09]"
          d="M0,360 L0,295 C200,272 400,318 600,295 S1000,275 1200,295 S1360,310 1440,298 L1440,360 Z"
        />
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.15">
          <path
            opacity="0.95"
            d="M0,268 C120,252 240,284 360,268 S600,244 720,268 S960,292 1080,268 S1260,252 1440,268"
          />
          <path
            opacity="0.7"
            d="M0,288 C160,308 320,268 480,288 S800,308 960,288 S1200,268 1440,288"
          />
          <path
            opacity="0.55"
            d="M0,308 C200,288 400,328 600,308 S1000,288 1200,308 S1320,322 1440,308"
          />
          <path
            opacity="0.4"
            d="M0,328 C240,312 480,348 720,328 S1080,308 1320,328 S1380,338 1440,332"
          />
        </g>
      </svg>

      <svg
        className="absolute top-[8%] left-0 h-[min(28vh,240px)] w-full text-sky-600/[0.28] dark:text-cyan-500/[0.12]"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
      >
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="0.9" opacity="0.88">
          <path d="M0,120 C180,100 360,140 540,120 S900,100 1080,120 S1260,135 1440,120" />
          <path opacity="0.65" d="M0,145 C220,165 440,125 660,145 S980,165 1200,145 S1320,130 1440,145" />
        </g>
      </svg>
    </div>
  );
}
