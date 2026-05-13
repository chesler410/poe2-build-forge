import { describe, it, expect } from 'vitest'
import type { BuildFile } from '@poe2-build-forge/core'
import { encodeBuildToHash, decodeHashToBuild } from '../src/shareLink'

describe('shareLink encode/decode', () => {
  it('round-trips a minimal build', () => {
    const build: BuildFile = { name: 'Test Build' }
    const hash = encodeBuildToHash(build)
    expect(hash.startsWith('b=')).toBe(true)
    expect(decodeHashToBuild('#' + hash)).toEqual(build)
  })

  it('round-trips a richly annotated build', () => {
    const build: BuildFile = {
      name: 'Ranger - Deadeye',
      description: '<underline>{<red>{Warning}}\nUse with caution.',
      ascendancy: 'Ranger2',
      passives: [
        'plain_passive',
        { id: 'lightning14', level_interval: [1, 50] },
        {
          id: 'AscendancyRanger1Notable3',
          weapon_set: 2,
          unique_name: 'Custom label',
          additional_text: '<green>{Allocate at level 25}'
        }
      ],
      skills: [
        'Metadata/Items/Gem/SkillGemSolarOrb',
        {
          id: 'Metadata/Items/Gem/SkillGemSigilOfPower',
          level_interval: [10, 100],
          support_skills: ['Metadata/Items/Gems/SupportGemBrutality']
        }
      ],
      items: [
        {
          inventory_id: 'Weapon1',
          slot_x: 0,
          slot_y: 0,
          unique_name: 'The Searing Touch'
        }
      ]
    }
    const hash = encodeBuildToHash(build)
    expect(decodeHashToBuild('#' + hash)).toEqual(build)
  })

  it('returns null for an empty hash', () => {
    expect(decodeHashToBuild('')).toBeNull()
    expect(decodeHashToBuild('#')).toBeNull()
  })

  it('returns null for a hash without the b= param', () => {
    expect(decodeHashToBuild('#foo=bar')).toBeNull()
  })

  it('returns null for a malformed base64url payload', () => {
    expect(decodeHashToBuild('#b=not_valid_base64!@#')).toBeNull()
  })

  it('accepts the hash with or without the leading #', () => {
    const build: BuildFile = { name: 'X' }
    const hash = encodeBuildToHash(build)
    expect(decodeHashToBuild(hash)).toEqual(build)
    expect(decodeHashToBuild('#' + hash)).toEqual(build)
  })

  it('compresses meaningfully — a large build fits in a reasonable URL', () => {
    // Roughly imitate a real Witchhunter build: 180 passives, dozens of
    // skills, items. Each entry is small but they add up. Compressed
    // hash should land well under 8KB (browsers tolerate >32KB but we
    // care about being civil).
    const passives = Array.from({ length: 180 }, (_, i) => ({
      id: `passive_${i}`,
      level_interval: [1, 100] as [number, number]
    }))
    const skills = Array.from({ length: 12 }, (_, i) => ({
      id: `Metadata/Items/Gem/SkillGem${i}`,
      support_skills: ['Metadata/Items/Gems/SupportGemBrutality']
    }))
    const build: BuildFile = {
      name: 'Big build',
      description: 'A test of compression headroom',
      passives,
      skills
    }
    const hash = encodeBuildToHash(build)
    expect(hash.length).toBeLessThan(8000)
    expect(decodeHashToBuild('#' + hash)).toEqual(build)
  })
})
