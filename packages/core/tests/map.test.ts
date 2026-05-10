import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validate } from '@poe2-build-forge/schema'
import { mapPobToBuild } from '../src/map'
import { parsePobXml } from '../src/parse'
import type { AscendancyLookup, PassiveLookup } from '../src/map'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureXml = readFileSync(
  join(here, 'fixtures/pob-90pcuxN4XtJG.xml'),
  'utf8'
)
const pob = parsePobXml(fixtureXml)

const passivesLookup = JSON.parse(
  readFileSync(
    join(here, '../data/pruned/passives_default.json'),
    'utf8'
  )
) as PassiveLookup

const ascendanciesLookup = JSON.parse(
  readFileSync(
    join(here, '../data/pruned/ascendancies.json'),
    'utf8'
  )
) as AscendancyLookup

describe('mapPobToBuild', () => {
  it('produces a build with a derived name when none provided', () => {
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    expect(result.name).toBe('Ranger - Deadeye')
  })

  it('honours an explicit name override', () => {
    const result = mapPobToBuild(pob, {
      passives: passivesLookup,
      name: 'My custom name'
    })
    expect(result.name).toBe('My custom name')
  })

  it('passes through ascendClassName when no ascendancy lookup is given', () => {
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    expect(result.ascendancy).toBe('Deadeye')
  })

  it('resolves the GGG-format ascendancy key when lookup is given', () => {
    const result = mapPobToBuild(pob, {
      passives: passivesLookup,
      ascendancies: ascendanciesLookup
    })
    // For Ranger / Deadeye the dev-docs format key should start with "Ranger"
    // and be followed by a digit (the ordinal in PoE2).
    expect(result.ascendancy).toMatch(/^Ranger\d+$/)
  })

  it('translates PoB tree integer ids into GGG passive ids', () => {
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    expect(Array.isArray(result.passives)).toBe(true)
    expect(result.passives!.length).toBeGreaterThan(0)
    for (const p of result.passives!) {
      // Every emitted passive should be the shorthand string form here.
      expect(typeof p).toBe('string')
      // No empty strings, and ids look like the GGG format
      // (alphanumeric/underscore, sometimes with a numeric suffix).
      expect(p as string).toMatch(/^[A-Za-z][A-Za-z0-9_]+$/)
    }
  })

  it('emits skills as gem-id strings or {id, support_skills} objects', () => {
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    expect(result.skills).toBeDefined()
    expect(result.skills!.length).toBeGreaterThan(0)

    for (const s of result.skills!) {
      if (typeof s === 'string') {
        expect(s).toMatch(/^Metadata\/Items\/Gems?\//)
      } else {
        expect(s.id).toMatch(/^Metadata\/Items\/Gems?\//)
        if (s.support_skills) {
          for (const sup of s.support_skills) {
            const supId = typeof sup === 'string' ? sup : sup.id
            expect(supId).toMatch(/^Metadata\/Items\/Gems?\//)
          }
        }
      }
    }
  })

  it('omits items entirely when no slots are filled in the fixture', () => {
    // The 90pcuxN4XtJG fixture has all slots empty (itemId=0).
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    expect(result.items).toBeUndefined()
  })

  it('disambiguates Flask 1 / Flask 2 to distinct inventory_ids', () => {
    // Regression: previously both mapped to "Flask" and collided in
    // builds that actually had flasks selected.
    const synthetic = {
      ...pob,
      items: {
        activeItemSet: 1,
        itemSets: [
          {
            id: 1,
            slots: [
              { name: 'Flask 1', itemId: 100 },
              { name: 'Flask 2', itemId: 101 }
            ]
          }
        ]
      }
    }
    const result = mapPobToBuild(synthetic, { passives: passivesLookup })
    const ids = (result.items ?? []).map((i) => i.inventory_id)
    expect(ids).toContain('Flask1')
    expect(ids).toContain('Flask2')
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
  })

  it('produces output that validates against @poe2-build-forge/schema', () => {
    const result = mapPobToBuild(pob, {
      passives: passivesLookup,
      ascendancies: ascendanciesLookup
    })
    const v = validate(result)
    if (!v.valid) {
      console.error('Validation errors:', JSON.stringify(v.errors, null, 2))
    }
    expect(v.valid).toBe(true)
  })
})
