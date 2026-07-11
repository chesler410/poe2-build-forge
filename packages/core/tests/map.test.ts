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

// Real 0.5 Sorceress/Stormweaver export (CoC Comet), fully equipped.
// Used to verify inventory_id vocabulary against game-accepted output.
const stormweaver = parsePobXml(
  readFileSync(join(here, 'fixtures/pob-stormweaver.xml'), 'utf8')
)

// The exact game vocabulary, verified from repo fixtures/. Mirrors the
// schema enum; kept here so the mapper is checked independently.
const INVENTORY_VOCAB = new Set([
  'Weapon1',
  'Weapon2',
  'Helm1',
  'BodyArmour1',
  'Gloves1',
  'Boots1',
  'Amulet1',
  'Belt1',
  'Ring1',
  'Ring2',
  'Charm1',
  'Flask1'
])

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

// Most assertions only care about the produced build. mapPobToBuild now
// returns { build, warnings }; this helper keeps those tests focused.
const mapBuild = (
  pobDoc: Parameters<typeof mapPobToBuild>[0],
  opts: Parameters<typeof mapPobToBuild>[1]
) => mapPobToBuild(pobDoc, opts).build

describe('mapPobToBuild', () => {
  it('produces a build with a derived name when none provided', () => {
    const result = mapBuild(pob, { passives: passivesLookup })
    expect(result.name).toBe('Ranger - Deadeye')
  })

  it('honours an explicit name override', () => {
    const result = mapBuild(pob, {
      passives: passivesLookup,
      name: 'My custom name'
    })
    expect(result.name).toBe('My custom name')
  })

  it('passes through ascendClassName when no ascendancy lookup is given', () => {
    const result = mapBuild(pob, { passives: passivesLookup })
    expect(result.ascendancy).toBe('Deadeye')
  })

  it('resolves the GGG-format ascendancy key when lookup is given', () => {
    const result = mapBuild(pob, {
      passives: passivesLookup,
      ascendancies: ascendanciesLookup
    })
    // For Ranger / Deadeye the dev-docs format key should start with "Ranger"
    // and be followed by a digit (the ordinal in PoE2).
    expect(result.ascendancy).toMatch(/^Ranger\d+$/)
  })

  it('translates PoB tree integer ids into GGG passive ids', () => {
    const result = mapBuild(pob, { passives: passivesLookup })
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
    const result = mapBuild(pob, { passives: passivesLookup })
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
    const result = mapBuild(pob, { passives: passivesLookup })
    const shorthand = result.passives!.filter((p) => typeof p === 'string')
    expect(shorthand.length).toBeGreaterThan(0)
  })

  it('emits skills as gem-id strings or {id, support_skills} objects', () => {
    const result = mapBuild(pob, { passives: passivesLookup })
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

  it('dedupes identical skill groups socketed more than once', () => {
    // Regression: PoB can socket the same gem in multiple groups (e.g.
    // across weapon sets), which emitted the same hint twice in-game.
    // Identical groups collapse; a different setup of the same gem stays.
    const gem = (gemId: string) => ({
      gemId,
      variantId: '',
      nameSpec: '',
      skillId: '',
      level: 1,
      quality: 0,
      enabled: true
    })
    const synthetic = {
      ...pob,
      skills: {
        activeSkillSet: 1,
        skillSets: [
          {
            id: 1,
            title: '',
            skills: [
              { enabled: true, gems: [gem('Metadata/Items/Gem/SkillGemDemonForm')] },
              { enabled: true, gems: [gem('Metadata/Items/Gem/SkillGemDemonForm')] },
              { enabled: true, gems: [gem('Metadata/Items/Gems/SkillGemSpark')] }
            ]
          }
        ]
      }
    }
    const result = mapBuild(synthetic, { passives: passivesLookup })
    const ids = (result.skills ?? []).map((s) => (typeof s === 'string' ? s : s.id))
    expect(ids).toEqual([
      'Metadata/Items/Gem/SkillGemDemonForm',
      'Metadata/Items/Gems/SkillGemSpark'
    ])
  })

  it('emits jewel-socket nodes instead of dropping them (ground truth includes them)', () => {
    // Game-accepted .build files carry jewel-socket passive entries.
    // The mapper used to skip is_jewel_socket nodes, silently losing them.
    const { build, warnings } = mapPobToBuild(stormweaver, {
      passives: passivesLookup
    })
    const source = stormweaver.tree!.specs.at(-1)!.nodes.length
    const emitted = build.passives!.length

    // Nothing unmapped for this fixture: every source node is emitted.
    expect(warnings).toEqual([])
    expect(emitted).toBe(source)
  })

  it('surfaces unmapped nodes as warnings rather than dropping them silently', () => {
    // A node id absent from the lookup (e.g. stale tree data) must be
    // reported, not swallowed.
    const synthetic = {
      ...stormweaver,
      tree: {
        specs: [
          {
            title: '',
            nodes: [999999001, 999999002],
            treeVersion: '0_5',
            weaponSet1Nodes: [],
            weaponSet2Nodes: []
          }
        ]
      }
    } as typeof stormweaver
    const { build, warnings } = mapPobToBuild(synthetic, {
      passives: passivesLookup
    })
    expect(build.passives ?? []).toHaveLength(0)
    expect(warnings).toEqual([
      { type: 'unmapped_node', pobId: 999999001 },
      { type: 'unmapped_node', pobId: 999999002 }
    ])
  })

  it('keeps the count invariant: emitted + unmapped == source nodes', () => {
    const { build, warnings } = mapPobToBuild(stormweaver, {
      passives: passivesLookup
    })
    const source = stormweaver.tree!.specs.at(-1)!.nodes.length
    const emitted = build.passives!.length
    expect(emitted + warnings.length).toBe(source)
  })

  it('tags weapon-set-specific passives with weapon_set 1 or 2', () => {
    // PoB2 stores per-weapon-set allocations in <WeaponSet1>/<WeaponSet2>
    // (parser: weaponSet1Nodes / weaponSet2Nodes). Nodes in neither set are
    // shared and carry no weapon_set. Verified value scheme (repo fixtures):
    // weapon_set is 1 or 2, never 0.
    const entry = (id: string) => ({
      id,
      name: id,
      is_notable: false,
      is_keystone: false,
      is_jewel_socket: false,
      ascendancy: ''
    })
    const lookup: PassiveLookup = {
      '10': entry('shared_node'),
      '11': entry('set_one_node'),
      '12': entry('set_two_node')
    }
    const spec = {
      title: '',
      treeVersion: '0_5',
      classId: 0,
      classInternalId: 0,
      ascendClassId: 0,
      ascendancyInternalId: '',
      nodes: [10, 11, 12],
      weaponSet1Nodes: [11],
      weaponSet2Nodes: [12]
    }
    const synthetic = {
      ...stormweaver,
      tree: { activeSpec: 1, specs: [spec] }
    } as typeof stormweaver

    const { build } = mapPobToBuild(synthetic, { passives: lookup })
    const wsById = new Map<string, number | undefined>(
      build.passives!.map((p) =>
        typeof p === 'string' ? [p, undefined] : [p.id, p.weapon_set]
      )
    )
    expect(wsById.get('shared_node')).toBeUndefined()
    expect(wsById.get('set_one_node')).toBe(1)
    expect(wsById.get('set_two_node')).toBe(2)
  })

  it('emits weapon_set tags for the real Stormweaver fixture', () => {
    const { build } = mapPobToBuild(stormweaver, { passives: passivesLookup })
    const objects = build.passives!.filter(
      (p): p is Exclude<typeof p, string> => typeof p !== 'string'
    )
    const ws1 = objects.filter((p) => p.weapon_set === 1)
    const ws2 = objects.filter((p) => p.weapon_set === 2)
    // The fixture's <WeaponSet1> has 24 nodes; <WeaponSet2> resolves to 23
    // after PoB's anoint marker (3663c) is excluded by the parser.
    expect(ws1.length).toBe(24)
    expect(ws2.length).toBe(23)
    // weapon_set is always 1 or 2, never 0.
    for (const p of objects) {
      if (p.weapon_set !== undefined) expect([1, 2]).toContain(p.weapon_set)
    }
  })

  it('maps the Stormweaver fixture slots to the game inventory vocabulary', () => {
    const result = mapBuild(stormweaver, { passives: passivesLookup })
    const ids = (result.inventory_slots ?? []).map((i) => i.inventory_id)

    expect(ids.length).toBeGreaterThan(0)
    // Every emitted id must be in the verified game vocabulary.
    for (const id of ids) expect(INVENTORY_VOCAB.has(id)).toBe(true)

    // Suffixed armour + jewellery, never bare, never Offhand.
    expect(ids).toContain('Helm1')
    expect(ids).toContain('BodyArmour1')
    expect(ids).toContain('Gloves1')
    expect(ids).toContain('Boots1')
    expect(ids).toContain('Amulet1')
    expect(ids).toContain('Belt1')
    expect(ids).toContain('Ring1')
    expect(ids).toContain('Ring2')

    // Weapon1 = set I; Weapon2 = the swap-set weapon (this build has a
    // populated "Weapon 1 Swap" but an empty "Weapon 2").
    expect(ids).toContain('Weapon1')
    expect(ids).toContain('Weapon2')

    // The build has three charms — all collapse to Charm1 (no Charm2/3).
    expect(ids.filter((id) => id === 'Charm1').length).toBe(3)
    expect(ids).not.toContain('Charm2')
    expect(ids).not.toContain('Charm3')

    // One flask populated -> Flask1 (never Flask2, never Offhand).
    expect(ids).toContain('Flask1')
    expect(ids).not.toContain('Flask2')
    expect(ids.some((id) => id.startsWith('Offhand'))).toBe(false)
  })

  it('produces schema-valid output from the Stormweaver fixture', () => {
    const result = mapBuild(stormweaver, { passives: passivesLookup })
    const v = validate(result)
    if (!v.valid) console.error(JSON.stringify(v.errors, null, 2))
    expect(v.valid).toBe(true)
  })

  it('omits items entirely when no slots are filled in the fixture', () => {
    // The 90pcuxN4XtJG fixture has all slots empty (itemId=0).
    const result = mapBuild(pob, { passives: passivesLookup })
    expect(result.inventory_slots).toBeUndefined()
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
    const result = mapBuild(noneBuild, { passives: passivesLookup })
    expect(result.name).toBe('Witch')
    expect(result.ascendancy).toBeUndefined()
  })

  it('collapses every flask to Flask1 (the game never increments flasks)', () => {
    // Ground truth (repo fixtures/) shows two flask slots both emit
    // inventory_id "Flask1". The old converter emitted Flask1/Flask2;
    // that vocabulary is not what the game uses.
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
    const result = mapBuild(synthetic, { passives: passivesLookup })
    const ids = (result.inventory_slots ?? []).map((i) => i.inventory_id)
    expect(ids).toEqual(['Flask1', 'Flask1'])
  })

  it('collapses every charm to Charm1 (the game never increments charms)', () => {
    const synthetic = {
      ...pob,
      items: {
        activeItemSet: 1,
        itemSets: [
          {
            id: 1,
            slots: [
              { name: 'Charm 1', itemId: 100 },
              { name: 'Charm 2', itemId: 101 },
              { name: 'Charm 3', itemId: 102 }
            ]
          }
        ],
        catalog: {}
      }
    }
    const result = mapBuild(synthetic, { passives: passivesLookup })
    const ids = (result.inventory_slots ?? []).map((i) => i.inventory_id)
    expect(ids).toEqual(['Charm1', 'Charm1', 'Charm1'])
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
    const result = mapBuild(synthetic, { passives: passivesLookup })
    expect(result.inventory_slots).toHaveLength(1)
    expect(result.inventory_slots![0].unique_name).toBe('Seed of Cataclysm')
    expect(result.inventory_slots![0].additional_text).toBeUndefined()
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
    const result = mapBuild(synthetic, { passives: passivesLookup })
    expect(result.inventory_slots![0].unique_name).toBeUndefined()
    expect(result.inventory_slots![0].additional_text).toContain('RARE')
    expect(result.inventory_slots![0].additional_text).toContain('Cultist Crown')
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
    const result = mapBuild(synthetic, { passives: passivesLookup })
    expect(result.inventory_slots![0].additional_text).toBe(
      'MAGIC: Bubbling Ultimate Life Flask of the Ample'
    )
    expect(result.inventory_slots![0].additional_text).not.toContain('Unique ID')
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
    const result = mapBuild(synthetic, { passives: passivesLookup })
    expect(result.inventory_slots).toHaveLength(1)
    expect(result.inventory_slots![0].inventory_id).toBe('Belt1')
    expect(result.inventory_slots![0].unique_name).toBeUndefined()
    expect(result.inventory_slots![0].additional_text).toBeUndefined()
  })

  it('produces output that validates against @poe2-build-forge/schema', () => {
    const result = mapBuild(pob, {
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
