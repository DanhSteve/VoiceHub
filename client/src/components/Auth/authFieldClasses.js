/** Class input theo theme — dùng isDarkMode từ ThemeContext. */

/** Nút CTA chính (đồng bộ đăng nhập / đăng ký / quên mật khẩu). */
export function authPrimaryButtonClass(isDark) {
  return isDark
    ? 'bg-[#0086a8] shadow-cyan-950/40 hover:bg-[#007a96]'
    : 'bg-[#0097a7] shadow-cyan-900/25 hover:bg-[#008896]';
}

export function authInputSurface(isDark, { dense = false, className = '' } = {}) {
  const py = dense ? 'py-3.5' : 'py-4';
  const base = `w-full rounded-2xl border px-4 ${py} text-base transition focus:outline-none focus:ring-2 ${className}`;
  if (isDark) {
    return (
      `${base} border-slate-600/90 bg-[#0c1018] text-slate-100 placeholder:text-slate-500 ` +
      'focus:border-cyan-500 focus:ring-cyan-500/20'
    );
  }
  return (
    `${base} border-slate-200 bg-slate-100 text-slate-900 placeholder:text-slate-400 ` +
    'focus:border-cyan-600 focus:ring-cyan-600/20'
  );
}

export function authInputError(isDark, { dense = false } = {}) {
  const py = dense ? 'py-3.5' : 'py-4';
  const base = `w-full rounded-2xl border px-4 ${py} text-base transition focus:outline-none focus:ring-2`;
  if (isDark) {
    return (
      `${base} border-red-500/70 bg-red-950/35 text-slate-100 focus:border-red-500 focus:ring-red-500/25`
    );
  }
  return `${base} border-red-500/85 bg-red-50 text-slate-900 focus:border-red-600 focus:ring-red-500/20`;
}
