import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mapPobToBuild } from '../src/map'
import { parsePobXml } from '../src/parse'
import { emitBuildFile, deriveBuildFilename } from '../src/emit'
import type { AscendancyLookup, PassiveLookup } from '../src/map'
import type { BuildFile } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureXml = readFileSync(
  join(here, 'fixtures/pob-90pcuxN4XtJG.xml'),
  'utf8'
)
const pob = parsePobXml(fixtureXml)
const passives = JSON.parse(
  readFileSync(join(here, '../data/pruned/passives_default.json'), 'utf8')
) as PassiveLookup
const ascendancies = JSON.parse(
  readFileSync(join(here, '../data/pruned/ascendancies.json'), 'utf8')
) as AscendancyLookup

describe('emitBuildFile', () => {
  it('returns filename and content for a valid build', () => {
    const build = mapPobToBuild(pob, { passives, ascendancies })
    const result = emitBuildFile(build)

    expect(result.filename).toBe('Ranger - Deadeye.build')
    expect(result.content.startsWith('{')).toBe(true)
    expect(result.content.endsWith('\n')).toBe(true)

    const reparsed = JSON.parse(result.content)
    expect(reparsed.name).toBe(build.name)
    expect(reparsed.ascendancy).toBe(build.ascendancy)
  })

  it('respects custom indent width', () => {
    const build = mapPobToBuild(pob, { passives })
    const result = emitBuildFile(build, { indent: 4 })
    // 4-space indent means lines beyond the opening brace start with 4+ spaces.
    const lines = result.content.split('\n')
    expect(lines[1]).toMatch(/^ {4}"/)
  })

  it('throws when validation fails', () => {
    const bad = { name: '' } as unknown as BuildFile
    expect(() => emitBuildFile(bad)).toThrow(/validate/)
  })

  it('skips validation when { validate: false }', () => {
    const bad = { name: '' } as unknown as BuildFile
    expect(() => emitBuildFile(bad, { validate: false })).not.toThrow()
  })
})

describe('deriveBuildFilename', () => {
  it('appends .build to the build name', () => {
    expect(deriveBuildFilename({ name: 'Ranger - Deadeye' } as BuildFile)).toBe(
      'Ranger - Deadeye.build'
    )
  })

  it('strips Windows-illegal characters', () => {
    expect(
      deriveBuildFilename({ name: 'My/Build:Special?<v2>' } as BuildFile)
    ).toBe('MyBuildSpecialv2.build')
  })

  it('collapses runs of whitespace to single spaces', () => {
    expect(
      deriveBuildFilename({ name: '  Foo   \t  Bar  ' } as BuildFile)
    ).toBe('Foo Bar.build')
  })

  it('falls back to "build" when sanitization empties the name', () => {
    expect(deriveBuildFilename({ name: '////' } as BuildFile)).toBe(
      'build.build'
    )
  })
})
