import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const labels = JSON.parse(
  readFileSync(join(here, '../data/pruned/gem_labels.json'), 'utf8')
) as Record<string, string>

describe('bundled gem labels', () => {
  // 0.5 renamed several gems' display names. The internal ids that appear
  // in PoB exports and game-accepted .build files are unchanged (verified
  // in fixtures/ and the Stormweaver export). PoB's dev-branch Gems.lua can
  // run ahead of the live game and rename the ids, so labels must be sourced
  // from the game-derived skill_gems tables. Pin the confirmed mappings so a
  // stale/ahead-of-game data bundle fails loudly.
  it.each([
    ['Metadata/Items/Gems/SupportGemInspirationTwo', 'Efficiency II'],
    ['Metadata/Items/Gems/SupportGemPersistenceTwo', 'Prolonged Duration II'],
    ['Metadata/Items/Gems/SupportGemMagnifiedEffectTwo', 'Magnified Area II']
  ])('labels %s as %s', (id, expected) => {
    expect(labels[id]).toBe(expected)
  })

  it('resolves every support/skill gem id used in the Mobalytics fixtures', () => {
    const dir = join(here, '../../../fixtures/mobalytics')
    const { readdirSync } = require('node:fs') as typeof import('node:fs')
    const ids = new Set<string>()
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.build'))) {
      const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
      for (const s of d.skills ?? []) {
        const gid = typeof s === 'string' ? s : s.id
        if (gid) ids.add(gid)
        for (const sup of (typeof s === 'string' ? [] : s.support_skills) ?? []) {
          ids.add(typeof sup === 'string' ? sup : sup.id)
        }
      }
    }
    const unresolved = [...ids].filter((id) => !labels[id])
    expect(unresolved).toEqual([])
  })
})
