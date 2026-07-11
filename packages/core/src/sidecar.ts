import type {
  BuildFile,
  BuildPassive,
  BuildPassiveObject,
  BuildSkill,
  BuildSkillObject,
  BuildSupportObject,
  BuildItem
} from './types'

/**
 * A single annotation overlay: the free-form hint and an optional level
 * range override. Applied on top of a base entry during compose.
 */
export interface SidecarEntry {
  additional_text?: string
  level_interval?: [number, number]
}

/** A skill's overlay, plus overlays for its support gems keyed by gem id. */
export interface SidecarSkillEntry extends SidecarEntry {
  supports?: Record<string, SidecarEntry>
}

/**
 * A build's annotations, decoupled from the converted structure so they
 * survive a re-conversion. Entries are keyed by stable identity:
 *
 *  - passives  — `id`, plus `@<weapon_set>` when weapon-set specific, plus
 *    `#<n>` when several entries share that identity (document order).
 *  - skills    — the skill gem id; its `supports` are keyed by support gem id.
 *  - inventory — `inventory_id`, plus `#<n>` for duplicate slots (charms).
 *
 * The keying is computed identically from an annotated build (extract) and a
 * fresh base (compose), so `compose(base, extract(base))` round-trips.
 */
export interface Sidecar {
  name?: string
  description?: string
  passives?: Record<string, SidecarEntry>
  skills?: Record<string, SidecarSkillEntry>
  inventory?: Record<string, SidecarEntry>
}

// --- keying --------------------------------------------------------------

interface Keyed<T> {
  key: string
  item: T
}

/**
 * Assign a stable string key to each item. Items whose base identity is
 * unique keep it verbatim; items that collide get a `#<n>` suffix in
 * document order. Deterministic for a given list.
 */
function assignKeys<T>(items: T[], identity: (item: T) => string): Keyed<T>[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const id = identity(item)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  return items.map((item) => {
    const base = identity(item)
    if ((counts.get(base) ?? 0) > 1) {
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      return { key: `${base}#${n}`, item }
    }
    return { key: base, item }
  })
}

const passiveIdentity = (p: BuildPassive): string =>
  typeof p === 'string'
    ? p
    : p.weapon_set !== undefined
      ? `${p.id}@${p.weapon_set}`
      : p.id

const skillIdentity = (s: BuildSkill): string =>
  typeof s === 'string' ? s : s.id

const supportIdentity = (s: string | BuildSupportObject): string =>
  typeof s === 'string' ? s : s.id

const itemIdentity = (i: BuildItem): string => i.inventory_id

// --- extract -------------------------------------------------------------

function entryFrom(
  item: { additional_text?: string; level_interval?: [number, number] }
): SidecarEntry | undefined {
  if (item.additional_text === undefined) return undefined
  const entry: SidecarEntry = { additional_text: item.additional_text }
  if (item.level_interval !== undefined) entry.level_interval = item.level_interval
  return entry
}

/**
 * Build a {@link Sidecar} from an annotated `.build`. Captures top-level name
 * and description plus every entry carrying an `additional_text` annotation
 * (with its `level_interval`). Non-annotated entries are omitted.
 */
export function extractSidecar(build: BuildFile): Sidecar {
  const sidecar: Sidecar = {}
  if (build.name) sidecar.name = build.name
  if (build.description) sidecar.description = build.description

  const passives: Record<string, SidecarEntry> = {}
  for (const { key, item } of assignKeys(build.passives ?? [], passiveIdentity)) {
    if (typeof item === 'string') continue
    const entry = entryFrom(item)
    if (entry) passives[key] = entry
  }
  if (Object.keys(passives).length) sidecar.passives = passives

  const skills: Record<string, SidecarSkillEntry> = {}
  for (const { key, item } of assignKeys(build.skills ?? [], skillIdentity)) {
    if (typeof item === 'string') continue
    const entry: SidecarSkillEntry = { ...(entryFrom(item) ?? {}) }
    const supports: Record<string, SidecarEntry> = {}
    for (const sup of assignKeys(item.support_skills ?? [], supportIdentity)) {
      if (typeof sup.item === 'string') continue
      const se = entryFrom(sup.item)
      if (se) supports[sup.key] = se
    }
    if (Object.keys(supports).length) entry.supports = supports
    if (Object.keys(entry).length) skills[key] = entry
  }
  if (Object.keys(skills).length) sidecar.skills = skills

  const inventory: Record<string, SidecarEntry> = {}
  for (const { key, item } of assignKeys(build.inventory_slots ?? [], itemIdentity)) {
    const entry = entryFrom(item)
    if (entry) inventory[key] = entry
  }
  if (Object.keys(inventory).length) sidecar.inventory = inventory

  return sidecar
}

// --- compose -------------------------------------------------------------

function applyEntry<T extends SidecarEntry>(target: T, entry: SidecarEntry): T {
  if (entry.additional_text !== undefined) target.additional_text = entry.additional_text
  if (entry.level_interval !== undefined) target.level_interval = entry.level_interval
  return target
}

/**
 * Apply a {@link Sidecar} on top of a base `.build`, producing a new build.
 * Deterministic and idempotent: `compose(compose(b, s), s)` equals
 * `compose(b, s)`, and unmatched sidecar keys are ignored. Shorthand-string
 * entries are upgraded to object form only when an annotation applies.
 */
export function composeSidecar(base: BuildFile, sidecar: Sidecar): BuildFile {
  const out: BuildFile = JSON.parse(JSON.stringify(base))

  if (sidecar.name !== undefined) out.name = sidecar.name
  if (sidecar.description !== undefined) out.description = sidecar.description

  if (out.passives && sidecar.passives) {
    const overlay = sidecar.passives
    out.passives = assignKeys(out.passives, passiveIdentity).map(({ key, item }) => {
      const entry = overlay[key]
      if (!entry) return item
      const obj: BuildPassiveObject =
        typeof item === 'string' ? { id: item } : { ...item }
      return applyEntry(obj, entry)
    })
  }

  if (out.skills && sidecar.skills) {
    const overlay = sidecar.skills
    out.skills = assignKeys(out.skills, skillIdentity).map(({ key, item }) => {
      const entry = overlay[key]
      if (!entry) return item
      const obj: BuildSkillObject =
        typeof item === 'string' ? { id: item } : { ...item }
      applyEntry(obj, entry)
      if (obj.support_skills && entry.supports) {
        const supOverlay = entry.supports
        obj.support_skills = assignKeys(obj.support_skills, supportIdentity).map(
          ({ key: sk, item: s }) => {
            const se = supOverlay[sk]
            if (!se) return s
            const so: BuildSupportObject =
              typeof s === 'string' ? { id: s } : { ...s }
            return applyEntry(so, se)
          }
        )
      }
      return obj
    })
  }

  if (out.inventory_slots && sidecar.inventory) {
    const overlay = sidecar.inventory
    out.inventory_slots = assignKeys(out.inventory_slots, itemIdentity).map(
      ({ key, item }) => {
        const entry = overlay[key]
        return entry ? applyEntry({ ...item }, entry) : item
      }
    )
  }

  return out
}
