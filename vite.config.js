import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // Upload source maps to Sentry on production builds
    mode === 'production' &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT || 'jarbris-widget',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        release: { name: process.env.SENTRY_RELEASE },
      }),
  ].filter(Boolean),
  base: '/',
  build: {
    sourcemap: 'hidden', // Generate source maps for Sentry but don't expose to browser
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@sentry') || id.includes('sentry-')) {
              return 'vendor-sentry';
            }
            if (id.includes('framer-motion')) {
              return 'vendor-framer';
            }
            if (id.includes('ogl')) {
              return 'vendor-ogl';
            }
            if (
              id.includes('react/') ||
              id.includes('react-dom/') ||
              id.includes('react-router-dom/') ||
              id.includes('scheduler/')
            ) {
              return 'vendor-react-core';
            }
          }
        },
      },
    },
  },
  esbuild: {
    // Only drop console in production builds
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  server: {
    host: true,
    allowedHosts: [
      'localhost',
      '.trycloudflare.com', // Accetta tutti i domini cloudflare
    ],
  },
}));
