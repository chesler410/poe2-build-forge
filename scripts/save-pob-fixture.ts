/**
 * One-shot: fetch a known pobb.in build, decode it, and save the XML
 * as a test fixture under packages/core/tests/fixtures/. Run only when
 * we want to refresh fixtures (rare).
 *
 * Run with:  pnpm exec tsx scripts/save-pob-fixture.ts [buildId]
 */

import { inflate } from 'node:zlib'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const inflateAsync = promisify(inflate)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..')
const FIXTURES_DIR = join(REPO_ROOT, 'packages/core/tests/fixtures')

const POBB_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function urlSafeBase64ToBuffer(input: string): Buffer {
  const standard = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

async function main() {
  const buildId = process.argv[2] ?? '90pcuxN4XtJG'
  console.log(`[save-fixture] Build ID: ${buildId}`)

  const url = `https://pobb.in/${buildId}/raw`
  const res = await fetch(url, { headers: { 'User-Agent': POBB_USER_AGENT } })
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText} for ${url}`)
  }
  const code = (await res.text()).trim()
  const compressed = urlSafeBase64ToBuffer(code)
  const xml = (await inflateAsync(compressed)).toString('utf8')

  await mkdir(FIXTURES_DIR, { recursive: true })
  const xmlPath = join(FIXTURES_DIR, `pob-${buildId}.xml`)
  const b64Path = join(FIXTURES_DIR, `pob-${buildId}.b64`)
  await writeFile(xmlPath, xml, 'utf8')
  await writeFile(b64Path, code, 'utf8')
  console.log(`[save-fixture] Wrote ${xml.length} chars XML to ${xmlPath}`)
  console.log(`[save-fixture] Wrote ${code.length} chars base64 to ${b64Path}`)
}

main().catch((err) => {
  console.error('[save-fixture] FAILED:', err)
  process.exit(1)
})
