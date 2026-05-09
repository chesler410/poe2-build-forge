import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePobXml } from '../src/parse'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureXml = readFileSync(
  join(here, 'fixtures/pob-90pcuxN4XtJG.xml'),
  'utf8'
)

describe('parsePobXml', () => {
  it('parses the Build header attributes', () => {
    const result = parsePobXml(fixtureXml)
    expect(result.build.className).toBe('Ranger')
    expect(result.build.ascendClassName).toBe('Deadeye')
    expect(result.build.level).toBe(89)
    expect(result.build.targetVersion).toBe('0_1')
    expect(result.build.characterLevelAutoMode).toBe(true)
  })

  it('parses computed PlayerStats as numbers', () => {
    const result = parsePobXml(fixtureXml)
    expect(result.build.stats.length).toBeGreaterThan(0)
    const life = result.build.stats.find((s) => s.stat === 'Life')
    expect(life).toBeDefined()
    expect(typeof life!.value).toBe('number')
  })

  it('parses Tree with at least one Spec containing node IDs', () => {
    const result = parsePobXml(fixtureXml)
    expect(result.tree).toBeDefined()
    expect(result.tree!.specs.length).toBeGreaterThan(0)

    const firstSpec = result.tree!.specs[0]
    expect(firstSpec.nodes.length).toBeGreaterThan(0)
    expect(firstSpec.nodes.every((n) => Number.isInteger(n))).toBe(true)
  })

  it('parses weapon-set node arrays from the active spec', () => {
    const result = parsePobXml(fixtureXml)
    const spec = result.tree!.specs[0]
    expect(Array.isArray(spec.weaponSet1Nodes)).toBe(true)
    expect(Array.isArray(spec.weaponSet2Nodes)).toBe(true)
  })

  it('parses Skills with gems carrying GGG-format gemIds', () => {
    const result = parsePobXml(fixtureXml)
    expect(result.skills).toBeDefined()
    expect(result.skills!.skillSets.length).toBeGreaterThan(0)

    const firstSkillSet = result.skills!.skillSets[0]
    expect(firstSkillSet.skills.length).toBeGreaterThan(0)

    const firstGem = firstSkillSet.skills[0].gems[0]
    expect(firstGem.gemId).toMatch(/^Metadata\/Items\/Gems?\//)
    expect(firstGem.nameSpec.length).toBeGreaterThan(0)
  })

  it('parses Items with item-sets containing slots', () => {
    const result = parsePobXml(fixtureXml)
    expect(result.items).toBeDefined()
    expect(result.items!.itemSets.length).toBeGreaterThan(0)

    const slots = result.items!.itemSets[0].slots
    const slotNames = slots.map((s) => s.name)
    expect(slotNames).toEqual(expect.arrayContaining(['Weapon 1', 'Helmet']))
  })

  it('throws on a non-PathOfBuilding2 root', () => {
    expect(() => parsePobXml('<PathOfBuilding></PathOfBuilding>')).toThrow(
      /PathOfBuilding2/
    )
  })
})
