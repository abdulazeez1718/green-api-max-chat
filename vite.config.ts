/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Content-Security-Policy для production-сборки.
 * В dev-режиме не добавляется: Vite использует inline-скрипты и WebSocket для HMR.
 * connect-src разрешает https: — адрес API (apiUrl) пользователь может указать свой.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  'connect-src https:',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  const charset = '<meta charset="UTF-8" />'
  return {
    name: 'content-security-policy',
    apply: 'build',
    // Сразу после charset и до любых скриптов и стилей.
    transformIndexHtml: (html) =>
      html.replace(
        charset,
        `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
      ),
  }
}

export default defineConfig({
  // Относительные пути к ассетам: сборка работает и на GitHub Pages (/<repo>/), и в корне домена.
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
})
