import type {
  BuildFile,
  BuildPassive,
  BuildSkill,
  BuildItem,
  PathOfBuilding2
} from './types'

/**
 * Lookup table mapping PoB integer node IDs (as string keys) to GGG
 * passive-skill metadata. Comes from the pruned data file at
 * `packages/core/data/pruned/passives_default.json`. Provided by the
 * caller so the mapper stays pure and the data isn't force-bundled
 * into the published package.
 */
export interface PassiveLookup {
  [pobNodeId: string]: {
    /** GGG `PassiveSkills` table id, e.g. "lightning14". */
    id: string
    name: string
    is_notable: boolean
    is_keystone: boolean
    is_jewel_socket: boolean
    /** Internal ascendancy id (e.g. "Ranger1") or empty. */
    ascendancy: string
  }
}

/**
 * Lookup table mapping ascendancy keys (e.g. "Druid1", "Ranger2") to
 * their display names. Comes from the pruned `ascendancies.json`.
 */
export interface AscendancyLookup {
  [key: string]: {
    name: string
    class_number: number
  }
}

export interface MapOptions {
  /**
   * Passive node lookup. Required to translate PoB integer node IDs
   * into GGG-format passive ids.
   */
  passives: PassiveLookup
  /**
   * Optional ascendancy lookup. When provided, the mapper resolves
   * the GGG-format ascendancy key (e.g. "Ranger2") from PoB's
   * display name (e.g. "Deadeye") + `className` (e.g. "Ranger").
   * When absent, the mapper passes through PoB's display name as-is
   * — this matches the format observed in GGG's reveal screenshot.
   */
  ascendancies?: AscendancyLookup
  /** Override the build's `name`. Defaults to a class/ascendancy summary. */
  name?: string
  /** Override the build's `description`. Defaults to PoB `<Notes>` content. */
  description?: string
}

/**
 * Translate a parsed PoB document into a `.build`-shape object the
 * in-game Build Planner can load. Passes through gem ids (already
 * in GGG's `Metadata/Items/Gem(s)/...` format) and slot names
 * (after space-stripping). Translates passive-tree integer ids via
 * the provided `passives` lookup. Handles ascendancy translation
 * defensively given the open dev-docs vs reveal-screenshot conflict.
 */
export function mapPobToBuild(
  pob: PathOfBuilding2,
  options: MapOptions
): BuildFile {
  const out: BuildFile = {
    name: options.name ?? deriveName(pob)
  }

  const description = options.description ?? pob.notes ?? ''
  if (description.length > 0) out.description = description

  const ascendancy = mapAscendancy(pob, options.ascendancies)
  if (ascendancy) out.ascendancy = ascendancy

  const passives = mapPassives(pob, options.passives)
  if (passives && passives.length > 0) out.passives = passives

  const skills = mapSkills(pob)
  if (skills && skills.length > 0) out.skills = skills

  const items = mapItems(pob)
  if (items && items.length > 0) out.items = items

  return out
}

function deriveName(pob: PathOfBuilding2): string {
  const className = pob.build.className || 'Build'
  const ascend = pob.build.ascendClassName
  return ascend ? `${className} - ${ascend}` : className
}

function mapAscendancy(
  pob: PathOfBuilding2,
  lookup: AscendancyLookup | undefined
): string | undefined {
  const display = pob.build.ascendClassName
  if (!display) return undefined
  if (!lookup) return display // pass-through (screenshot-format fallback)

  const className = pob.build.className
  for (const [key, value] of Object.entries(lookup)) {
    if (!key.startsWith(className)) continue
    if (value.name === display) return key
  }
  // No match — fall through to display name rather than dropping data.
  return display
}

function mapPassives(
  pob: PathOfBuilding2,
  lookup: PassiveLookup
): BuildPassive[] | undefined {
  if (!pob.tree) return undefined
  const spec =
    pob.tree.specs[pob.tree.activeSpec - 1] ?? pob.tree.specs[0]
  if (!spec) return undefined

  const out: BuildPassive[] = []
  for (const nodeId of spec.nodes) {
    const entry = lookup[String(nodeId)]
    if (!entry) continue // node id not in lookup (rare; possibly stale data)
    if (entry.is_jewel_socket) continue // sockets aren't allocations
    out.push(entry.id)
  }
  return out
}

function mapSkills(pob: PathOfBuilding2): BuildSkill[] | undefined {
  if (!pob.skills) return undefined
  const skillSet =
    pob.skills.skillSets.find((s) => s.id === pob.skills!.activeSkillSet) ??
    pob.skills.skillSets[pob.skills.activeSkillSet - 1] ??
    pob.skills.skillSets[0]
  if (!skillSet) return undefined

  const out: BuildSkill[] = []
  for (const skill of skillSet.skills) {
    if (!skill.enabled || skill.gems.length === 0) continue
    const main = skill.gems[0]
    if (!main.gemId) continue
    const supports = skill.gems
      .slice(1)
      .filter((g) => g.enabled && g.gemId)
      .map((g) => g.gemId)
    if (supports.length === 0) {
      out.push(main.gemId)
    } else {
      out.push({ id: main.gemId, support_skills: supports })
    }
  }
  return out
}

function mapItems(pob: PathOfBuilding2): BuildItem[] | undefined {
  if (!pob.items) return undefined
  const itemSet =
    pob.items.itemSets.find((s) => s.id === pob.items!.activeItemSet) ??
    pob.items.itemSets[pob.items.activeItemSet - 1] ??
    pob.items.itemSets[0]
  if (!itemSet) return undefined

  const out: BuildItem[] = []
  for (const slot of itemSet.slots) {
    if (slot.itemId === 0) continue // empty slot, no hint to emit
    out.push({
      inventory_id: translateSlotName(slot.name),
      slot_x: 0,
      slot_y: 0
    })
  }
  return out
}

/**
 * Translate PoB inventory slot names ("Weapon 1", "Body Armour") to
 * the `.build` schema's `inventory_id` format (no spaces, "Helm" for
 * helmets, etc., matching the schema example values).
 */
function translateSlotName(name: string): string {
  const map: Record<string, string> = {
    'Weapon 1': 'Weapon1',
    'Weapon 2': 'Weapon2',
    'Weapon 1 Swap': 'Offhand1',
    'Weapon 2 Swap': 'Offhand2',
    'Body Armour': 'BodyArmour',
    Helmet: 'Helm',
    Gloves: 'Gloves',
    Boots: 'Boots',
    Belt: 'Belt',
    Amulet: 'Amulet',
    'Ring 1': 'Ring',
    'Ring 2': 'Ring2',
    'Flask 1': 'Flask1',
    'Flask 2': 'Flask2'
  }
  return map[name] ?? name.replace(/\s+/g, '')
}
