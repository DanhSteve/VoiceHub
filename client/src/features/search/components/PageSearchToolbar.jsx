import PageSearchBar from './PageSearchBar';

/**
 * Thanh toolbar tìm kiếm full-width — tách khỏi tiêu đề trang.
 */
export default function PageSearchToolbar({
  value,
  onChange,
  placeholder,
  isDarkMode,
  id,
  'aria-label': ariaLabel,
  size = 'md',
  actions = null,
  children = null,
  className = '',
  /** stacked: ô tìm trên, filter dưới | filters-inline: filter trái, ô tìm phải cùng hàng */
  layout = 'stacked',
}) {
  const bar = isDarkMode
    ? 'border-b border-white/[0.06] bg-white/[0.02]'
    : 'border-b border-slate-200 bg-slate-50/90';

  if (layout === 'filters-inline') {
    return (
      <div className={`${bar} ${className}`}>
        <div className="flex items-center gap-3 px-4 py-3 lg:gap-4 lg:px-6">
          {children ? <div className="min-w-0 flex-1">{children}</div> : null}
          <div className="flex shrink-0 items-center gap-2">
            <PageSearchBar
              className="w-full min-w-[12rem] sm:w-56 md:w-64 lg:w-72"
              fullWidth={false}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              isDarkMode={isDarkMode}
              id={id}
              aria-label={ariaLabel}
              size={size}
            />
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${bar} ${className}`}>
      <div className="flex flex-col gap-3 px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <PageSearchBar
            className="min-w-0 flex-1"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            isDarkMode={isDarkMode}
            id={id}
            aria-label={ariaLabel}
            size={size}
            fullWidth
          />
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
