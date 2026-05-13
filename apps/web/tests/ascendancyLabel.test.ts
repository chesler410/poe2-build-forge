import { describe, it, expect } from 'vitest'
import type { AscendancyLookup } from '@poe2-build-forge/core'
import { formatAscendancy } from '../src/ascendancyLabel'

const LOOKUP: AscendancyLookup = {
  Mercenary1: { name: 'Tactician', class_number: 1 },
  Mercenary2: { name: 'Witchhunter', class_number: 2 },
  Mercenary3: { name: 'Gemling Legionnaire', class_number: 3 },
  Ranger1: { name: 'Deadeye', class_number: 1 },
  Ranger2: { name: 'Pathfinder', class_number: 2 },
  Druid1: { name: 'Oracle', class_number: 1 },
  Druid2: { name: 'Shaman', class_number: 2 }
}

describe('formatAscendancy', () => {
  it('resolves a GGG-format key into "Display (Parent)"', () => {
    expect(formatAscendancy('Mercenary2', LOOKUP)).toBe('Witchhunter (Mercenary)')
    expect(formatAscendancy('Druid1', LOOKUP)).toBe('Oracle (Druid)')
  })

  it('handles multi-digit ascendancy keys (unlikely but safe)', () => {
    const lookup: AscendancyLookup = {
      Witch12: { name: 'Test Ascendancy', class_number: 12 }
    }
    expect(formatAscendancy('Witch12', lookup)).toBe(
      'Test Ascendancy (Witch)'
    )
  })

  it('resolves a display name (PoB passthrough) into "Display (Parent)"', () => {
    expect(formatAscendancy('Witchhunter', LOOKUP)).toBe(
      'Witchhunter (Mercenary)'
    )
    expect(formatAscendancy('Pathfinder', LOOKUP)).toBe('Pathfinder (Ranger)')
  })

  it('returns the raw value when no lookup is provided', () => {
    expect(formatAscendancy('Witchhunter', null)).toBe('Witchhunter')
    expect(formatAscendancy('Witchhunter', undefined)).toBe('Witchhunter')
  })

  it('returns the raw value when the lookup has no matching entry', () => {
    expect(formatAscendancy('UnknownAscendancy', LOOKUP)).toBe(
      'UnknownAscendancy'
    )
  })

  it('returns an empty string for an empty input', () => {
    expect(formatAscendancy('', LOOKUP)).toBe('')
  })
})
