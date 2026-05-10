import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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

// Vite config for the static web app. `base: './'` makes the built
// site work when served from a sub-path like
// https://chesler410.github.io/poe2-build-forge/.
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_SHA__: JSON.stringify(gitShortSha()),
    __APP_BUILD_DATE__: JSON.stringify(todayUtcDate())
  }
})
