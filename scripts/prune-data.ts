/**
 * Prune the raw data snapshot down to the field set the mapper actually
 * needs. Output lands at packages/core/data/pruned/.
 *
 * Run with:  pnpm prune-data
 *
 * Re-run whenever scripts/fetch-data.ts refreshes raw/. Output is
 * deterministic per input (same raw bytes => same pruned bytes => same
 * git diff), so commits stay clean.
 *
 * tree.json is copied unchanged because we don't yet know which of its
 * fields the mapper needs (PoB node IDs vs. GGG PassiveSkills.ids
 * mapping is the open question). Revisit pruning it once the decoder
 * is consuming it.
 */

import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = join(__dirname, '..')
const RAW_DIR = join(REPO_ROOT, 'packages/core/data/raw')
const PRUNED_DIR = join(REPO_ROOT, 'packages/core/data/pruned')

interface Pruner {
  filename: string
  prune: ((raw: any) => any) | null
}

const pruners: Pruner[] = [
  {
    filename: 'ascendancies.json',
    prune: (raw: Record<string, any>) => {
      const out: Record<string, { name: string; class_number: number }> = {}
      for (const [key, value] of Object.entries(raw)) {
        out[key] = {
          name: value.name,
          class_number: value.class_number
        }
      }
      return out
    }
  },
  {
    filename: 'characters.json',
    prune: (raw: any[]) =>
      raw.map((c) => ({
        name: c.name,
        metadata_id: c.metadata_id,
        integer_id: c.integer_id
      }))
  },
  {
    filename: 'skill_gems.json',
    prune: (raw: Record<string, any>) => {
      const out: Record<
        string,
        { gameId: string; name: string; gemType: string }
      > = {}
      for (const [key, value] of Object.entries(raw)) {
        out[key] = {
          gameId: value.gameId,
          name: value.name,
          gemType: value.gemType
        }
      }
      return out
    }
  },
  {
    filename: 'base_items.json',
    prune: (raw: Record<string, any>) => {
      const out: Record<
        string,
        {
          name: string
          item_class: string
          drop_level: number
          release_state: string
        }
      > = {}
      for (const [key, value] of Object.entries(raw)) {
        out[key] = {
          name: value.name,
          item_class: value.item_class,
          drop_level: value.drop_level,
          release_state: value.release_state
        }
      }
      return out
    }
  },
  {
    filename: 'item_classes.json',
    prune: null // small file, copy as-is
  },
  {
    filename: 'uniques.json',
    prune: (raw: Record<string, any>) => {
      const out: Record<
        string,
        {
          name: string
          item_class: string
          visual_identity_id: string | null
        }
      > = {}
      for (const [key, value] of Object.entries(raw)) {
        out[key] = {
          name: value.name,
          item_class: value.item_class,
          visual_identity_id: value.visual_identity?.id ?? null
        }
      }
      return out
    }
  },
  {
    filename: 'tree.json',
    prune: null // defer pruning until decoder consumes it
  }
]

interface ManifestEntry {
  filename: string
  raw_size: number
  pruned_size: number
  reduction_pct: number
  pruned: boolean
  sha256: string
}

async function processOne(p: Pruner): Promise<ManifestEntry> {
  const rawPath = join(RAW_DIR, p.filename)
  const outPath = join(PRUNED_DIR, p.filename)
  const rawBuf = await readFile(rawPath)

  let outBuf: Buffer
  let pruned: boolean

  if (p.prune === null) {
    outBuf = rawBuf
    pruned = false
  } else {
    const rawJson = JSON.parse(rawBuf.toString('utf8'))
    const prunedJson = p.prune(rawJson)
    outBuf = Buffer.from(JSON.stringify(prunedJson, null, 2) + '\n', 'utf8')
    pruned = true
  }

  await writeFile(outPath, outBuf)
  const sha256 = createHash('sha256').update(outBuf).digest('hex')
  const reduction = ((rawBuf.length - outBuf.length) / rawBuf.length) * 100

  const tag = pruned ? 'pruned' : 'copied'
  const rawKib = (rawBuf.length / 1024).toFixed(0).padStart(5)
  const outKib = (outBuf.length / 1024).toFixed(0).padStart(5)
  console.log(
    `  + ${tag.padEnd(7)} ${p.filename.padEnd(20)}  ` +
      `${rawKib} KiB -> ${outKib} KiB  (-${reduction.toFixed(1)}%)`
  )

  return {
    filename: p.filename,
    raw_size: rawBuf.length,
    pruned_size: outBuf.length,
    reduction_pct: Math.round(reduction * 10) / 10,
    pruned,
    sha256
  }
}

async function main() {
  await mkdir(PRUNED_DIR, { recursive: true })
  console.log(`[prune-data] Processing ${pruners.length} files`)
  const manifest = await Promise.all(pruners.map(processOne))
  manifest.sort((a, b) => a.filename.localeCompare(b.filename))
  await writeFile(
    join(PRUNED_DIR, '_manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  )

  const totalRaw = manifest.reduce((s, m) => s + m.raw_size, 0)
  const totalPruned = manifest.reduce((s, m) => s + m.pruned_size, 0)
  const totalReduction = ((totalRaw - totalPruned) / totalRaw) * 100
  const rawMib = (totalRaw / 1024 / 1024).toFixed(2)
  const prunedMib = (totalPruned / 1024 / 1024).toFixed(2)
  console.log(
    `[prune-data] Done. ${rawMib} MiB -> ${prunedMib} MiB ` +
      `(-${totalReduction.toFixed(1)}%)`
  )
}

main().catch((err) => {
  console.error('[prune-data] FAILED:', err)
  process.exit(1)
})
