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

Early development. Nothing is published to npm yet.

| Package | Status | Purpose |
|---|---|---|
| [`@poe2-build-forge/schema`](packages/schema) | scaffolded, tested | JSON Schema for `.build` files + Ajv-backed `validate()` |
| `@poe2-build-forge/core` | planned | Decode PoB exports, emit `.build` |
| Web app | planned | Static client-side UI |

The PoB → `.build` conversion has been spec'd at the format level — see
[`scripts/decode-spike.ts`](scripts/decode-spike.ts) — but the mapping
layer (PoB display names ↔ GGG table IDs) is not yet implemented.

## How it will work

1. Take a `pobb.in/<id>` URL or a raw PoB export string.
2. Decode the PoB envelope: URL-safe base64 → zlib-inflate → XML
   rooted at `<PathOfBuilding2>`.
3. Map PoB's display names and tree allocations to GGG's internal table
   IDs (`Ascendancy`, `PassiveSkills`, `BaseItemTypes`, `Words`).
4. Emit a JSON `.build` file the in-game Build Planner accepts.

## Usage (planned, once published)

```ts
import { validate } from '@poe2-build-forge/schema'

const buildFile = {
  name: 'Tutorial Mercenary - Shield Wall',
  ascendancy: 'Mercenary2',
  passives: ['projectiles18'],
  skills: [{ id: 'Metadata/Items/Gem/SkillGemShieldWall' }]
}

const result = validate(buildFile)
if (!result.valid) console.error(result.errors)
```

The raw schema is also exported as a static asset for non-TS consumers:

```ts
import schemaJson from '@poe2-build-forge/schema/poe2-build.schema.json'
```

## Development

Requires Node 20+ and pnpm 11+.

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
