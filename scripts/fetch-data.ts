/**
 * Bundle script: download a raw snapshot of the PoE2 game tables we need
 * for ID mapping, and write a manifest with provenance + integrity hashes.
 *
 * Run with:  pnpm fetch-data
 *
 * Sources:
 *   - repoe-fork/poe2 (master)         auto-tracks GGG patches; JSON dumps
 *   - PathOfBuilding-PoE2 (dev)        used only for the versioned passive
 *                                       tree under src/TreeData/<patch>/
 *
 * Output lands under packages/core/data/raw/ and is committed to the repo.
 * No pruning happens here so we can re-run downstream transforms without
 * re-fetching from the network.
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Source {
  filename: string
  url: string
}

const SOURCES: Source[] = [
  {
    filename: 'ascendancies.json',
    url: 'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/ascendancies.json'
  },
  {
    filename: 'characters.json',
    url: 'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/characters.json'
  },
  {
    filename: 'skill_gems.json',
    url: 'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/skill_gems.json'
  },
  {
    filename: 'base_items.json',
    url: 'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/base_items.json'
  },
  {
    filename: 'item_classes.json',
    url: 'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/item_classes.json'
  },
  {
    filename: 'uniques.json',
    url: 'https://raw.githubusercontent.com/repoe-fork/poe2/master/data/uniques.json'
  },
  {
    filename: 'tree.json',
    url: 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/dev/src/TreeData/0_1/tree.json'
  }
]

interface ManifestEntry {
  filename: string
  source_url: string
  fetched_at: string
  size_bytes: number
  sha256: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..')
const OUT_DIR = join(REPO_ROOT, 'packages/core/data/raw')

async function fetchOne(src: Source): Promise<ManifestEntry> {
  const fetchedAt = new Date().toISOString()
  const res = await fetch(src.url)
  if (!res.ok) {
    throw new Error(
      `Fetch failed: ${res.status} ${res.statusText} for ${src.url}`
    )
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(join(OUT_DIR, src.filename), buf)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const kib = (buf.length / 1024).toFixed(1)
  console.log(`  + ${src.filename}  ${kib} KiB  sha256:${sha256.slice(0, 12)}...`)
  return {
    filename: src.filename,
    source_url: src.url,
    fetched_at: fetchedAt,
    size_bytes: buf.length,
    sha256
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  console.log(`[fetch-data] Downloading ${SOURCES.length} files to ${OUT_DIR}`)
  const entries = await Promise.all(SOURCES.map(fetchOne))
  entries.sort((a, b) => a.filename.localeCompare(b.filename))
  await writeFile(
    join(OUT_DIR, '_manifest.json'),
    JSON.stringify(entries, null, 2) + '\n'
  )
  const totalBytes = entries.reduce((s, e) => s + e.size_bytes, 0)
  const totalMib = (totalBytes / 1024 / 1024).toFixed(2)
  console.log(
    `[fetch-data] Done. ${entries.length} files, ${totalMib} MiB total.`
  )
}

main().catch((err) => {
  console.error('[fetch-data] FAILED:', err)
  process.exit(1)
})
