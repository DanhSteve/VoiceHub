/* ========================================
   THEMECONTEXT.JSX - THEME MANAGEMENT
   Quản lý dark/light mode cho toàn app
   - Toggle giữa dark và light theme
   - Lưu preference vào localStorage
   - Auto apply theme khi reload
======================================== */

// Import hooks để build context
import { createContext, useContext, useLayoutEffect, useMemo, useState } from 'react';

const FONT_SCALE_STORAGE_KEY = 'voicehub-font-scale';
const FONT_SCALE_REM = {
  normal: '100%',
  comfortable: '112.5%',
  large: '125%',
};

// Tạo ThemeContext — isDarkMode, toggleTheme, fontScale, setFontScale
const ThemeContext = createContext();

/** Khi nhúng trong khung demo landing: ghi đè sáng/tối cục bộ, không đổi theme toàn trang */
const LandingDemoThemeContext = createContext(null);

/* ========================================
   CUSTOM HOOK: useTheme()
   Cách dùng: const { isDarkMode, toggleTheme } = useTheme();
   
   Trong khung preview landing (LandingDemoThemeProvider): theme cục bộ (đồng bộ khi app đổi; toggle trong demo không đổi app).
   Ngoài đó: theme toàn app (localStorage + class trên <html>).
======================================== */
function useTheme() {
  const context = useContext(ThemeContext);
  const demoOverride = useContext(LandingDemoThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  if (demoOverride) {
    return demoOverride;
  }

  return context;
}

/**
 * Bọc khung demo landing: theme preview tách khỏi ghi localStorage/html.
 * - Đổi theme ở app thật → preview tự khớp theo.
 * - Đổi theme trong preview → chỉ state cục bộ, không đổi app thật.
 */
function LandingDemoThemeProvider({ children }) {
  const global = useContext(ThemeContext);
  if (!global) {
    throw new Error('LandingDemoThemeProvider must be used within ThemeProvider');
  }

  const { fontScale, setFontScale, isDarkMode: globalDark } = global;
  const [demoDark, setDemoDark] = useState(() => globalDark);

  useLayoutEffect(() => {
    setDemoDark(globalDark);
  }, [globalDark]);

  const value = useMemo(
    () => ({
      isDarkMode: demoDark,
      toggleTheme: () => setDemoDark((d) => !d),
      fontScale,
      setFontScale,
    }),
    [demoDark, fontScale, setFontScale]
  );

  return <LandingDemoThemeContext.Provider value={value}>{children}</LandingDemoThemeContext.Provider>;
}

export { useTheme, LandingDemoThemeProvider };

/* ========================================
   THEMEPROVIDER COMPONENT
   Wrap ở ngoài cùng trong main.jsx
   Cung cấp theme state cho toàn app
======================================== */
function ThemeProvider({ children }) {
  /* ----- STATE: isDarkMode ----- */
  
  // State lưu dark mode preference
  // Initial value: lấy từ localStorage hoặc default = dark
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Lấy theme đã lưu từ localStorage
    const saved = localStorage.getItem('theme');
    
    // Có bản ghi → theo đó; chưa có → mặc định sáng (đồng bộ mock đăng nhập/đăng ký).
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return false;
  });

  const [fontScale, setFontScaleState] = useState(() => {
    const s = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    if (s === 'comfortable' || s === 'large' || s === 'normal') return s;
    return 'normal';
  });

  useLayoutEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.remove('light');
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }, [isDarkMode]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = FONT_SCALE_REM[fontScale] || '100%';
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale);
  }, [fontScale]);

  const setFontScale = (value) => {
    if (FONT_SCALE_REM[value] != null) setFontScaleState(value);
  };

  /* ========================================
     toggleTheme: FUNCTION ĐỂ SWITCH THEME
     Đảo ngược isDarkMode: true → false, false → true
     
     Component gọi hàm này khi user click toggle button
     VD: <button onClick={toggleTheme}>🌙/☀️</button>
  ======================================== */
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Return Provider với value chứa state và function
  // Mọi component con có thể access { isDarkMode, toggleTheme }
  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, fontScale, setFontScale }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Export ThemeProvider để dùng trong main.jsx
export { ThemeProvider };

/* ========================================
   CÁCH DÙNG TRONG COMPONENT:
   
   import { useTheme } from './context/ThemeContext';
   
   function Header() {
     const { isDarkMode, toggleTheme } = useTheme();
     
     return (
       <button onClick={toggleTheme}>
         {isDarkMode ? '🌙 Dark' : '☀️ Light'}
       </button>
     );
   }
   
   CSS TAILWIND:
   - Dùng prefix 'dark:' cho dark mode styles
   - VD: <div className="bg-white dark:bg-gray-900">
   - Khi isDarkMode=true → <html class="dark"> → dark: styles active
======================================== */
