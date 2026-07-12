# poe2-build-forge

[![CI](https://github.com/chesler410/poe2-build-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/chesler410/poe2-build-forge/actions/workflows/ci.yml)
[![Deploy](https://github.com/chesler410/poe2-build-forge/actions/workflows/deploy.yml/badge.svg)](https://github.com/chesler410/poe2-build-forge/actions/workflows/deploy.yml)

> ## Status: active
>
> Briefly wound down after PoE2 0.5.0 shipped a native Build Planner, then
> revived once field-testing against game-accepted `.build` files surfaced
> real, fixable defects. The big build sites cover *their* catalogs and let you
> subscribe to a creator's guide; forge covers the gap they don't — turning
> **your own** PoB code (or any arbitrary build) into a `.build` you upload to
> your account, plus an [annotation sidecar](#annotation-sidecar) so your
> personal notes survive every re-export.
>
> If you just want to follow a published creator guide, subscribing on
> **[maxroll.gg/poe2](https://maxroll.gg/poe2)** or
> **[mobalytics.gg/poe-2](https://mobalytics.gg/poe-2)** and syncing it in-game
> is the easier path — no files involved.

**Try it now → [chesler410.github.io/poe2-build-forge](https://chesler410.github.io/poe2-build-forge/)**

Convert Path of Exile 2 build guides — PoB codes from
[pobb.in](https://pobb.in) and similar sources — into the official in-game
`.build` file format consumed by PoE 2's
[Build Planner](https://www.pathofexile.com/developer/docs/game).

A `.build` file lets players drop in-game annotations onto their character
panel: passive nodes to allocate, gem combinations to slot, items to chase,
all keyed to character-level ranges. There are two ways to get one into the
game:

- **Account upload.** Since 0.5.3 you can upload a `.build` at
  [pathofexile2.com](https://www.pathofexile2.com/) under **My Account →
  Builds → Upload Build**, and it syncs into the in-game Build Planner across
  your (supported) devices without copying files by hand. (Clicking a
  creator's *Subscribe* link on a supported build site does the same thing for
  their guide.) Note the portal has no in-place editing — "Edit" just
  re-uploads a file — which is what the
  [annotation sidecar](#annotation-sidecar) is for.
- **Local file.** Drop the file into
  `Documents/My Games/Path of Exile 2/BuildPlanner/`. On Steam Deck (Proton)
  the folder is under
  `~/.local/share/Steam/steamapps/compatdata/2315204395/pfx/drive_c/users/steamuser/Documents/My Games/Path of Exile 2/BuildPlanner/`.
  If your Documents folder syncs to OneDrive, it's under `OneDrive\Documents\...`.

> **Platforms:** the in-game Build Planner is **PC (Windows) and Steam Deck
> only** for now. **PlayStation and Xbox aren't supported yet** — the planner
> reads `.build` files from disk and consoles don't expose one. That's a Path
> of Exile 2 limitation, not this tool's.

## Status

Active. The full PoB → `.build` pipeline works end-to-end: generated files
load in the in-game Build Planner and upload cleanly to the account portal —
validated against GGG's format on 0.5.0 launch day and cross-checked since
against five game-accepted Mobalytics exports the planner demonstrably loads.

| Package | Purpose |
|---|---|
| [`@poe2-build-forge/schema`](packages/schema) | JSON Schema for `.build` files + Ajv-backed `validate()` |
| [`@poe2-build-forge/core`](packages/core) | PoB decoder, parser, mapper, emitter, annotation sidecar |
| [`@poe2-build-forge/web`](apps/web) | Static client-side converter UI, **live** at [chesler410.github.io/poe2-build-forge](https://chesler410.github.io/poe2-build-forge/) |
| [`scripts/forge.ts`](scripts/forge.ts) | `forge` CLI: `convert`, `extract`, `compose` |

### Fixtures are ground truth

The [`fixtures/`](fixtures/) directory holds real, **game-accepted** `.build`
files — five Mobalytics variant exports and one annotated character file that
the in-game planner and the account portal both load. Tests validate against
them verbatim. The governing rule: **where GGG's developer docs and these
files disagree, the game follows the files.** Field testing this way corrected
several docs-derived assumptions (the `inventory_id` vocabulary, `weapon_set`
values of 1/2 rather than 0/1, and renamed-gem labels).

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
- Maps PoB slots to the game's `inventory_id` vocabulary, verified against
  game-accepted `.build` files (see [`fixtures/`](fixtures/)): `Weapon1`
  (set I) and `Weapon2` (the weapon-swap set — e.g. a staff build's
  `Weapon 1 Swap`); suffixed armour (`Helm1`, `BodyArmour1`, `Gloves1`,
  `Boots1`); `Amulet1`, `Belt1`, `Ring1`, `Ring2` (rings are the only
  category that increments); every charm → `Charm1` and every flask →
  `Flask1`. There is no `Offhand` — the game never uses it.
- **Edit before download**: in-browser form for build name, description,
  per-passive `weapon_set` + `unique_name`, per-item `unique_name`, and
  per-entry `additional_text` + `level_interval` on everything. JSON
  preview updates live; downloaded file reflects edits. Ascendancy
  passives are grouped into their own collapsible section.
- **Readable labels** in the editor: passives show their game name
  ("Shock Chance" alongside `lightning14`), skill gems show authoritative
  names sourced from PoB's `Gems.lua` ("Sigil of Power" — proper casing,
  not a CamelCase guess), item rows lift `RARE: BaseType ("Name")`
  / `MAGIC: …` strings into a readable two-line header.
- **Copy JSON** alongside Download for pasting into chat, gists, or
  hand-merging into an existing `.build`.
- **Share link**: encode the (compressed) build in the URL hash so a
  single link captures the entire annotated build — no backend, no
  account. Visiting the link decodes straight into the editor.
- **Live markup preview** under description and `additional_text`
  textareas, rendering `<bold>{...}`, `<italics>{...}`,
  `<underline>{...}`, named colors, and `<rgb(r, g, b)>{...}` (with
  nesting) so guide authors see what players will see.
- **Build source hints** for users without a PoB code yet — pobb.in,
  maxroll.gg/poe2, poe.ninja/poe2, mobalytics.gg/poe-2. Pasting URLs
  from any of those gets a host-specific hint on how to copy the code.
- **Mobile-friendly layout** at narrow viewports — buttons stretch to
  full width, number inputs shrink, toasts span edge-to-edge.
- **Resilient**: a root error boundary catches render crashes and offers
  Reload / Reset-saved-state recovery instead of a blank page.

Recent changes are tracked in [`CHANGELOG.md`](CHANGELOG.md).
- **Drag-and-drop** a `.pob` file (treated as a PoB code) or a `.build`
  file (loaded directly into the editor, bypassing conversion) onto the
  page.
- **Keyboard shortcuts**: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to convert,
  <kbd>Ctrl</kbd>+<kbd>S</kbd> to download, <kbd>Ctrl</kbd>+<kbd>Z</kbd>
  / <kbd>Ctrl</kbd>+<kbd>Y</kbd> to undo/redo edits (outside text fields,
  so native textarea undo still works while typing).
- **Search/filter** inside long passive, skill, and item lists by name
  or id.
- **Auto-resume**: paste and edits persist in LocalStorage so a refresh
  doesn't lose work. Use the **Start over** button to clear.
- **Installable / offline**: a [PWA](https://web.dev/progressive-web-apps/)
  manifest and service worker make the app installable as a desktop or
  mobile app and keep it working without an internet connection after
  the first visit.
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

// 3. Translate into the .build schema shape. Returns the build plus any
//    warnings (e.g. passive nodes that couldn't be mapped — never dropped
//    silently; run `pnpm fetch-data` if the bundled tree data is stale).
const { build, warnings } = mapPobToBuild(pob, { passives, ascendancies })
if (warnings.length) console.warn(warnings)

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

## Annotation sidecar

The account portal has no in-place editing, so re-uploading after you level
means regenerating the whole `.build` — and re-doing every annotation. The
sidecar keeps your notes decoupled from the converted structure so they
survive a re-export. Use the `forge` CLI (`pnpm forge <subcommand>`):

```sh
# One-time: turn your current annotated .build into a sidecar (YAML).
pnpm forge extract "ENDGAME COC COMET.build"   # -> ENDGAME COC COMET.build.yml

# Later, after leveling and re-exporting from PoB — one command:
pnpm forge compose stormweaver-pob.txt "ENDGAME COC COMET.build.yml"
#   base may be a PoB export OR any .build; the sidecar is applied on top.
#   Output is named after the build; -o <path> or --stdout to override.

# Or just convert a PoB export with no annotations:
pnpm forge convert stormweaver-pob.txt
```

The sidecar is keyed by stable identity — passives by `id` + `weapon_set`,
skill/support gems by id, inventory slots by `inventory_id` + ordinal — so
`compose(base, extract(base))` round-trips exactly and re-composing is
idempotent. New nodes come through unannotated; annotations for nodes you
dropped are simply skipped. The same `extractSidecar` / `composeSidecar`
functions are exported from `@poe2-build-forge/core`.

> The CLI resolves the schema and core packages from their build output, so
> run `pnpm build` once first (or after pulling changes).

## Roadmap

Ideas under consideration — not commitments.

- **Inverse conversion: `.build` → PoB code** *(community-requested)*.
  Take a `.build` — your own, or one a build creator shared — back into
  [Path of Building](https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2)
  to theorycraft, check DPS/defenses, tweak, and re-export. Closes the
  round-trip loop and would be the mirror of the existing pipeline.
  Feasibility hinges on how items are stored in the `.build` format.
- **Direct save to the BuildPlanner folder.** Skip the
  download-then-drag step by writing straight to
  `Documents/My Games/Path of Exile 2/BuildPlanner/` via the File System
  Access API on supported browsers (the download path stays as the
  fallback).
- **Sidecar action in the web editor.** The CLI `extract`/`compose` flow
  as an in-browser upload/download action, for people who don't run Node.

Have an idea or a request? [Open an issue](https://github.com/chesler410/poe2-build-forge/issues).

## Development

Requires Node 22.13+ (pnpm 11 needs `node:sqlite`) and pnpm 11+.

```sh
pnpm install
pnpm test       # vitest across schema + core + web (136 tests)
pnpm build      # tsup (JS) + tsc -b (types)
pnpm typecheck  # tsc -b only
```

Useful scripts under [`scripts/`](scripts/):

```sh
pnpm dev                       # run the web app locally at http://localhost:5173/
pnpm forge <cmd> [args]        # convert / extract / compose (see Annotation sidecar)
pnpm spike:decode <pobbBuildId> # inspect a pobb.in payload (decode + dump XML head/tail)
pnpm fetch-data                 # refresh the bundled GGG data tables in core
pnpm prune-data                 # prune the raw data snapshot to the mapper essentials
pnpm watch-docs                 # poll GGG dev-docs for Build Planner section changes (exit code 1 on change)
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
