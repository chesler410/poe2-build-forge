# UI/UX Exploration — poe2-build-forge

> **Status:** Exploratory thinking. None of this is decided. Every concrete
> proposal is marked **[exploratory — needs user input]**. Use this as a
> jumping-off point for design conversations, not a spec.

The eventual product is a static web app where a PoE2 player pastes a
pobb.in URL (or raw PoB code) and downloads a `.build` file ready to drop
into `Documents/My Games/Path of Exile 2/BuildPlanner/`. This document
sketches the *user-facing* shape of that experience.

## 1. Dual viewing paths — by level *and* by act

**[decided]** The UI must support two parallel ways of slicing the same
underlying data (per-hint `level_interval: [min, max]`). Acts give a
narrative anchor ("I just hit Act 3, what changes?"); levels give a
precise tool ("what does my level-67 character need next?"). Build
authors write hints in level terms (the schema's native unit); consumers
experience the game in act terms. Supporting both sidesteps the
impedance mismatch.

### Path A — by character level (1–100)

A continuous or bracketed view of the build. User picks a level (or
bracket) and sees only the hints whose `level_interval` covers it.

**[exploratory — needs user input]** Two sub-options for the level path:

- **Continuous slider.** Scrub 1→100, hints fade in/out as their
  intervals come into / out of range. Honest to the data, very
  scrubbable, feels like a tool.
- **Discrete brackets.** Tabs like *1–12 / 13–30 / 31–90* (or whatever
  cuts feel right). Easier to scan, feels more like a tutorial outline.

Brackets and slider aren't mutually exclusive — a bracketed sidebar with
a slider scrubber is a valid hybrid.

### Path B — by act

A section per act, showing the hints that apply during that act. PoE2 is
in Early Access — only acts 1–4 currently exist; acts 5 and 6 ship with
the 1.0 release. The UI should reflect the eventual structure:

| Act | Status | Approx. level range |
|---|---|---|
| Act 1 | live | early game |
| Act 2 | live | early-mid |
| Act 3 | live | mid |
| Act 4 | live | late campaign |
| Act 5 | **placeholder — coming with PoE2 1.0** | — |
| Act 6 | **placeholder — coming with PoE2 1.0** | — |
| Maps / endgame | live | post-campaign |

Acts 5 and 6 render as visible-but-disabled tabs with a *"Coming with
PoE2 1.0"* badge. This way users see the eventual structure today and
nothing visually moves when 1.0 lands.

**[exploratory — needs user input]** The level ranges per act above are
intentionally vague because they need verification against the current
patch and may shift between EA patches. A small `acts.json` data file
mapping act → `[minLevel, maxLevel]` would let the UI compute the
mapping deterministically and would be easy to update per patch.

### How the two paths interact

Both paths view the same underlying data, so a hint visible on Path A's
"level 22" view should also be visible on Path B's "Act 3" view (assuming
level 22 falls in Act 3's range). The UI can either:

- **Switch** between paths via a toggle (radio: "by act" / "by level"),
- Or **layer** them — e.g. show act badges on the level slider.

Toggle is simpler; layering is more powerful. Pick when there's a
prototype to react to.

## 2. In-game appearance

### Schema markup tags

The `additional_text` field supports inline markup:

- `<bold>{text}`, `<italics>{text}`, `<underline>{text}`
- Named colors: `<red>{text}`, `<green>{text}`, etc.
- Arbitrary RGB: `<rgb(r, g, b)>{text}`
- `\n` for newlines
- Tags can nest

### What the GGG reveal screenshots show

Reference imagery in `docs/screenshots/` (frames captured from GGG's
official reveal video, 2026-05) resolves most of the rendering
questions:

**Build storage and selection**

- [`simpleBuildFileExampleFromGGG.png`](screenshots/simpleBuildFileExampleFromGGG.png)
  — Windows file explorer showing the BuildPlanner directory with
  `Ranger.build` (5 KB) and `Shieldwall.build` (10 KB) at
  `Documents\My Games\Path of Exile 2\BuildPlanner\`. Confirms file
  locations match the dev docs.
- [`howToactivateLoadedBuildFile.png`](screenshots/howToactivateLoadedBuildFile.png)
  — multiple loaded builds appear in a dropdown at the top-left of
  the in-game **Build Planner** UI. Shown slots: `None / None /
  MercenaryBuild`, implying multiple build slots can coexist.

**Passive tree rendering**

- [`highlightedPathFromBuildGuide.png`](screenshots/highlightedPathFromBuildGuide.png)
  — when a build is loaded, the passive tree shows allocated nodes
  highlighted with brighter glow/lines tracing the recommended path.
  Side panels show `Skill Points`, `Weapon Set` (twice — confirming
  weapon-set support), `Ascendancy Points`, and a `Search here` text
  field for finding nodes.

**Skill gem recommendations**

- [`skillsFromBuildDropdown.png`](screenshots/skillsFromBuildDropdown.png)
  — the Gem Cutting screen has a `RECOMMENDED` tab populated by the
  loaded build file. Skills render as a grid (Cold Attunement / Double
  Barrel / Rapid Attacks visible). Right-side tooltip shows full skill
  details + a "Supportable Skills" panel listing legal targets for
  support gems.
- [`skillsBeingFilteredFromBuildFiles.png`](screenshots/skillsBeingFilteredFromBuildFiles.png)
  — skill picker with category filters down the left side
  (Bow / Sword / Spear / Staff / Quarterstaff / Dagger / Elemental /
  Chaos / Occult / Frost / Fire / Mace / Axe / Equipped Gems / All
  Gems). Build-file recommendations integrate into this same picker.

**Item slot annotations** (this is what `BuildItem.additional_text`
renders as)

- [`gearNotes1.png`](screenshots/gearNotes1.png) — red text floats above
  an inventory slot: *"This new unique is pretty explosive!"* Pointing
  at a specific slot.
- [`gearNotes2.png`](screenshots/gearNotes2.png) — multiple notes on
  different slots: *"Get as much life on this and some resistances as
  you can!"* and *"Add as much you life than I can do!"* (sic). Confirms
  multiple slots can carry independent notes.
- [`gearNotes3.png`](screenshots/gearNotes3.png) — flask slot:
  *"Keep replacing your Life Flask with any that recover more life
  than your current."* The same annotation pattern works for flask
  slots, not just armor/weapons.

**JSON file format**

- [`sampleBuildFileJson.png`](screenshots/sampleBuildFileJson.png) —
  shows the literal JSON content of a Ranger build file. A few fields
  in this frame don't quite match the published dev docs; see
  "Schema interpretation" below for how we resolved it.

**Community context**

- [`exampleOfBuildGuides.png`](screenshots/exampleOfBuildGuides.png) —
  community sites already host PoE2 build guides organized by
  class/ascendancy with thumbnails and "Last Updated" dates. Our app
  sits between these guides and the in-game `.build` format.
- [`poeNinjaInUse.png`](screenshots/poeNinjaInUse.png) — poe.ninja's
  existing passive-tree designer view. Reference for what
  build-design tools look like today.

### Schema interpretation: defer to dev docs **[resolved 2026-05-11]**

The reveal-video screenshot of `Ranger.build` had fields that
*appeared* to conflict with the published dev docs in three places:

| Field | Dev docs say | Reveal screenshot showed |
|---|---|---|
| Top-level identifier | `name` (required) | `id` |
| `ascendancy` value format | `"Mercenary2"` (table-id) | `"Pathfinder"` (display name) |
| `unique_name` location | `BuildItem` only | also seen on a `BuildPassive` |

**Verdict: we follow the dev docs.** They're the formal published
spec; the reveal screenshot was almost certainly a dev-time artifact
(early build, demo content, or a different format from what shipped).
Our schema, mapper, and emitter all match the docs.

**Re-open trigger:** a real `.build` file produced by the in-game
Build Planner (or one our emitter wrote and the game rejected) that
contradicts our output. Revisit the failing fields against the docs
then. Until that happens, treat this as settled.

History — what we tried before resolving:
- Emailed GGG support (declined; dev-docs queries aren't their remit).
- Searched PathOfBuilding-PoE2 issues — no `.build`-export work yet.
- Searched community sites for in-the-wild `.build` files — none
  found (feature too new).

### Other rendering details

- **Level-interval gate behavior** — not visible in the captured
  screenshots. Still unknown whether out-of-range hints are hidden,
  dimmed, or shown with a "future" badge. Worth checking with a real
  loaded build.
- **Markup parser strictness** — also not visible. Whether an unclosed
  `<bold>` breaks the tooltip or renders gracefully will need
  fuzz-testing once we can write our own `.build` files and load them.

## 3. Color scheme candidates

Three rough directions, presented for trade-offs, not for picking:

### A. PoE2-grimdark

Mood: parchment-and-blood. Reads as "dark fantasy notebook."

```
Background      #0a0a0a    near-black
Surface         #1a1010    slightly red-tinged dark
Accent          #5c1f1f    burgundy
Primary text    #d8c89c    aged parchment
Muted text      #8a7a5c    muted parchment
Highlight       #e8c87a    candle gold
```

**Pros:** Genre-appropriate, distinctive, looks like it belongs to the
PoE2 universe.
**Cons:** Low-contrast pairs for accessibility; may be hard to read for
extended sessions; reds-on-darks fail color-blindness checks if not
chosen carefully.

### B. In-game-matched

Mood: "this is a tool the game shipped." Color values approximated from
the actual PoE2 in-game UI — gold accents on cool charcoal.

```
Background      #1a1612    dark cool brown
Surface         #2a241e    one shade lighter
Accent          #c9a55c    PoE-style gold
Primary text    #f0e6d2    warm off-white
Muted text      #9b8e76    muted warm gray
Highlight       #f4d28a    bright gold
```

**Pros:** Familiar to PoE players, reduces cognitive switching cost
between the web app and the game.
**Cons:** Looks generic to non-PoE players; legally murky to imitate
in-game UI too closely (probably fine; this is just colors); may date
poorly if GGG redesigns.

### C. Neutral utility

Mood: "I am a serious tool." Standard tech-product palette, prioritizes
legibility.

```
Background      #ffffff    white
Surface         #f3f4f6    very light gray
Accent          #2563eb    blue-600
Primary text    #111827    near-black
Muted text      #6b7280    gray-500
Highlight       #facc15    yellow-400
```

(With a parallel dark mode using inverted equivalents.)

**Pros:** Maximum legibility; accessible by default; works for non-PoE
visitors who land on the app cold.
**Cons:** Feels disconnected from the game; "another SaaS dashboard."

**[decided]** No imitation of GGG's UI palette — the app should look
clearly third-party. Brief is "clear, clean, concise, easy." That rules
out scheme **B (in-game-matched)**. **C (neutral utility)** is the best
fit for the brief; **A (PoE2-grimdark)** is acceptable as a restrained
opt-in for users who want a more genre-flavored look but should not
mimic the in-game UI.

**[decided]** Accessibility is universal: WCAG AA contrast as a floor;
respect the user's color-blind settings; allow the user to restyle
both the page UI AND the markup-color tags emitted in `.build`
`additional_text` so colorblind players reading the in-game tooltips
can pick a palette that works for them.

## 4. Help / onboarding flow

There are **two parallel flows** — consumer (the common path) and
creator (the power path). They share most of the UI but differ in
editing depth and the final delivery affordances.

### Consumer flow (pobb.in URL → playable in game)

```
1. Land on app                     - one input box, one paste target.
   |
   v
2. Paste pobb.in URL                - or upload .pob file, paste raw
   |                                  base64, or eventually paste a
   |                                  build-guide page URL we extract
   |                                  from. Decoder runs.
   v
3. Preview parsed build             - "We see: Ranger / Deadeye, level 89,
   |                                  142 passive allocations, 6 skill
   |                                  gems, 4 unique items. Looks right?"
   v
4. (optional) Adjust metadata       - build name, description, level
   |                                  brackets, what to include/exclude.
   v
5. Generate .build file             - single button.
   |
   v
6. Pick delivery mode               - one of three:
   |                                  (a) Auto-place into BuildPlanner
   |                                      (browser asks once for a
   |                                      directory handle, remembers it)
   |                                  (b) Download raw file (universal)
   |                                  (c) Scan for the install path and
   |                                      offer to drop the file there
   v
7. Done — build appears in-game on next launch.
```

### Creator flow (designing a guide for others)

```
A. Land on app, switch to "create" mode.
B. Build the structure: pick class, ascendancy, target level, then
   author per-bracket / per-act guidance for passives, skills, items,
   and (open) atlas / breach trees.
C. Preview as a consumer would see it (toggle to consumer view).
D. Export — same delivery options as steps 6 above, plus a shareable
   link the creator can publish.
```

**[exploratory — needs user input]** Step 6's option (a) needs the
[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
which is Chromium-only and gated; option (c) "scan local drives for
PoE2/PoE1 install paths" can't be done freely from a browser — best the
app can do is *suggest* canonical paths per OS and let the user click
to copy. A small companion helper (Electron/Tauri) would be needed for
true filesystem-scrubbing UX. Worth deferring past MVP.

**[exploratory — needs user input]** Console players have no
filesystem path at all — see follow-up question 2 in section 6.

## 5. Sound

Probably skip for the static web app. PoE2 has a distinctive audio
identity (parchment-rustle UI sounds, ominous ambience), but a web app
that plays sound on download is annoying more often than it's
delightful. **[exploratory — needs user input]** Reserve audio for a
hypothetical desktop app that lives alongside the game.

## 6. Decisions (2026-05-09) and follow-up questions

### Decisions locked in

| | |
|---|---|
| **Audience** | Both. Consumers are the primary audience; creators are a power-user path. Same app, different surfaces. |
| **State** | Stateless by default. A "My builds" library may be added later as an opt-in. |
| **Editing scope** | Beyond metadata: per-hint text, recommended *gear and stats*, plus paths for passives, atlas tree, breach tree, etc. (See Q1 — atlas/breach aren't in the GGG schema.) |
| **PoB sources** | Multi-source. PoB is the entry point but the app should accept maxroll.gg, raw PoB exports, file uploads, and (future) extract from any guide URL. |
| **Game version** | Stay current. When a build's `targetVersion` is incompatible with the current patch, error helpfully with an "upgrade to latest game version first" path. No silent conversion. |
| **Mobile** | Required, not optional — serves console players who don't have a PC. (See Q2 — console delivery is non-trivial.) |
| **Branding** | No game-style imitation. "Clear, clean, concise, easy." Recommend the neutral-utility palette (C in section 3). |
| **Accessibility** | Universal. WCAG AA contrast floor; respect color-blind settings for both the UI and the `.build` markup-color output. |
| **Shareable** | Multiple modes — upload file, share converted-build link, combine with original PoBB URL. Don't force one canonical share path. |
| **In-game ground truth** | Pending — user to capture screenshots from a recent reveal. |

### Follow-up questions surfaced by those answers

1. **Atlas / breach / other endgame trees aren't in the GGG `.build`
   schema.** GGG's format covers passives, skills, and inventory hints
   only.

   **[decided 2026-05-09]** Embed as `additional_text` on existing
   fields (option (b) below). The game renders the text verbatim; users
   follow it by reading tooltips. Lossy and unstructured, but works
   today and — the deciding factor — is the most *versatile* against
   future PoE2 changes: any new game system (atlas, breach, ritual,
   alva, whatever ships next) can be expressed as text without a
   schema change on our side or a game-side update.

   **Sub-decision still open:** *where* in the schema does
   atlas/breach text attach? Candidates:
   - Top-level `description` (single string, all guidance lives here).
   - Per-skill `additional_text` (advice attached to the skill it
     supports).
   - Per-passive `additional_text` (advice keyed to a level bracket).
   - A synthetic anchor entry (e.g. a placeholder passive with the
     atlas plan as its text body). Lets us hang content without
     pretending it modifies a real passive.

   Defer this sub-decision until we have a concrete real-world build
   to author against.

   **Tabled (not deleted — revisit if GGG's format grows):**
   - **(a) Extend our own schema** with non-GGG fields. Our UI renders
     them; the game ignores them. Cleanly typed, but no in-game effect
     for those fields.
   - **(c) Sidecar files** (`<name>.atlas` alongside `<name>.build`).
     Composable, but consumers need to know to grab all of them.
2. **Console-side delivery.** PC user drops a `.build` into
   `Documents\My Games\Path of Exile 2\BuildPlanner\`. Console (PS5,
   Xbox) has no equivalent. Options to research:
   - GGG account-side cloud sync — does the in-game BuildPlanner read
     from a cloud location tied to the player's account?
   - QR-code or code-pairing into a companion app — does GGG ship one?
   - "PC-only auto-install; console users use the web app to *read*
     and follow the build manually."
   This needs research; promising console support without a delivery
   path is a credibility hit.
3. **[decided 2026-05-09]** Creator UI vs. consumer UI surface →
   **consumer-first, then add creator as a future plan.** Ship the
   consumer experience as the entire MVP. Defer the creator surface
   (likely a separate `/author` route) until consumers are working
   well. This keeps day-one IA simple and prevents creator features
   from creeping into the consumer flow's UX budget.
4. **[deferred]** Path A: continuous slider, discrete brackets, or
   both? User wants more time before deciding. Default behavior for
   now: when we prototype Path A, ship discrete brackets first (lower
   build cost) and revisit slider as an enhancement.
5. **GGG OAuth revisit watch.** The "auto-place into BuildPlanner"
   delivery option and the console-cloud-delivery angle (Q2) might both
   eventually want GGG API access. We previously deferred this — see
   `memory/project_ggg_api_decision.md`. Re-evaluate if/when GGG ships
   an endpoint to upload a `.build` to a player's account.

---

Pick the next thread when you're ready.
