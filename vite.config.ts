import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Manifest colours come from tokens.css so a re-skin changes them too.
const tokens = readFileSync(resolve(__dirname, 'public/tokens.css'), 'utf8');
const token = (name: string, fallback: string) => tokens.match(new RegExp(`${name}:\s*(#[0-9A-Fa-f]{3,6})`))?.[1] ?? fallback;

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), styleTest: resolve(__dirname, 'style-test/index.html') },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['tokens.css', 'fonts/*.woff2', 'assets/**/*', 'icons/*'],
      manifest: {
        name: 'Kaizer Games',
        short_name: 'Kaizer',
        description: 'Spanish games for children and adults together.',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: token('--paper', '#ffffff'),
        theme_color: token('--forest', '#000000'),
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,svg,png,webp,woff2,json,mp3}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
  },
});
