/**
 * Poll the PoE2 developer docs page and detect changes to the Build Planner
 * section. Intended to be scheduled (Windows Task Scheduler / cron / launchd)
 * so we hear about GGG schema or workflow changes before 0.5.0 ships.
 *
 * Run with:  pnpm watch-docs
 *
 * Exit codes:
 *   0  unchanged since last run (or first run — baseline saved)
 *   1  changed since last run
 *   2  error (network, parse, etc.)
 *
 * State lives outside the repo, under ~/.poe2-build-forge/buildplanner-watch/:
 *   last.html             raw HTML from the last fetch
 *   last.normalized.txt   what was actually hashed (for diffing)
 *   last.hash             sha256 of the normalized text
 *   history.log           append-only log: ISO timestamp, hash, changed y/n
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DOCS_URL = 'https://www.pathofexile.com/developer/docs/game'
const STATE_DIR = join(homedir(), '.poe2-build-forge', 'buildplanner-watch')
const UA = 'poe2-build-forge-watcher/0.1 (+https://github.com/chesler410/poe2-build-forge)'

function normalize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractBuildplannerSection(normalized: string): string | null {
  const start = normalized.search(/id\s*=\s*["']?buildplanner/i)
  if (start === -1) return null
  const rest = normalized.slice(start)
  const nextHeading = rest.slice(1).search(/<h[12][\s>]/i)
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1)
}

async function main(): Promise<number> {
  await mkdir(STATE_DIR, { recursive: true })

  const fetchedAt = new Date().toISOString()
  let html: string
  try {
    const res = await fetch(DOCS_URL, { headers: { 'User-Agent': UA } })
    if (!res.ok) {
      console.error(`[watch-docs] HTTP ${res.status} ${res.statusText}`)
      return 2
    }
    html = await res.text()
  } catch (err) {
    console.error('[watch-docs] fetch failed:', err)
    return 2
  }

  const normalized = normalize(html)
  const section = extractBuildplannerSection(normalized)
  const hashed = section ?? normalized
  const mode = section ? 'section' : 'whole-page-fallback'
  const hash = createHash('sha256').update(hashed).digest('hex')

  const hashPath = join(STATE_DIR, 'last.hash')
  const htmlPath = join(STATE_DIR, 'last.html')
  const normPath = join(STATE_DIR, 'last.normalized.txt')
  const logPath = join(STATE_DIR, 'history.log')

  const prev = existsSync(hashPath) ? (await readFile(hashPath, 'utf8')).trim() : null
  const changed = prev !== null && prev !== hash
  const firstRun = prev === null

  await writeFile(htmlPath, html)
  await writeFile(normPath, hashed)
  await writeFile(hashPath, hash + '\n')
  await appendFile(
    logPath,
    `${fetchedAt}\t${hash}\t${firstRun ? 'baseline' : changed ? 'CHANGED' : 'unchanged'}\t${mode}\n`
  )

  if (firstRun) {
    console.log(`[watch-docs] baseline saved (${mode})  sha256:${hash.slice(0, 12)}...`)
    console.log(`[watch-docs] state dir: ${STATE_DIR}`)
    return 0
  }

  if (changed) {
    console.log(`[watch-docs] CHANGED (${mode})`)
    console.log(`  prev: ${prev.slice(0, 12)}...`)
    console.log(`  curr: ${hash.slice(0, 12)}...`)
    console.log(`  diff: compare ${normPath} against its previous version in git or backup`)
    return 1
  }

  console.log(`[watch-docs] unchanged (${mode})  sha256:${hash.slice(0, 12)}...`)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[watch-docs] FAILED:', err)
    process.exit(2)
  })
