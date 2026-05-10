import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for the static web app. Output is plain HTML/JS/CSS in
// dist/ that any static host (GitHub Pages, Cloudflare Pages, etc.)
// can serve. No backend.
//
// `base: './'` makes the built site work when served from a sub-path
// like https://chesler410.github.io/poe2-build-forge/ — important if
// we ever deploy via GH Pages.
export default defineConfig({
  plugins: [react()],
  base: './'
})
