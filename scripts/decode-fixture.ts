/**
 * One-shot: decode a base64 PoB fixture file and save the resulting
 * XML alongside it. Used when we already have a raw code (e.g. pasted
 * from a user) and don't want to re-fetch from pobb.in.
 *
 * Run with: pnpm exec tsx scripts/decode-fixture.ts <fixture-name>
 *   e.g.    pnpm exec tsx scripts/decode-fixture.ts bloodmage
 *
 * Expects packages/core/tests/fixtures/pob-<name>.b64 to exist.
 * Writes packages/core/tests/fixtures/pob-<name>.xml.
 */

import { inflate } from 'node:zlib'
import { promisify } from 'node:util'
import { readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const inflateAsync = promisify(inflate)

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..')
const FIXTURES_DIR = join(REPO_ROOT, 'packages/core/tests/fixtures')

function urlSafeBase64ToBuffer(input: string): Buffer {
  const standard = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  return Buffer.from(padded, 'base64')
}

async function main() {
  const name = process.argv[2]
  if (!name) {
    console.error('Usage: pnpm exec tsx scripts/decode-fixture.ts <name>')
    process.exit(1)
  }

  const b64Path = join(FIXTURES_DIR, `pob-${name}.b64`)
  const xmlPath = join(FIXTURES_DIR, `pob-${name}.xml`)

  const code = (await readFile(b64Path, 'utf8')).trim()
  const compressed = urlSafeBase64ToBuffer(code)
  const xml = (await inflateAsync(compressed)).toString('utf8')

  await writeFile(xmlPath, xml, 'utf8')
  console.log(`[decode-fixture] Wrote ${xml.length} chars to ${xmlPath}`)
}

main().catch((err) => {
  console.error('[decode-fixture] FAILED:', err)
  process.exit(1)
})
