// Vitest reads this file in preference to vite.config.ts, which lets
// the test environment use its own type-safe surface without inheriting
// vite-plugin-pwa or any Vite-only plugins. We mirror just the bits
// that affect test resolution: the React plugin (so .tsx files parse)
// and the test field.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // No DOM needed — tests focus on pure functions (shareLink,
    // itemAnnotation) and server-side rendering (markup via
    // renderToStaticMarkup). Keep the test environment lean.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}']
  }
})
