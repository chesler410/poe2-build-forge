/**
 * Real-data integration tests against the Blood Mage fixture
 * (pobb.in/L39C--IgzGad). The Ranger fixture has empty inventory
 * slots so it doesn't exercise the <Item> parsing path; this one
 * has 15 real items spanning UNIQUE / RARE / MAGIC rarities and
 * was the build that surfaced the original "items not appearing"
 * and "magic item base type" bugs. Keeping it as a fixture means
 * those regressions can't sneak back in unnoticed.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate } from '@poe2-build-forge/schema'
import { parsePobXml } from '../src/parse'
import { mapPobToBuild } from '../src/map'
import { emitBuildFile } from '../src/emit'
import type { AscendancyLookup, PassiveLookup } from '../src/map'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureXml = readFileSync(
  join(here, 'fixtures/pob-L39C--IgzGad.xml'),
  'utf8'
)
const passives = JSON.parse(
  readFileSync(join(here, '../data/pruned/passives_default.json'), 'utf8')
) as PassiveLookup
const ascendancies = JSON.parse(
  readFileSync(join(here, '../data/pruned/ascendancies.json'), 'utf8')
) as AscendancyLookup

describe('Blood Mage end-to-end (real data with items)', () => {
  const pob = parsePobXml(fixtureXml)
  const build = mapPobToBuild(pob, { passives, ascendancies })

  it('parses the Witch / Blood Mage header', () => {
    expect(pob.build.className).toBe('Witch')
    expect(pob.build.ascendClassName).toBe('Blood Mage')
  })

  it('resolves ascendancy display name to Witch2 via the lookup', () => {
    expect(build.ascendancy).toBe('Witch2')
  })

  it('emits a populated, schema-valid build file', () => {
    const result = validate(build)
    if (!result.valid) {
      console.error('schema errors:', JSON.stringify(result.errors, null, 2))
    }
    expect(result.valid).toBe(true)
    expect(build.passives?.length).toBeGreaterThan(50)
    expect(build.skills?.length).toBeGreaterThan(5)
    expect(build.items?.length).toBeGreaterThan(0)
  })

  it('every emitted item carries either unique_name or additional_text', () => {
    // Regression: previously item slots emitted bare (no item info at all).
    for (const item of build.items ?? []) {
      const hasContent =
        typeof item.unique_name === 'string' ||
        typeof item.additional_text === 'string'
      expect(hasContent, `slot ${item.inventory_id} is missing item info`).toBe(
        true
      )
    }
  })

  it('no additional_text leaks PoB metadata for magic items', () => {
    // Regression on the v0.5.1 fix: magic items used to surface
    // "MAGIC: Unique ID: 63727b..." because the parser took the
    // metadata line as the base type.
    for (const item of build.items ?? []) {
      if (typeof item.additional_text === 'string') {
        expect(item.additional_text).not.toMatch(/Unique ID:/i)
        expect(item.additional_text).not.toMatch(/Item Level:/i)
      }
    }
  })

  it('every emitted skill carries at least one Metadata/Items/Gem(s)/ id', () => {
    for (const skill of build.skills ?? []) {
      const id = typeof skill === 'string' ? skill : skill.id
      expect(id).toMatch(/^Metadata\/Items\/Gems?\//)
    }
  })

  it('output round-trips through emitBuildFile producing a downloadable file', () => {
    const { filename, content } = emitBuildFile(build)
    expect(filename).toBe('Witch - Blood Mage.build')
    expect(content.startsWith('{')).toBe(true)
    expect(content.endsWith('\n')).toBe(true)
    expect(JSON.parse(content).name).toBe('Witch - Blood Mage')
  })
})
