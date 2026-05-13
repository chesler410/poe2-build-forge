# Changelog

All notable changes to poe2-build-forge. Versions track the web app at
`apps/web`; the libraries follow alongside.

## [0.9.3] — 2026-05-13

**Changed**

- Str / Int / Dex chips are now color-coded to the canonical PoE
  attribute palette: red for Strength, blue for Intelligence, green for
  Dexterity. Inactive chips tint the letter; active chips fill with the
  attribute color.
- Display Name input on passive rows now shows the node's lookup name as
  the placeholder (e.g. "Strength", "Shock Chance", "Sustainable
  Practices") so authors see the canonical label and only override it
  when they want a build-specific label.

Note: the Display Name + Weapon Set row stays visible for every passive
even when both fields are empty — it's a deliberate jumping-off point
for authors to add their own annotation, not a leak of editor surface
to hide.

## [0.9.2] — 2026-05-13

**Added**

- Quick-pick **Str / Int / Dex chip row** on `attributes`-prefix passive
  rows. Clicking a chip sets the entry's `additional_text` to
  `Pick Strength` / `Pick Intelligence` / `Pick Dexterity` — the canonical
  way a guide author marks "pick this stat at this attribute node." The
  × chip clears the note. Active chip highlights when the note matches.

**Changed**

- Entries within each passive type group now sort by `level_interval[0]`
  ascending (allocation order), with id alphabetical as the tiebreak.
  Entries without a `level_interval` go to the bottom of their group.

## [0.9.1] — 2026-05-13

Cut the scrolling impact of large passive lists.

**Changed**

- Regular passives now group by id-prefix (`intelligence`, `attributes`,
  `two_handed`, `armour_and_evasion`, …). A 169-passive Witchhunter build
  collapses to ~25 type sections — each independently collapsible.
- The outer Passives disclosure auto-collapses when the build has more
  than 12 regular passives. Inner type groups auto-expand only when they
  have ≤3 entries.
- Ascendancy passives stay in their own single block (small enough that
  grouping is noise).

**Added**

- `apps/web/src/passiveGroup.ts` with `passivePrefix` (trailing
  digits/underscores/dashes stripped) and `prefixLabel` (Title-Case with
  spaces). 10 unit tests cover both.

## [0.9.0] — 2026-05-13

Feedback milestone — converter is feature-complete for what can be built
and validated before PoE 2's 0.5.0 ships on May 29.

**Added**

- Authoritative skill-gem names sourced from PoB's `Gems.lua` (902
  entries). Editor shows "Sigil of Power" instead of the CamelCase guess
  "Sigil Of Power".
- Item rows now lift the mapper's `RARE: BaseType ("Name")` /
  `MAGIC: …` / `NORMAL: …` strings into a readable header: rolled name
  on top, rarity + base + slot below. Uniques continue to use
  `unique_name`.
- Edit `weapon_set` (1/2/—) and `unique_name` (per-build display label)
  on passive entries. Edit `unique_name` (suggested unique item) on
  inventory-slot hints.
- Root error boundary. If a render below `<App />` throws, a recovery
  panel shows the error, the build version + SHA, and Reload / Reset
  buttons (Reset clears LocalStorage in case persisted state is at
  fault).

**Changed**

- Passive tree data bumped from `0_1` to `0_4` (three patches forward;
  matches what PathOfBuilding-PoE2 currently ships).
- `scripts/prune-data.ts` grew an `outputFilename` option and a `.lua`
  input path so non-JSON sources can be parsed during pruning.

**Testing**

- 28 unit tests under `apps/web/tests/` for the shareLink round-trip,
  markup parser, and item annotation parser. Workspace total: 69 tests
  passing.

## [0.8.0] — 2026-05-13

Pre-0.5.0 ergonomic roadmap close-out.

- Mobile responsive layout polish at `<=640px` and `<=420px`.
- Build source links (pobb.in / maxroll.gg / poe.ninja / mobalytics.gg)
  in the quick-start section, for users who don't have a PoB code yet.
- mobalytics.gg added to the host classifier with a copy-code hint.

## [0.7.5] — 2026-05-13

- Live markup preview under description and `additional_text` textareas,
  rendering `<bold>`, `<italics>` / `<italic>`, `<underline>`, named
  colors, and `<rgb(r, g, b)>` with nesting. Unknown tags render at
  reduced opacity so authors notice typos.

## [0.7.4] — 2026-05-13

- Undo / redo via a history stack. `Ctrl+Z` / `Ctrl+Y` fire outside
  input/textarea/contenteditable elements so the browser's native
  textarea undo still works while typing.

## [0.7.3] — 2026-05-13

- Toast notifications for transient feedback: shared-link load, file
  drop, clipboard fallback.

## [0.7.2] — 2026-05-13

- PWA — installable as a desktop or mobile app, works offline after the
  first visit. Manifest + service worker via `vite-plugin-pwa` with
  auto-update.

## [0.7.1] — 2026-05-13

- Share link: encodes the current build as
  `#b=<deflate+base64url>` in the URL hash. Visiting a `#b=…` URL
  decodes straight into the editor and consumes the hash so subsequent
  reloads use LocalStorage as the source of truth.
- Auto-loads the passive-name lookup whenever a build is present without
  labels (LocalStorage restores, shared-link loads).

## [0.7.0] — 2026-05-13

- LocalStorage persistence for textarea input and the current edited
  build. Refresh no longer wipes work. A **Start over** button clears.
- Drag-and-drop: a `.pob` file goes through Convert, a `.build` file
  loads straight into the editor (bypassing the PoB pipeline).
- Keyboard shortcuts: `Ctrl+Enter` convert, `Ctrl+S` download.
- Search / filter inside passive, skill, and item lists once they
  exceed six entries.

## [0.6.2] — 2026-05-13

- Ascendancy passives split into their own collapsible section in the
  editor. Output JSON keeps them in the original single array.
- Copy JSON button alongside Download.

## [0.6.1] — 2026-05-13

- Readable passive names in the editor (resolved via the bundled
  `passives_default.json` lookup). Skill ids get the
  `Metadata/Items/Gem(s)/SkillGem` prefix stripped.

## [0.6.0] — 2026-05-13

- In-browser annotation editor between Convert and Download. Edit build
  name, description, and per-passive/skill/item `additional_text` and
  `level_interval`. JSON preview updates live; the downloaded file
  reflects edits.

## [0.5.3] — 2026-05-13

- Schema permits `unique_name` on a `BuildPassive` entry (per the
  Return of the Ancients reveal video, where a Ranger.build entry
  carries `"unique_name": "A passive!"`).

## Earlier

See `git log` for 0.5.x and prior — the foundational PoB-to-`.build`
conversion pipeline.
