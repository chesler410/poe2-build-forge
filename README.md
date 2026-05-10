# poe2-build-forge

Convert Path of Exile 2 build guides — PoB codes from
[pobb.in](https://pobb.in) and similar sources — into the official in-game
`.build` file format consumed by PoE 2's
[Build Planner](https://www.pathofexile.com/developer/docs/game).

`.build` files live in `Documents/My Games/Path of Exile 2/BuildPlanner/`
and let players drop in-game annotations onto their character panel:
passive nodes to allocate, gem combinations to slot, items to chase, all
keyed to character-level ranges.

## Status

Early development. Nothing is published to npm yet, but the library is
functional locally.

| Package | Status | Purpose |
|---|---|---|
| [`@poe2-build-forge/schema`](packages/schema) | scaffolded, tested | JSON Schema for `.build` files + Ajv-backed `validate()` |
| [`@poe2-build-forge/core`](packages/core) | scaffolded, tested | PoB decoder, parser, mapper, emitter — full pipeline working |
| Web app | planned | Static client-side UI |

The full PoB-code → `.build` pipeline works end-to-end and the output
validates against the schema. There's an outstanding question about
whether the dev docs or the GGG reveal video correctly describes the
top-level `.build` field names — see
[`docs/ui-exploration.md`](docs/ui-exploration.md) section 2 for the
conflict catalogue.

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

A throwaway script for inspecting pobb.in payloads lives at
[`scripts/decode-spike.ts`](scripts/decode-spike.ts):

```sh
pnpm spike:decode <pobbBuildId>
# e.g. pnpm spike:decode 90pcuxN4XtJG
```

## References

- [GGG developer docs — Build Planner](https://www.pathofexile.com/developer/docs/game) — official `.build` spec.
- [pobb.in](https://pobb.in) — hosts PoE2 builds; `/{id}/raw` returns the encoded payload (requires a real browser User-Agent).
- [PathOfBuildingCommunity/PathOfBuilding-PoE2](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2) — PoE2 fork of Path of Building; source of versioned passive tree data.
- [repoe-fork/poe2](https://github.com/repoe-fork/poe2) — auto-tracked dumps of PoE2 game tables (ascendancies, base items, gems, uniques).

## Support

This is a hobby project. If it saves you time, [buy me a coffee on Ko-fi](https://ko-fi.com/chesler410) — appreciated, never expected.

## License

MIT.
