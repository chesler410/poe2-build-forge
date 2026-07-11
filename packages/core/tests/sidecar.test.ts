import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractSidecar, composeSidecar } from '../src/sidecar'
import type { BuildFile } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))
const annotated = JSON.parse(
  readFileSync(
    join(
      here,
      '../../../fixtures/character/ENDGAME COC COMET - Annotated v2 (Ches).build'
    ),
    'utf8'
  )
) as BuildFile

// A fresh conversion has no annotations. Simulate one from the annotated
// build by stripping every additional_text plus name/description. Same
// structure and keys, just no annotations — the exact thing compose must
// re-apply.
function stripAnnotations(build: BuildFile): BuildFile {
  const clone = JSON.parse(JSON.stringify(build)) as BuildFile
  delete clone.description
  clone.name = 'FRESH CONVERSION'
  const scrub = (e: unknown) => {
    if (e && typeof e === 'object') delete (e as { additional_text?: string }).additional_text
  }
  for (const p of clone.passives ?? []) scrub(p)
  for (const s of clone.skills ?? []) {
    scrub(s)
    if (typeof s === 'object') for (const sup of s.support_skills ?? []) scrub(sup)
  }
  for (const i of clone.inventory_slots ?? []) scrub(i)
  return clone
}

describe('sidecar extract/compose', () => {
  it('round-trips: compose(strip(build), extract(build)) === build', () => {
    const sidecar = extractSidecar(annotated)
    const restored = composeSidecar(stripAnnotations(annotated), sidecar)
    expect(restored).toEqual(annotated)
  })

  it('is idempotent: composing twice equals composing once', () => {
    const sidecar = extractSidecar(annotated)
    const base = stripAnnotations(annotated)
    const once = composeSidecar(base, sidecar)
    const twice = composeSidecar(once, sidecar)
    expect(twice).toEqual(once)
  })

  it('is deterministic: extract is stable across runs', () => {
    expect(extractSidecar(annotated)).toEqual(extractSidecar(annotated))
  })

  it('captures top-level name and description', () => {
    const sidecar = extractSidecar(annotated)
    expect(sidecar.name).toBe(annotated.name)
    expect(sidecar.description).toBe(annotated.description)
  })

  it('keys duplicate inventory slots by ordinal so the right one is targeted', () => {
    // The build has three Charm1 slots but only the second is annotated;
    // its key must carry the ordinal (#1) so compose applies it to that
    // slot, not the first or third.
    const sidecar = extractSidecar(annotated)
    const charmKeys = Object.keys(sidecar.inventory ?? {}).filter((k) =>
      k.startsWith('Charm1')
    )
    expect(charmKeys).toEqual(['Charm1#1'])

    // Verify it lands on the second Charm1 after a round-trip.
    const restored = composeSidecar(stripAnnotations(annotated), sidecar)
    const charms = (restored.inventory_slots ?? []).filter(
      (i) => i.inventory_id === 'Charm1'
    )
    expect(charms[0].additional_text).toBeUndefined()
    expect(charms[1].additional_text).toContain('Stone Charm')
    expect(charms[2].additional_text).toBeUndefined()
  })

  it('upgrades a shorthand-string passive to object form when annotated', () => {
    const base: BuildFile = { name: 'b', passives: ['lightning14'] }
    const composed = composeSidecar(base, {
      passives: { lightning14: { additional_text: 'take this early' } }
    })
    expect(composed.passives).toEqual([
      { id: 'lightning14', additional_text: 'take this early' }
    ])
  })

  it('keys passives by id + weapon_set, disambiguating collisions', () => {
    const base: BuildFile = {
      name: 'b',
      passives: [
        { id: 'int1' },
        { id: 'int1', weapon_set: 2 },
        { id: 'int1' }
      ]
    }
    const sidecar = extractSidecar({
      name: 'b',
      passives: [
        { id: 'int1', additional_text: 'first shared' },
        { id: 'int1', weapon_set: 2, additional_text: 'set two' },
        { id: 'int1', additional_text: 'second shared' }
      ]
    })
    // Distinct keys: shared collisions get #0/#1, weapon_set is part of identity.
    expect(new Set(Object.keys(sidecar.passives ?? {}))).toEqual(
      new Set(['int1#0', 'int1@2', 'int1#1'])
    )
    const composed = composeSidecar(base, sidecar)
    expect(composed.passives).toEqual([
      { id: 'int1', additional_text: 'first shared' },
      { id: 'int1', weapon_set: 2, additional_text: 'set two' },
      { id: 'int1', additional_text: 'second shared' }
    ])
  })

  it('ignores sidecar entries with no matching base node', () => {
    const base: BuildFile = { name: 'b', passives: ['a'] }
    const composed = composeSidecar(base, {
      passives: { nonexistent: { additional_text: 'x' } }
    })
    expect(composed.passives).toEqual(['a'])
  })
})
