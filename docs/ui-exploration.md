# UI/UX Exploration — poe2-build-forge

> **Status:** Exploratory thinking. None of this is decided. Every concrete
> proposal is marked **[exploratory — needs user input]**. Use this as a
> jumping-off point for design conversations, not a spec.

The eventual product is a static web app where a PoE2 player pastes a
pobb.in URL (or raw PoB code) and downloads a `.build` file ready to drop
into `Documents/My Games/Path of Exile 2/BuildPlanner/`. This document
sketches the *user-facing* shape of that experience.

## 1. Level group brackets

The user suggested grouping build hints by character level into three
brackets: **1–12 / 13–30 / 31–90**. The `.build` schema already supports
this at the data layer — `level_interval: [min, max]` lives on every
passive, skill, and item hint. The UI is just a presentation layer over
those intervals.

Approximate mapping to PoE2 progression *(some uncertainty here — verify
against actual game)*:

| Bracket | PoE2 content (approx.) | Player needs change because... |
|---|---|---|
| **1–12** | Act 1 (Clearfell, Mud Burrow, Ogham Manor) | Skill gem unlocks every few levels; very limited build identity yet. Hints should focus on "which skill to slot first" and "what to take in the early tree." |
| **13–30** | Acts 2–3 + early Cruel | Build identity solidifying. Ascendancy chosen at the trial. Hints shift to "which support gem to add next" and "transition skill X to skill Y." |
| **31–90** | Late Cruel through endgame Maps and beyond | Endgame content. Hints become "BiS unique to chase," "min-maxing the tree," and "which ascendancy notable to take last." |

**[exploratory — needs user input]** Three brackets is opinionated; the
schema supports any `[min, max]` interval. We could also offer:

- **Per-act brackets** (more granular, more clutter): `1–4`, `5–8`, …
- **User-configurable brackets** (player picks where the lines go).
- **Continuous slider** ("show me hints active at level X") — bracket-free,
  reflects the underlying interval-based data more honestly.

A continuous slider feels more like a tool, less like a guide. Brackets
feel more like a tutorial. Pick one based on whether the audience is
"someone learning the build" or "someone playing the build."

## 2. In-game appearance

The `additional_text` field in the schema supports inline markup:

- `<bold>{text}`, `<italics>{text}`, `<underline>{text}`
- Named colors: `<red>{text}`, `<green>{text}`, etc.
- Arbitrary RGB: `<rgb(r, g, b)>{text}`
- `\n` for newlines
- Tags can nest

What we **don't know with certainty** — and should verify before designing
heavily around it:

- **Rendering surface.** Are these hints shown as hover tooltips on the
  passive node / skill slot / item slot? Always-visible labels? A separate
  "Build Plan" panel? GGG's dev docs describe the data but I haven't seen
  authoritative documentation of the in-game UI.
  **[exploratory — needs user input — ideally screenshots from someone
  who's loaded a `.build` file in-game]**
- **How aggressively does the level-interval gate kick in?** When a hint's
  `level_interval` is `[25, 100]` and the character is level 24, is the
  hint hidden, dimmed, or just shown with a "future" badge?
- **Markup parser strictness.** Does an unclosed `<bold>` break the tooltip,
  or render gracefully? Probably worth fuzz-testing once we have something
  in-hand.

The web app's job is to *generate good text* that the in-game tooltip
reads correctly. The web app does not need to *render* the markup
identically — it can show a simplified preview. That said, **[exploratory
— needs user input]**, a "preview pane that approximates how the in-game
tooltip would look" might be valuable to authors of build guides; less so
for one-shot consumers.

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

**[exploratory — needs user input]** A common pattern is to ship one
default and let users toggle to others. A or B as default with C
available as an "accessibility mode" feels reasonable, but this is taste.

## 4. Help / onboarding flow

A first-time user, starting from "I have a pobb.in URL," to "I have a
`.build` file in my BuildPlanner directory":

```
1. Land on app                     - one input box, one paste target.
   |
   v
2. Paste pobb.in URL                - or upload .pob file, or paste raw
   |                                  base64. Whichever, decoder runs.
   v
3. Preview parsed build             - "We see: Ranger / Deadeye, level 89,
   |                                  142 passive allocations, 6 skill
   |                                  gems, 4 unique items. Looks right?"
   v
4. (optional) Adjust metadata       - build name, description, level
   |                                  brackets, what to include/exclude.
   v
5. Download .build file             - single button: get the file.
   |
   v
6. (instructions overlay)           - "Now drop this file into:
   |                                  Documents\My Games\Path of Exile 2
   |                                  \BuildPlanner\
   |                                  Then in-game, go to Build Planner
   |                                  and select your build."
   v
7. Done.
```

**[exploratory — needs user input]** Steps 4 and 6 are the easiest places
to fail. Step 4 because it tempts feature creep ("let users edit
everything!"); step 6 because path conventions vary by OS and we'd want
to detect and tailor (Windows path above; macOS and Linux have different
locations or may not be supported by the game at all).

## 5. Sound

Probably skip for the static web app. PoE2 has a distinctive audio
identity (parchment-rustle UI sounds, ominous ambience), but a web app
that plays sound on download is annoying more often than it's
delightful. **[exploratory — needs user input]** Reserve audio for a
hypothetical desktop app that lives alongside the game.

## 6. Open questions for the user

Concrete decisions worth weighing in on before any UI work begins:

- **Audience.** Is the primary audience (a) build-guide *authors*
  publishing `.build` files for others, or (b) build-guide *consumers*
  who just want to follow someone else's plan? The two need very
  different UIs (editor vs. one-shot converter).
- **Library vs. converter.** Should the app remember builds the user has
  downloaded ("My builds" page), or be entirely stateless?
- **Authoring features.** If we let users edit the `.build` before
  download, how much editing is in scope? Just metadata (name, brackets)?
  Per-hint text? Full passive tree editing? Each step pulls scope
  significantly.
- **Pobb.in dependence.** Does the app accept *only* pobb.in URLs, or
  also other PoB sources (maxroll.gg, raw PoB exports from PoB itself,
  uploaded `.xml`)? The decoder is format-agnostic; UX of "paste this"
  varies.
- **Game-version handling.** PoE2 patches frequently revise the passive
  tree. If a user's build was authored against `targetVersion=0_1` and
  the current game patch is `0_3`, do we (a) refuse to convert, (b)
  convert and warn, (c) convert silently? Each is defensible.
- **In-game rendering ground truth.** Do you (or someone you know) have
  a `.build` file actually loaded in-game? A few screenshots of how
  hints render would meaningfully reduce design risk for this whole
  document.
- **Mobile.** Is "open the web app on a phone, paste a URL, download a
  file" a real use case, or do we assume desktop-only since the game is
  desktop-only?
- **Branding stance.** Are we trying to look "official-adjacent"
  (in-game palette, game-aware vocabulary) or "obviously third-party"
  (neutral palette, plain language)? The legal risk is small either way
  but the social posture differs.
- **Accessibility floor.** WCAG AA contrast on text by default? Keyboard
  navigation? Screen-reader labels on the build preview? Cheap to do
  early, expensive to retrofit.
- **Shareable links.** If a user converts a pobb.in build, should they
  get a permalink that re-runs the conversion (`forge.example/b/<id>`)
  so they can share the *converted* result, or is the canonical
  shareable thing always the original pobb.in URL?

---

Pick any of these you want to chase first. The rest can wait.
