import { describe, it, expect } from 'vitest'
import { VERSION } from '../src/index'

describe('@poe2-build-forge/core', () => {
  it('exports a version string', () => {
    expect(VERSION).toBe('0.0.0')
  })
})
