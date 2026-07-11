/**
 * forge — command-line companion to the web converter.
 *
 * Subcommands:
 *   convert <pob>                 PoB export (file or raw code) -> .build
 *   extract <build>               annotated .build -> annotation sidecar (YAML)
 *   compose <base> <sidecar.yml>  base + sidecar -> annotated .build
 *
 * `base` for compose may be a .build file OR a PoB export; either way the
 * sidecar's annotations are applied on top. Output is written to a file named
 * after the build (so each build gets a distinct, recognizable filename);
 * pass -o <path> to choose the path or --stdout to print instead.
 *
 * Run with:  pnpm forge <subcommand> [args]   (or: pnpm exec tsx scripts/forge.ts ...)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { basename, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import {
  decodePobCode,
  parsePobXml,
  mapPobToBuild,
  emitBuildFile,
  deriveBuildFilename,
  extractSidecar,
  composeSidecar,
  type BuildFile,
  type PassiveLookup,
  type AscendancyLookup,
  type Sidecar
} from '../packages/core/src/index'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(REPO_ROOT, 'packages/core/data/pruned')

function loadLookups(): { passives: PassiveLookup; ascendancies: AscendancyLookup } {
  return {
    passives: readJson(join(DATA, 'passives_default.json')),
    ascendancies: readJson(join(DATA, 'ascendancies.json'))
  }
}

function readJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

/** Read a base as either a .build (JSON) or a PoB export (raw code). */
function loadBaseBuild(path: string): BuildFile {
  const raw = readFileSync(path, 'utf8').trim()
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string') {
      return parsed as BuildFile
    }
  } catch {
    // not JSON — fall through to PoB decode
  }
  return convertPobCode(raw)
}

function convertPobCode(code: string): BuildFile {
  const pob = parsePobXml(decodePobCode(code))
  const { build, warnings } = mapPobToBuild(pob, loadLookups())
  if (warnings.length > 0) {
    process.stderr.write(
      `warning: ${warnings.length} passive node(s) could not be mapped ` +
        `(tree data may be stale — run pnpm fetch-data): ` +
        warnings.map((w) => w.pobId).join(', ') +
        '\n'
    )
  }
  return build
}

interface Options {
  out?: string
  stdout: boolean
  positionals: string[]
}

function parseOptions(argv: string[]): Options {
  const positionals: string[] = []
  let out: string | undefined
  let stdout = false
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-o' || a === '--out') out = argv[++i]
    else if (a === '--stdout' || a === '-') stdout = true
    else positionals.push(a)
  }
  return { out, stdout, positionals }
}

function writeBuild(build: BuildFile, opts: Options): void {
  const { content } = emitBuildFile(build)
  emit(content, opts, () => deriveBuildFilename(build))
}

function emit(content: string, opts: Options, defaultName: () => string): void {
  if (opts.stdout) {
    process.stdout.write(content)
    return
  }
  const path = opts.out ?? defaultName()
  writeFileSync(path, content)
  process.stderr.write(`wrote ${path}\n`)
}

function usage(): never {
  process.stderr.write(
    'usage:\n' +
      '  forge convert <pob>                 PoB export -> .build\n' +
      '  forge extract <build>               annotated .build -> sidecar.yml\n' +
      '  forge compose <base> <sidecar.yml>  base (.build or PoB) + sidecar -> .build\n' +
      '  [-o <path> | --stdout]\n'
  )
  process.exit(2)
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2)
  const opts = parseOptions(rest)

  if (cmd === 'convert') {
    const [input] = opts.positionals
    if (!input) usage()
    writeBuild(convertPobCode(readFileSync(input, 'utf8').trim()), opts)
  } else if (cmd === 'extract') {
    const [input] = opts.positionals
    if (!input) usage()
    const build = readJson<BuildFile>(input)
    const sidecar = extractSidecar(build)
    const y = yaml.dump(sidecar, { lineWidth: -1, noRefs: true })
    emit(y, opts, () => `${basename(input).replace(/\.build$/, '')}.build.yml`)
  } else if (cmd === 'compose') {
    const [baseInput, sidecarInput] = opts.positionals
    if (!baseInput || !sidecarInput) usage()
    const base = loadBaseBuild(baseInput)
    // js-yaml's load uses the safe default schema (no code execution), but
    // still validate the shape: a sidecar must be a plain object so a
    // malformed file fails clearly instead of crashing compose.
    const loaded = yaml.load(readFileSync(sidecarInput, 'utf8'))
    if (loaded === null || typeof loaded !== 'object' || Array.isArray(loaded)) {
      process.stderr.write(`error: ${sidecarInput} is not a valid sidecar object\n`)
      process.exit(1)
    }
    writeBuild(composeSidecar(base, loaded as Sidecar), opts)
  } else {
    usage()
  }
}

main()
