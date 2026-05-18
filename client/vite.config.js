import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

const analyze = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .env / .env.local chỉ có trong import.meta.env cho mã app; config cần loadEnv.
  const env = loadEnv(mode, __dirname, '');
  const defaultBackendOrigin = env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:3000';
  const apiFromEnv = String(env.VITE_API_URL || '').trim();
  const apiProxyTarget =
    String(env.VITE_API_PROXY_TARGET || '').trim() ||
    (apiFromEnv.startsWith('http://') || apiFromEnv.startsWith('https://')
      ? apiFromEnv.replace(/\/api\/?$/, '')
      : defaultBackendOrigin);
  const socketProxyTarget = String(env.VITE_SOCKET_PROXY_TARGET || '').trim() || defaultBackendOrigin;
  const devHost = String(env.VITE_HOST || '0.0.0.0').trim();
  const fixedDevPort = 5173;
  const rawAllowedHosts = String(env.VITE_ALLOWED_HOSTS || '').trim();
  const allowedHosts = rawAllowedHosts
    ? rawAllowedHosts.split(',').map((h) => String(h || '').trim()).filter(Boolean)
    : true;
  const hmrHost = String(env.VITE_HMR_HOST || '').trim();
  const hmrProtocol = String(env.VITE_HMR_PROTOCOL || '').trim();
  const hmrClientPort = Number(String(env.VITE_HMR_CLIENT_PORT || '').trim());
  const hmrPort = Number(String(env.VITE_HMR_PORT || '').trim());
  const hmr =
    hmrHost || hmrProtocol || Number.isFinite(hmrClientPort) || Number.isFinite(hmrPort)
      ? {
          ...(hmrHost ? { host: hmrHost } : {}),
          ...(hmrProtocol ? { protocol: hmrProtocol } : {}),
          ...(Number.isFinite(hmrClientPort) ? { clientPort: hmrClientPort } : {}),
          ...(Number.isFinite(hmrPort) ? { port: hmrPort } : {}),
        }
      : undefined;

  return {
  plugins: [
    react({
      // Bật Fast Refresh với cấu hình tối ưu
      fastRefresh: true,
    }),
    analyze &&
      visualizer({
        filename: path.resolve(__dirname, 'dist/stats.html'),
        gzipSize: true,
        open: false,
        template: 'treemap',
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      // Tránh đặt tên file authContext.js: trên Windows import "AuthContext" có thể trùng với .js.
      // Cache/HMR đôi khi vẫn request URL cũ /src/context/authContext.js — map sang module thật.
      [path.resolve(__dirname, './src/context/authContext.js')]: path.resolve(
        __dirname,
        './src/context/auth-context.js'
      ),
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@context': path.resolve(__dirname, './src/context'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  server: {
    host: devHost,
    port: fixedDevPort,
    strictPort: true,
    allowedHosts,
    ...(hmr ? { hmr } : {}),
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      // Dev: mặc định proxy /socket.io → socket-service :3017 (host phải publish port).
      // Khi socket chỉ trong Docker: đặt VITE_SOCKET_PROXY_TARGET=http://localhost:3000 (api-gateway).
      '/socket.io': {
        target: socketProxyTarget,
        changeOrigin: true,
        ws: true,
      },
        // Dev: proxy signaling mediasoup (/voice-socket) qua API Gateway.
        // Đây là đường mà client socket.io sẽ kết nối tới (xài option `path`).
        [String(env.VITE_VOICE_SIGNAL_PATH || '/voice-socket').trim()]: {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/socket.io-client')) return 'socket';
          if (id.includes('node_modules/simple-peer')) return 'webrtc';
          if (id.includes('node_modules/lucide-react')) return 'icons';
          if (id.includes('node_modules/mediasoup-client')) return 'mediasoup';
        },
      },
    },
  },
};
});
