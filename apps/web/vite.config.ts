import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon/*', 'icons/*'],
      workbox: {
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
      },
      manifest: {
        name: 'Tabella',
        short_name: 'Tabella',
        description: 'Advanced Media Gallery',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/favicon/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/favicon/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('@mui/material') ||
            id.includes('@mui/icons-material') ||
            id.includes('@emotion/react') ||
            id.includes('@emotion/styled')
          ) {
            return 'mui-vendor'
          }

          if (
            id.includes('react-dom') ||
            id.includes('react-router-dom') ||
            id.includes('@tanstack/react-query') ||
            id.includes('/react/')
          ) {
            return 'react-vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/media': 'http://127.0.0.1:8787',
    },
  },
})
