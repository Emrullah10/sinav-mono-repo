import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'node:path';

// Yerel backend: gateway :2000. Staging yok; başka hedef için VITE_PROXY_TARGET verin.
const proxyTarget = globalThis.process?.env?.VITE_PROXY_TARGET || 'http://127.0.0.1:2000';
const appBase = globalThis.process?.env?.APP_BASE || '/';
const appVersion = (() => {
  if (globalThis.process?.env?.APP_VERSION) return globalThis.process.env.APP_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
})();
const src = (p) => path.resolve(import.meta.dirname, 'src', p);

export default defineConfig({
  base: appBase,
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  css: { preprocessorOptions: { scss: { additionalData: '@use "@styles/globals" as *;' } } },
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: { '/api': { target: proxyTarget, changeOrigin: true, secure: false } },
  },
  preview: { port: 3000, host: '127.0.0.1', proxy: { '/api': { target: proxyTarget, changeOrigin: true, secure: false } } },
  resolve: {
    alias: {
      '@assets': src('assets'),
      '@components': src('components'),
      '@container': src('container'),
      '@hooks': src('hooks'),
      '@layouts': src('layouts'),
      '@pages': src('pages'),
      '@router': src('router'),
      '@shared': src('shared'),
      '@store': src('store'),
      '@styles': src('styles'),
      '@api': src('api'),
      '@features': src('features'),
      // Ortak paketler (monorepo): saf domain kodu backend ile aynı dosya.
      '@sinav/domain': path.resolve(import.meta.dirname, '../packages/modules/shared/domain/index.js'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react-router')) return 'vendor-react';
          if (id.includes('@mui/') || id.includes('@emotion/')) return 'vendor-mui';
        },
      },
    },
  },
});
