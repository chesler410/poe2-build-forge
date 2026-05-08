import { describe, it, expect } from 'vitest'
import { schema, validate } from '../src/index'

describe('@poe2-build-forge/schema validator', () => {
  it('validates the example build embedded in the schema', () => {
    expect(schema.examples).toBeDefined()
    expect(schema.examples?.length).toBeGreaterThan(0)

    const example = schema.examples![0]
    const result = validate(example)

    expect(result.errors).toBeNull()
    expect(result.valid).toBe(true)
  })
})
