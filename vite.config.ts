import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// The site is served from https://dossymzhanrashat.github.io/dosym-os/
const BASE = '/dosym-os/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'Dosym OS',
        short_name: 'Dosym OS',
        description: 'Today, English, FrostPure, Tagylym and Radar in one place.',
        lang: 'en-GB',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#050a16',
        theme_color: '#050a16',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        // Web Push: show reminders and open the item when a notification is tapped.
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // Radar feed written daily by the Claude scheduled task: fresh when online, last copy offline.
            urlPattern: ({ url }) => url.pathname.endsWith('/data/opportunities.json'),
            handler: 'NetworkFirst',
            options: { cacheName: 'radar-feed', networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
});
