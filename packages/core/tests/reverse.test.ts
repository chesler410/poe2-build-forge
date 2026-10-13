/**
 * Reverse export: .build → Path of Building share code.
 *
 * Round-trip keeps allocated node ids and socket groups. Items may
 * differ: the .build format stores slot hints as free text, so the
 * reverse path does not emit Path of Building items.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePobCode, encodePobCode } from '../src/decode'
import { parsePobXml } from '../src/parse'
import { mapPobToBuild } from '../src/map'
import { mapBuildToPob } from '../src/reverse'
import type { AscendancyLookup, PassiveLookup } from '../src/map'
import type { CharacterEntry } from '../src/reverse'
import type { BuildFile, BuildSkill, PathOfBuilding2, Skill } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))

const passives = JSON.parse(
  readFileSync(join(here, '../data/pruned/passives_default.json'), 'utf8')
) as PassiveLookup
const ascendancies = JSON.parse(
  readFileSync(join(here, '../data/pruned/ascendancies.json'), 'utf8')
) as AscendancyLookup
const characters = JSON.parse(
  readFileSync(join(here, '../data/pruned/characters.json'), 'utf8')
) as CharacterEntry[]

const lookups = { passives, ascendancies, characters }

function readXml(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf8')
}

/** Socket groups the forward mapper keeps: enabled groups, exact repeats dropped. */
function socketGroups(pob: PathOfBuilding2): string[][] {
  if (!pob.skills) return []
  const skillSet =
    pob.skills.skillSets.find((s) => s.id === pob.skills!.activeSkillSet) ??
    pob.skills.skillSets[pob.skills.activeSkillSet - 1] ??
    pob.skills.skillSets[0]
  if (!skillSet) return []

  const out: string[][] = []
  const seen = new Set<string>()
  for (const skill of skillSet.skills) {
    const ids = groupIds(skill)
    if (!ids) continue
    const key = ids[0] + '|' + ids.slice(1).join(',')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ids)
  }
  return out
}

function groupIds(skill: Skill): string[] | undefined {
  if (!skill.enabled || skill.gems.length === 0) return undefined
  const main = skill.gems[0]
  if (!main?.gemId) return undefined
  const supports = skill.gems
    .slice(1)
    .filter((gem) => gem.enabled && gem.gemId)
    .map((gem) => gem.gemId)
  return [main.gemId, ...supports]
}

function groupsFromBuild(build: BuildFile): string[][] {
  return (build.skills ?? []).map((skill) => {
    if (typeof skill === 'string') return [skill]
    return [skill.id, ...supportIds(skill)]
  })
}

function supportIds(skill: Exclude<BuildSkill, string>): string[] {
  return (skill.support_skills ?? []).map((support) =>
    typeof support === 'string' ? support : support.id
  )
}

describe('encodePobCode', () => {
  it('round-trips XML through the same wire format decodePobCode reads', () => {
    const xml = readXml('pob-90pcuxN4XtJG.xml')
    expect(decodePobCode(encodePobCode(xml))).toBe(xml)
  })
})

describe('PoB → .build → PoB', () => {
  const fixtures = [
    'pob-90pcuxN4XtJG.xml',
    'pob-L39C--IgzGad.xml',
    'pob-stormweaver.xml'
  ]

  for (const fixture of fixtures) {
    describe(fixture, () => {
      const original = parsePobXml(readXml(fixture))
      const { build, warnings } = mapPobToBuild(original, lookups)
      const exported = mapBuildToPob(build, lookups)
      const round = parsePobXml(decodePobCode(exported.code))
      const unmapped = new Set(warnings.map((warning) => warning.pobId))
      const finalSpec = original.tree!.specs.at(-1)!
      const mappedNodes = finalSpec.nodes.filter((id) => !unmapped.has(id))

      it('preserves allocated node ids', () => {
        expect(new Set(round.tree!.specs[0].nodes)).toEqual(new Set(mappedNodes))
      })

      it('preserves weapon-set allocations', () => {
        const mapped = new Set(mappedNodes)
        expect(new Set(round.tree!.specs[0].weaponSet1Nodes)).toEqual(
          new Set(finalSpec.weaponSet1Nodes.filter((id) => mapped.has(id)))
        )
        expect(new Set(round.tree!.specs[0].weaponSet2Nodes)).toEqual(
          new Set(finalSpec.weaponSet2Nodes.filter((id) => mapped.has(id)))
        )
      })

      it('preserves socket groups', () => {
        expect(socketGroups(round)).toEqual(groupsFromBuild(build))
        expect(socketGroups(round)).toEqual(socketGroups(original))
      })

      it('does not reconstruct items', () => {
        // Items may differ. Slot hints stay in notes; no PoB item catalog
        // is emitted, even when the source export had real items.
        expect(exported.report.equipment.reconstructed).toBe(false)
        expect(exported.report.equipment.message).toContain(
          'Equipment was not reconstructed'
        )
        expect(round.items).toBeUndefined()
        expect(round.notes).toContain('Equipment was not reconstructed')
      })
    })
  }
})

describe('real .build with object passives and support gems', () => {
  const build = JSON.parse(
    readFileSync(
      join(
        here,
        '../../../fixtures/character/ENDGAME COC COMET - Annotated v2 (Ches).build'
      ),
      'utf8'
    )
  ) as BuildFile
  const exported = mapBuildToPob(build, lookups)
  const parsed = parsePobXml(decodePobCode(exported.code))

  it('accepts the share code and allocates intelligence49 as node 1433', () => {
    expect(parsed.build.className).toBe('Sorceress')
    expect(parsed.tree!.specs[0].nodes).toContain(1433)
    expect(exported.report.passives.converted).toContainEqual(
      expect.objectContaining({ id: 'intelligence49', pobId: 1433 })
    )
  })

  it('puts support gems in the same socket group as the active skill', () => {
    expect(socketGroups(parsed)).toEqual(groupsFromBuild(build))
    const sigil = socketGroups(parsed).find((group) =>
      group[0].endsWith('SkillGemSigilOfPower')
    )
    expect(sigil).toEqual([
      'Metadata/Items/Gems/SkillGemSigilOfPower',
      'Metadata/Items/Gems/SupportGemInspiration',
      'Metadata/Items/Gems/SupportGemPersistenceTwo',
      'Metadata/Items/Gems/SupportGemMagnifiedEffectTwo'
    ])
  })

  it('records unique names in notes and does not rebuild equipment', () => {
    expect(exported.report.equipment.reconstructed).toBe(false)
    expect(exported.report.equipment.message).toContain(
      'Equipment was not reconstructed'
    )
    expect(parsed.items).toBeUndefined()
    expect(parsed.notes).toContain("Gloves1: Maligaro's Virtuosity")
    expect(parsed.notes).not.toContain('Rarity: RARE')
  })
})

describe('mapBuildToPob', () => {
  it('uses the start of level_interval as the gem level', () => {
    const exported = mapBuildToPob(
      {
        name: 'Gems',
        skills: [
          {
            id: 'Metadata/Items/Gems/SkillGemSpark',
            level_interval: [15, 100],
            support_skills: [
              {
                id: 'Metadata/Items/Gems/SupportGemPinpointCritical',
                level_interval: [1, 100]
              }
            ]
          }
        ]
      },
      lookups
    )
    const gems = exported.pob.skills!.skillSets[0].skills[0].gems
    expect(gems.map((gem) => [gem.gemId, gem.level])).toEqual([
      ['Metadata/Items/Gems/SkillGemSpark', 15],
      ['Metadata/Items/Gems/SupportGemPinpointCritical', 1]
    ])
  })

  it('reports a passive with no node instead of inventing an id', () => {
    const exported = mapBuildToPob(
      {
        name: 'Partial',
        passives: ['not_a_real_node', { id: 'intelligence49' }, 'intelligence49']
      },
      lookups
    )
    expect(exported.report.passives.skipped).toEqual([
      { id: 'not_a_real_node', reason: 'unknown_passive' }
    ])
    expect(exported.pob.tree!.specs[0].nodes).toEqual([1433])
  })

  it('resolves Witch3b from the class name, not by stripping digits', () => {
    const exported = mapBuildToPob(
      { name: 'Lich', ascendancy: 'Witch3b' },
      lookups
    )
    const spec = exported.pob.tree!.specs[0]
    expect(exported.pob.build.className).toBe('Witch')
    expect(exported.pob.build.ascendClassName).toBe('Abyssal Lich')
    expect(spec.classId).toBe(1)
    expect(spec.classInternalId).toBe(1)
    expect(spec.ascendClassId).toBe(6)
    expect(spec.ascendancyInternalId).toBe('Witch3b')
    expect(exported.report.ascendancy.recognized).toBe(true)
  })

  it('keeps weapon-set nodes on the matching set', () => {
    const exported = mapBuildToPob(
      {
        name: 'Sets',
        passives: [
          { id: 'intelligence49', weapon_set: 1 },
          { id: 'energy_shield15', weapon_set: 2 }
        ]
      },
      lookups
    )
    const spec = exported.pob.tree!.specs[0]
    expect(spec.nodes).toEqual([1433, 44871])
    expect(spec.weaponSet1Nodes).toEqual([1433])
    expect(spec.weaponSet2Nodes).toEqual([44871])
  })
})
