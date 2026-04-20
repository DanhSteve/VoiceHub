import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'voicehub-locale';

const LocaleContext = createContext(null);

function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
    return 'vi';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.setAttribute('lang', locale === 'en' ? 'en' : 'vi');
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (next === 'vi' || next === 'en') setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((l) => (l === 'vi' ? 'en' : 'vi'));
  }, []);

  const value = useMemo(() => ({ locale, setLocale, toggleLocale }), [locale, setLocale, toggleLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}

export { LocaleProvider, useLocale };
