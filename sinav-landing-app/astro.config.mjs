import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';

// Statik çıktı; uygulama (app.<host>) ile AYRI origin (şablon §17).
export default defineConfig({
  output: 'static',
  site: process.env.LANDING_SITE_URL || 'http://127.0.0.1:4321',
  server: { host: '127.0.0.1', port: 4321 },
  integrations: [sitemap(), icon({ include: { lucide: ['*'] } })],
  vite: { plugins: [tailwindcss()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } } },
  trailingSlash: 'never',
  build: { format: 'file' },
});
