import { describe, it, expect } from 'vitest'
import { passivePrefix, prefixLabel } from '../src/passiveGroup'

describe('passivePrefix', () => {
  it('strips trailing digits', () => {
    expect(passivePrefix('intelligence41')).toBe('intelligence')
  })

  it('strips trailing digits + underscores', () => {
    expect(passivePrefix('intelligence41__')).toBe('intelligence')
    expect(passivePrefix('two_handed5_')).toBe('two_handed')
  })

  it('strips trailing digits + dashes', () => {
    expect(passivePrefix('attributes20-')).toBe('attributes')
  })

  it('preserves internal underscores', () => {
    expect(passivePrefix('armour_and_evasion27')).toBe('armour_and_evasion')
    expect(passivePrefix('slow_mitigation11')).toBe('slow_mitigation')
  })

  it('handles ignite_mitigation-style multi-word prefixes', () => {
    expect(passivePrefix('ignite_mitigation12')).toBe('ignite_mitigation')
  })

  it('groups notable / keystone names with their family', () => {
    expect(passivePrefix('duelist_mercenary_notable1')).toBe(
      'duelist_mercenary_notable'
    )
  })

  it('returns the id unchanged when there are no trailing digits', () => {
    expect(passivePrefix('passive_keystone_zeal')).toBe('passive_keystone_zeal')
  })
})

describe('prefixLabel', () => {
  it('Title-Cases single-word prefixes', () => {
    expect(prefixLabel('intelligence')).toBe('Intelligence')
  })

  it('replaces underscores with spaces and Title-Cases each word', () => {
    expect(prefixLabel('armour_and_evasion')).toBe('Armour And Evasion')
    expect(prefixLabel('two_handed')).toBe('Two Handed')
  })

  it('handles a long compound prefix', () => {
    expect(prefixLabel('duelist_mercenary_notable')).toBe(
      'Duelist Mercenary Notable'
    )
  })
})
