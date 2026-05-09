import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePobCode } from '../src/decode'

const here = dirname(fileURLToPath(import.meta.url))

describe('decodePobCode', () => {
  it('decodes the Ranger fixture base64 to the matching XML', () => {
    const code = readFileSync(
      join(here, 'fixtures/pob-90pcuxN4XtJG.b64'),
      'utf8'
    ).trim()
    const expectedXml = readFileSync(
      join(here, 'fixtures/pob-90pcuxN4XtJG.xml'),
      'utf8'
    )

    const decoded = decodePobCode(code)

    expect(decoded).toBe(expectedXml)
  })

  it('handles URL-safe base64 with missing padding', () => {
    const code = readFileSync(
      join(here, 'fixtures/pob-90pcuxN4XtJG.b64'),
      'utf8'
    ).trim()

    expect(() => decodePobCode(code.replace(/=+$/, ''))).not.toThrow()
  })
})
