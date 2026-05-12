# poe2-build-forge

[![CI](https://github.com/chesler410/poe2-build-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/chesler410/poe2-build-forge/actions/workflows/ci.yml)
[![Deploy](https://github.com/chesler410/poe2-build-forge/actions/workflows/deploy.yml/badge.svg)](https://github.com/chesler410/poe2-build-forge/actions/workflows/deploy.yml)

**Try it now → [chesler410.github.io/poe2-build-forge](https://chesler410.github.io/poe2-build-forge/)**

Convert Path of Exile 2 build guides — PoB codes from
[pobb.in](https://pobb.in) and similar sources — into the official in-game
`.build` file format consumed by PoE 2's
[Build Planner](https://www.pathofexile.com/developer/docs/game).

`.build` files live in `Documents/My Games/Path of Exile 2/BuildPlanner/`
and let players drop in-game annotations onto their character panel:
passive nodes to allocate, gem combinations to slot, items to chase, all
keyed to character-level ranges.

## Status

Early development. The web app is live; the libraries are not yet
published to npm. **PoE2's in-game Build Planner ships May 29, 2026** —
until then, generated `.build` files validate against the published
schema and can be inspected, but can't actually be loaded in-game yet.

| Package | Status | Purpose |
|---|---|---|
| [`@poe2-build-forge/schema`](packages/schema) | scaffolded, tested | JSON Schema for `.build` files + Ajv-backed `validate()` |
| [`@poe2-build-forge/core`](packages/core) | scaffolded, tested | PoB decoder, parser, mapper, emitter — full pipeline working |
| [`@poe2-build-forge/web`](apps/web) | **live** at [chesler410.github.io/poe2-build-forge](https://chesler410.github.io/poe2-build-forge/) | Static client-side converter UI |

The full PoB-code → `.build` pipeline works end-to-end and the output
validates against the schema, which follows the
[GGG developer docs](https://www.pathofexile.com/developer/docs/game)
verbatim.

### What the converter handles

- Accepts pobb.in URLs (via paste-the-code) and raw PoB export strings
- Decodes PoB's wire format: URL-safe base64 → zlib → `<PathOfBuilding2>` XML
- Maps PoB integer tree-node ids to GGG `PassiveSkills.id` strings
  (e.g. `28992` → `lightning14`, `AscendancyRanger1Notable3`)
- Derives per-passive `level_interval` from PoB's tree-spec ordering
  (Campaign Start / Mid / Endgame specs distribute across levels 1–100)
- Resolves ascendancy display names ("Deadeye") to GGG table-ids
  ("Ranger2") via a bundled lookup
- Surfaces equipped items: uniques as `unique_name`, rares/magics as
  `additional_text` with rarity + base type + rolled name
- Disambiguates multi-slot inventory positions (`Flask 1` / `Flask 2`
  → `Flask1` / `Flask2`; `Weapon 1 Swap` → `Offhand1`)
- Validates final output against the JSON Schema before download
- Runs entirely client-side: no signup, no backend, no data leaves
  your browser

## How it works

1. **Get** a `pobb.in/<id>` URL, raw PoB export string, or `.pob` file content.
2. **Decode** the PoB envelope: URL-safe base64 → zlib-inflate → XML rooted at `<PathOfBuilding2>` (`decodePobCode`).
3. **Parse** the XML into a typed AST with `Build`, `Tree`, `Skills`, `Items`, `Notes` (`parsePobXml`).
4. **Map** PoB's display names and tree allocations to GGG's internal table IDs using bundled lookup tables (`mapPobToBuild`).
5. **Emit** a validated JSON `.build` file ready to drop into PoE2's BuildPlanner directory (`emitBuildFile`).

## Usage

End-to-end: turn a pobb.in URL into a `.build` file the in-game Build
Planner can load.

```ts
import {
  decodePobCode,
  parsePobXml,
  mapPobToBuild,
  emitBuildFile
} from '@poe2-build-forge/core'
import passives from '@poe2-build-forge/core/data/passives_default.json'
import ascendancies from '@poe2-build-forge/core/data/ascendancies.json'

// 1. Get the PoB code (here from pobb.in's /raw endpoint).
//    pobb.in requires a real browser User-Agent.
const code = await fetch('https://pobb.in/90pcuxN4XtJG/raw', {
  headers: { 'User-Agent': 'Mozilla/5.0 (...) Chrome/131.0.0.0 Safari/537.36' }
}).then((r) => r.text())

// 2. Decode the wire format and parse the XML into a typed AST.
const xml = decodePobCode(code)
const pob = parsePobXml(xml)

// 3. Translate into the .build schema shape.
const build = mapPobToBuild(pob, { passives, ascendancies })

// 4. Serialize. Validation against the schema runs automatically.
const { filename, content } = emitBuildFile(build)
//   filename === 'Ranger - Deadeye.build'
//   content  === '{\n  "name": "Ranger - Deadeye", ... }\n'

// 5. Up to you: write `content` to `<filename>` inside
//    Documents/My Games/Path of Exile 2/BuildPlanner/
```

The pipeline functions are pure and cross-runtime — Node 22+ and modern
browsers — so the same code works in a static web app or a CLI.

If you only want to **validate** an existing `.build` file:

```ts
import { validate } from '@poe2-build-forge/schema'

const result = validate(JSON.parse(fileContent))
if (!result.valid) console.error(result.errors)
```

The raw JSON Schema is exported as a static asset for non-TS consumers:

```ts
import schemaJson from '@poe2-build-forge/schema/poe2-build.schema.json'
```

## Development

Requires Node 22.13+ (pnpm 11 needs `node:sqlite`) and pnpm 11+.

```sh
pnpm install
pnpm test       # vitest across all packages
pnpm build      # tsup (JS) + tsc -b (types)
pnpm typecheck  # tsc -b only
```

Useful scripts under [`scripts/`](scripts/):

```sh
pnpm dev                       # run the web app locally at http://localhost:5173/
pnpm spike:decode <pobbBuildId> # inspect a pobb.in payload (decode + dump XML head/tail)
pnpm fetch-data                 # refresh the bundled GGG data tables in core
pnpm prune-data                 # prune the raw data snapshot to the mapper essentials
```

## References

- [GGG developer docs — Build Planner](https://www.pathofexile.com/developer/docs/game) — official `.build` spec.
- [pobb.in](https://pobb.in) — hosts PoE2 builds; `/{id}/raw` returns the encoded payload (requires a real browser User-Agent).
- [PathOfBuildingCommunity/PathOfBuilding-PoE2](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2) — PoE2 fork of Path of Building; source of versioned passive tree data.
- [repoe-fork/poe2](https://github.com/repoe-fork/poe2) — auto-tracked dumps of PoE2 game tables (ascendancies, base items, gems, uniques).

### Upstream coordination

- [PathOfBuildingCommunity/PathOfBuilding-PoE2#1829](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/issues/1829) — feature request asking PoB to export to `.build` natively. If they integrate it, this tool becomes redundant in the best possible way.

## Support

This is a hobby project. If it saves you time, [buy me a coffee on Ko-fi](https://ko-fi.com/chesler410) — appreciated, never expected.

## License

MIT.
