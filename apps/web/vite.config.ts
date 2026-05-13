import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Inject version metadata into the bundle at build time so the
// footer can show what users are looking at. Use literal `define`
// substitutions — zero runtime cost, just string replacement at
// build time.

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as {
  version: string
}

function gitShortSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    // Building outside a git checkout (e.g. a vendored copy). Return
    // a sentinel so the footer still renders something honest.
    return 'unknown'
  }
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

// Read the most recent fetched_at from the bundled raw data manifest so
// the footer can show users how fresh their lookup tables are. Returns
// 'unknown' if the manifest is missing or malformed.
function latestDataRefresh(): string {
  try {
    const raw = readFileSync(
      '../../packages/core/data/raw/_manifest.json',
      'utf8'
    )
    const entries: Array<{ fetched_at?: string }> = JSON.parse(raw)
    const max = entries.reduce(
      (m, e) => (e.fetched_at && e.fetched_at > m ? e.fetched_at : m),
      ''
    )
    return max ? max.slice(0, 10) : 'unknown'
  } catch {
    return 'unknown'
  }
}

// Vite config for the static web app. `base: './'` makes the built
// site work when served from a sub-path like
// https://chesler410.github.io/poe2-build-forge/.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'poe2-build-forge',
        short_name: 'Build Forge',
        description:
          'Convert Path of Building 2 codes into PoE2 .build files. ' +
          'Annotate, share, and download — entirely in-browser.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '.',
        scope: './',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512 any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Precache everything Vite emits so the converter works offline
        // after the first visit. The passives_default chunk is ~80KB
        // gzipped — fine for precache.
        globPatterns: ['**/*.{js,css,html,svg,ico,json}']
      }
    })
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_SHA__: JSON.stringify(gitShortSha()),
    __APP_BUILD_DATE__: JSON.stringify(todayUtcDate()),
    __APP_DATA_DATE__: JSON.stringify(latestDataRefresh())
  }
})
