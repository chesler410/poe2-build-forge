import { describe, it, expect } from 'vitest'
import { parseItemAnnotation } from '../src/itemAnnotation'

describe('parseItemAnnotation', () => {
  it('returns null for undefined and empty inputs', () => {
    expect(parseItemAnnotation(undefined)).toBeNull()
    expect(parseItemAnnotation('')).toBeNull()
  })

  it('returns null when no rarity prefix is present', () => {
    expect(parseItemAnnotation('Just some free-form text')).toBeNull()
  })

  it('parses a RARE entry with quoted rolled name', () => {
    expect(
      parseItemAnnotation('RARE: Siege Crossbow ("Vengeance Core")')
    ).toEqual({
      rarity: 'RARE',
      baseType: 'Siege Crossbow',
      name: 'Vengeance Core'
    })
  })

  it('parses a RARE entry with multi-word base and name', () => {
    expect(
      parseItemAnnotation('RARE: Gladiatorial Helm ("Armageddon Horn")')
    ).toEqual({
      rarity: 'RARE',
      baseType: 'Gladiatorial Helm',
      name: 'Armageddon Horn'
    })
  })

  it('parses a MAGIC entry as a full affixed name without splitting', () => {
    expect(
      parseItemAnnotation('MAGIC: Soaked Stone Charm of the Foliage')
    ).toEqual({
      rarity: 'MAGIC',
      baseType: 'Soaked Stone Charm of the Foliage'
    })
  })

  it('parses a NORMAL entry as just the base type', () => {
    expect(parseItemAnnotation('NORMAL: Plate Belt')).toEqual({
      rarity: 'NORMAL',
      baseType: 'Plate Belt'
    })
  })

  it('parses a UNIQUE entry (rare in practice — unique_name is the canonical channel)', () => {
    expect(parseItemAnnotation('UNIQUE: The Searing Touch')).toEqual({
      rarity: 'UNIQUE',
      baseType: 'The Searing Touch'
    })
  })

  it('tolerates leading whitespace after the colon', () => {
    expect(parseItemAnnotation('RARE:   Plate Belt ("Spirit Strap")')).toEqual({
      rarity: 'RARE',
      baseType: 'Plate Belt',
      name: 'Spirit Strap'
    })
  })
})
