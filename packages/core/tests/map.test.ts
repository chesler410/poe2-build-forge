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
      // Each entry is either a shorthand string id (for nodes in the
      // first spec) or an object { id, level_interval } (for nodes
      // introduced in later specs). Both forms carry a GGG-format id.
      const id = typeof p === 'string' ? p : p.id
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_]+$/)
    }
  })

  it('derives level_interval per passive from PoB spec ordering', () => {
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    expect(result.passives).toBeDefined()

    const withIntervals = result.passives!.filter(
      (p): p is { id: string; level_interval?: [number, number] } =>
        typeof p !== 'string' && p.level_interval !== undefined
    )
    // The fixture has multiple specs, so we expect at least some
    // passives to carry a level_interval (those introduced after
    // the first spec).
    expect(withIntervals.length).toBeGreaterThan(0)

    for (const p of withIntervals) {
      const [start, end] = p.level_interval!
      expect(start).toBeGreaterThan(1)
      expect(start).toBeLessThanOrEqual(100)
      expect(end).toBe(100)
    }
  })

  it('emits shorthand strings for nodes that appear in the first spec', () => {
    // First-spec nodes should always show in-game from level 1, so
    // we emit them without a level_interval (shorthand string form).
    const result = mapPobToBuild(pob, { passives: passivesLookup })
    const shorthand = result.passives!.filter((p) => typeof p === 'string')
    expect(shorthand.length).toBeGreaterThan(0)
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

  it('treats ascendClassName "None" as no ascendancy', () => {
    // PoB stores the literal string "None" when the player has no
    // ascendancy selected. The mapper should not propagate it into
    // the build name or the ascendancy field.
    const noneBuild = {
      ...pob,
      build: {
        ...pob.build,
        className: 'Witch',
        ascendClassName: 'None'
      }
    }
    const result = mapPobToBuild(noneBuild, { passives: passivesLookup })
    expect(result.name).toBe('Witch')
    expect(result.ascendancy).toBeUndefined()
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
        ],
        catalog: {}
      }
    }
    const result = mapPobToBuild(synthetic, { passives: passivesLookup })
    const ids = (result.items ?? []).map((i) => i.inventory_id)
    expect(ids).toContain('Flask1')
    expect(ids).toContain('Flask2')
    expect(new Set(ids).size).toBe(ids.length) // no duplicates
  })

  it('emits unique_name when a slot references a unique in the catalog', () => {
    const synthetic = {
      ...pob,
      items: {
        activeItemSet: 1,
        itemSets: [
          { id: 1, slots: [{ name: 'Amulet', itemId: 1 }] }
        ],
        catalog: {
          '1': {
            id: 1,
            rarity: 'UNIQUE',
            name: 'Seed of Cataclysm',
            baseType: 'Lazuli Ring'
          }
        }
      }
    }
    const result = mapPobToBuild(synthetic, { passives: passivesLookup })
    expect(result.items).toHaveLength(1)
    expect(result.items![0].unique_name).toBe('Seed of Cataclysm')
    expect(result.items![0].additional_text).toBeUndefined()
  })

  it('emits additional_text with rarity+base for non-unique items', () => {
    const synthetic = {
      ...pob,
      items: {
        activeItemSet: 1,
        itemSets: [
          { id: 1, slots: [{ name: 'Helmet', itemId: 1 }] }
        ],
        catalog: {
          '1': {
            id: 1,
            rarity: 'RARE',
            name: 'Soul Whisper Maw',
            baseType: 'Cultist Crown'
          }
        }
      }
    }
    const result = mapPobToBuild(synthetic, { passives: passivesLookup })
    expect(result.items![0].unique_name).toBeUndefined()
    expect(result.items![0].additional_text).toContain('RARE')
    expect(result.items![0].additional_text).toContain('Cultist Crown')
  })

  it('emits additional_text without metadata leakage for magic items', () => {
    // Regression: previously the parser took line+2 as the base type
    // for every rarity, but MAGIC items have no separate base-type
    // line — line+2 is "Unique ID: ..." metadata. Result was nonsense
    // like 'MAGIC: Unique ID: 63727b... ("Bubbling Ultimate Life Flask
    // of the Ample")'.
    const synthetic = {
      ...pob,
      items: {
        activeItemSet: 1,
        itemSets: [
          { id: 1, slots: [{ name: 'Flask 1', itemId: 1 }] }
        ],
        catalog: {
          '1': {
            id: 1,
            rarity: 'MAGIC',
            name: 'Bubbling Ultimate Life Flask of the Ample',
            // Parser correctly leaves baseType empty for magic items.
            baseType: ''
          }
        }
      }
    }
    const result = mapPobToBuild(synthetic, { passives: passivesLookup })
    expect(result.items![0].additional_text).toBe(
      'MAGIC: Bubbling Ultimate Life Flask of the Ample'
    )
    expect(result.items![0].additional_text).not.toContain('Unique ID')
  })

  it('emits bare slot entry when catalog lookup misses (corrupt or out-of-sync data)', () => {
    const synthetic = {
      ...pob,
      items: {
        activeItemSet: 1,
        itemSets: [
          { id: 1, slots: [{ name: 'Belt', itemId: 999 }] }
        ],
        catalog: {} // itemId 999 not present
      }
    }
    const result = mapPobToBuild(synthetic, { passives: passivesLookup })
    expect(result.items).toHaveLength(1)
    expect(result.items![0].inventory_id).toBe('Belt')
    expect(result.items![0].unique_name).toBeUndefined()
    expect(result.items![0].additional_text).toBeUndefined()
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
