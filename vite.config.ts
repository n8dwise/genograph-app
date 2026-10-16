/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the project at /genograph-app/; dev server runs at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/genograph-app/' : '/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Genograph',
        short_name: 'Genograph',
        description: 'Private, on-device genogram builder.',
        theme_color: '#1e293b',
        background_color: '#f8fafc',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}))
