import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { schema, validate } from '../src/index'

// Repo-root fixtures/ holds game-accepted .build files. These are GROUND
// TRUTH: the in-game planner and the pathofexile2.com account portal load
// them. If the schema rejects a file the game accepts, the schema is wrong.
const MOBALYTICS_DIR = fileURLToPath(
  new URL('../../../fixtures/mobalytics/', import.meta.url)
)

describe('@poe2-build-forge/schema validator', () => {
  it('validates the example build embedded in the schema', () => {
    expect(schema.examples).toBeDefined()
    expect(schema.examples?.length).toBeGreaterThan(0)

    const example = schema.examples![0]
    const result = validate(example)

    expect(result.errors).toBeNull()
    expect(result.valid).toBe(true)
  })

  const fixtures = readdirSync(MOBALYTICS_DIR).filter((f) =>
    f.endsWith('.build')
  )

  it('finds the Mobalytics ground-truth fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0)
  })

  it.each(fixtures)(
    'validates game-accepted Mobalytics fixture verbatim: %s',
    (file) => {
      const raw = JSON.parse(readFileSync(MOBALYTICS_DIR + file, 'utf-8'))
      const result = validate(raw)
      expect(result.errors).toBeNull()
      expect(result.valid).toBe(true)
    }
  )

  // The old converter emitted these; the fixtures prove the game never
  // uses them. The enum must reject them so a regression fails loudly.
  const rejectedInventoryIds = [
    'Offhand1',
    'Offhand2',
    'BodyArmour', // must be suffixed: BodyArmour1
    'Helm', // must be Helm1
    'Gloves', // must be Gloves1
    'Ring', // must be Ring1
    'Flask', // must be Flask1
    'Flask2', // flasks never increment
    'Charm2' // charms never increment
  ]

  it.each(rejectedInventoryIds)(
    'rejects non-vocabulary inventory_id: %s',
    (badId) => {
      const build = {
        name: 'x',
        inventory_slots: [{ inventory_id: badId, slot_x: 0, slot_y: 0 }]
      }
      const result = validate(build)
      expect(result.valid).toBe(false)
    }
  )

  const acceptedInventoryIds = [
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
  ]

  it.each(acceptedInventoryIds)('accepts vocabulary inventory_id: %s', (id) => {
    const build = {
      name: 'x',
      inventory_slots: [{ inventory_id: id, slot_x: 0, slot_y: 0 }]
    }
    const result = validate(build)
    expect(result.valid).toBe(true)
  })
})
