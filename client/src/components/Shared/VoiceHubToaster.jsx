import { Toaster } from 'react-hot-toast';
import { useTheme } from '../../context/ThemeContext';

/**
 * react-hot-toast — style đồng bộ dark/light (main.jsx trước đây cố định nền tối).
 */
export default function VoiceHubToaster() {
  const { isDarkMode } = useTheme();

  const baseStyle = isDarkMode
    ? {
        background: '#10141c',
        color: '#f8fafc',
        border: '1px solid rgba(201, 162, 39, 0.45)',
        borderRadius: '12px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(212, 175, 55, 0.12)',
        fontWeight: 600,
        fontSize: '0.925rem',
        maxWidth: 'min(420px, 92vw)',
      }
    : {
        background: '#ffffff',
        color: '#0f172a',
        border: '1px solid rgba(15, 23, 42, 0.12)',
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.06)',
        fontWeight: 600,
        fontSize: '0.9375rem',
        maxWidth: 'min(420px, 92vw)',
      };

  return (
    <Toaster
      position="top-right"
      containerStyle={{
        top: 24,
        right: 24,
      }}
      toastOptions={{
        duration: 3000,
        className: 'voicehub-toast',
        style: baseStyle,
        success: {
          iconTheme: isDarkMode
            ? { primary: '#d4af37', secondary: '#10141c' }
            : { primary: '#0d9488', secondary: '#ffffff' },
        },
        error: {
          iconTheme: isDarkMode
            ? { primary: '#f87171', secondary: '#10141c' }
            : { primary: '#dc2626', secondary: '#ffffff' },
        },
        loading: {
          iconTheme: isDarkMode
            ? { primary: '#c9a227', secondary: '#10141c' }
            : { primary: '#0284c7', secondary: '#ffffff' },
        },
      }}
    />
  );
}
