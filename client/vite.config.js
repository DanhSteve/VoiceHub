import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

const analyze = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';

// https://vitejs.dev/config/
export default defineConfig({
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
    port: 5173, // Vite dev server port (tránh conflict với API Gateway port 3000)
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000',
        changeOrigin: true,
      },
      // Dev: proxy /socket.io → socket-service trực tiếp (tránh 404 khi gateway chưa proxy /socket.io đúng).
      // Override: VITE_SOCKET_PROXY_TARGET=http://localhost:3000 nếu cần test qua gateway.
      '/socket.io': {
        target: process.env.VITE_SOCKET_PROXY_TARGET || 'http://127.0.0.1:3017',
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
});
