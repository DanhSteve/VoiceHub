import { Search, X } from 'lucide-react';
import { useAppStrings } from '../../../locales/appStrings';
import { getSearchFieldClasses } from '../searchFieldTheme';

/**
 * Ô tìm kiếm chuẩn VoiceHub — export alias AppSearchField.
 */
export default function PageSearchBar({
  value,
  onChange,
  placeholder,
  isDarkMode,
  className = '',
  id,
  'aria-label': ariaLabel,
  size = 'md',
  variant = 'default',
  fullWidth = true,
  showClear = true,
  trailing = null,
  onKeyDown,
  onFocus,
}) {
  const { t } = useAppStrings();
  const cls = getSearchFieldClasses({ isDarkMode, size, variant, fullWidth });
  const hasClear = showClear && String(value || '').length > 0;

  return (
    <div className={`${cls.wrapper} ${className}`}>
      <div className={cls.shell}>
        <Search className={cls.icon} aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          placeholder={placeholder}
          aria-label={ariaLabel || placeholder}
          className={cls.input}
        />
        {hasClear && (
          <button
            type="button"
            onClick={() => onChange('')}
            className={cls.clearBtn}
            aria-label={t('searchUi.clear')}
          >
            <X className="h-full w-full" />
          </button>
        )}
        {trailing}
      </div>
    </div>
  );
}

export { PageSearchBar as AppSearchField };
