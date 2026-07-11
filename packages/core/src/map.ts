import type {
  BuildFile,
  BuildPassive,
  BuildSkill,
  BuildSkillObject,
  BuildSupportObject,
  BuildItem,
  PathOfBuilding2
} from './types'

/**
 * "Always show" level range. Real 0.5 `.build` files from Mobalytics and
 * Maxroll tag every skill, support, and item with a level_interval; the
 * in-game planner needs it to surface the hint across all levels (without
 * it, skills anchor to each gem's unlock level — the "one gem per tier"
 * behaviour observed in testing). `[1, 100]` spans the whole level range.
 */
const ALWAYS_SHOWN: [number, number] = [1, 100]

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

/**
 * A node the mapper could not translate. Surfaced to the caller (and the
 * UI) rather than dropped — a build that silently loses tree allocations
 * is worse than one that warns about them. The usual cause is stale
 * bundled tree data after a patch; run `pnpm fetch-data` to refresh.
 */
export interface MapWarning {
  type: 'unmapped_node'
  /** The PoB integer node id that had no entry in the passive lookup. */
  pobId: number
}

/**
 * Result of {@link mapPobToBuild}: the converted build plus any warnings
 * gathered while mapping (currently unmapped passive nodes).
 */
export interface MapResult {
  build: BuildFile
  warnings: MapWarning[]
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
): MapResult {
  const out: BuildFile = {
    name: options.name ?? deriveName(pob)
  }

  const description = options.description ?? pob.notes ?? ''
  if (description.length > 0) out.description = description

  const ascendancy = mapAscendancy(pob, options.ascendancies)
  if (ascendancy) out.ascendancy = ascendancy

  const { passives, warnings } = mapPassives(pob, options.passives)
  if (passives.length > 0) out.passives = passives

  const skills = mapSkills(pob)
  if (skills && skills.length > 0) out.skills = skills

  const items = mapItems(pob)
  if (items && items.length > 0) out.inventory_slots = items

  return { build: out, warnings }
}

// PoB stores "None" as the placeholder ascendClassName when the
// player hasn't picked an ascendancy yet. Treat it as equivalent
// to absent so we don't emit "Witch - None" build names or
// `ascendancy: "None"` fields.
function isMeaningfulAscendancy(value: string | undefined): value is string {
  return !!value && value !== 'None'
}

function deriveName(pob: PathOfBuilding2): string {
  const className = pob.build.className || 'Build'
  const ascend = pob.build.ascendClassName
  return isMeaningfulAscendancy(ascend) ? `${className} - ${ascend}` : className
}

function mapAscendancy(
  pob: PathOfBuilding2,
  lookup: AscendancyLookup | undefined
): string | undefined {
  const display = pob.build.ascendClassName
  if (!isMeaningfulAscendancy(display)) return undefined
  if (!lookup) return display // pass-through (screenshot-format fallback)

  const className = pob.build.className
  for (const [key, value] of Object.entries(lookup)) {
    if (!key.startsWith(className)) continue
    if (value.name === display) return key
  }
  // No match — fall through to display name rather than dropping data.
  return display
}

interface MappedPassives {
  passives: BuildPassive[]
  warnings: MapWarning[]
}

function mapPassives(
  pob: PathOfBuilding2,
  lookup: PassiveLookup
): MappedPassives {
  if (!pob.tree) return { passives: [], warnings: [] }
  const specs = pob.tree.specs
  if (specs.length === 0) return { passives: [], warnings: [] }

  // The LAST spec is taken as the canonical "final" allocation set
  // — build creators add specs progressively, so the last spec
  // contains every node the build eventually picks up.
  const finalSpec = specs[specs.length - 1]

  const out: BuildPassive[] = []
  const warnings: MapWarning[] = []

  // A node with no lookup entry can't be translated to a GGG id. This is
  // almost always stale bundled tree data after a patch. Surface it as a
  // warning instead of dropping it — game-accepted .build files include
  // every allocated node (jewel sockets included), so silent loss is a bug.
  const warnUnmapped = (nodeId: number) => {
    warnings.push({ type: 'unmapped_node', pobId: nodeId })
  }

  // Single-spec builds: no progression info to derive. Emit shorthand
  // strings (always-shown hints).
  if (specs.length === 1) {
    for (const nodeId of finalSpec.nodes) {
      const entry = lookup[String(nodeId)]
      if (!entry) {
        warnUnmapped(nodeId)
        continue
      }
      out.push(entry.id)
    }
    return { passives: out, warnings }
  }

  // Multi-spec builds: derive a level_interval per node from the
  // earliest spec it appears in. Spec 0 starts at level 1 (no
  // interval emitted, so the hint always shows); each later spec's
  // start level is distributed evenly across 1–100 — a deliberately
  // simple heuristic that conveys relative ordering without
  // pretending we know the exact levels the build creator intended.
  const startLevelForSpec = (specIndex: number): number => {
    if (specIndex === 0) return 1
    return Math.round((100 * specIndex) / specs.length)
  }

  // First (earliest) spec index each node appears in.
  const earliestSpecForNode = new Map<number, number>()
  for (let i = 0; i < specs.length; i++) {
    for (const nodeId of specs[i].nodes) {
      if (!earliestSpecForNode.has(nodeId)) {
        earliestSpecForNode.set(nodeId, i)
      }
    }
  }

  for (const nodeId of finalSpec.nodes) {
    const entry = lookup[String(nodeId)]
    if (!entry) {
      warnUnmapped(nodeId)
      continue
    }

    const earliestSpec = earliestSpecForNode.get(nodeId) ?? specs.length - 1
    const startLevel = startLevelForSpec(earliestSpec)

    if (startLevel <= 1) {
      out.push(entry.id)
    } else {
      out.push({ id: entry.id, level_interval: [startLevel, 100] })
    }
  }
  return { passives: out, warnings }
}

function mapSkills(pob: PathOfBuilding2): BuildSkill[] | undefined {
  if (!pob.skills) return undefined
  const skillSet =
    pob.skills.skillSets.find((s) => s.id === pob.skills!.activeSkillSet) ??
    pob.skills.skillSets[pob.skills.activeSkillSet - 1] ??
    pob.skills.skillSets[0]
  if (!skillSet) return undefined

  const out: BuildSkill[] = []
  const seen = new Set<string>()
  for (const skill of skillSet.skills) {
    if (!skill.enabled || skill.gems.length === 0) continue
    const main = skill.gems[0]
    if (!main.gemId) continue
    const supports: BuildSupportObject[] = skill.gems
      .slice(1)
      .filter((g) => g.enabled && g.gemId)
      .map((g) => ({ id: g.gemId, level_interval: ALWAYS_SHOWN }))
    // Dedupe identical skill groups. PoB can socket the same gem in
    // multiple groups (e.g. across both weapon sets), which would
    // otherwise emit the same hint twice. Key on the main gem + its
    // support ids so genuinely-different setups of the same skill are
    // still kept; only exact repeats are dropped.
    const key = main.gemId + '|' + supports.map((s) => s.id).join(',')
    if (seen.has(key)) continue
    seen.add(key)
    const built: BuildSkillObject = {
      id: main.gemId,
      level_interval: ALWAYS_SHOWN
    }
    if (supports.length > 0) built.support_skills = supports
    out.push(built)
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
    const inventoryId = translateSlotName(slot.name)
    if (inventoryId === null) continue // slot not part of the game vocabulary
    const buildItem: BuildItem = {
      inventory_id: inventoryId,
      slot_x: 0,
      slot_y: 0,
      level_interval: ALWAYS_SHOWN
    }

    // Enrich with item info from the catalog if available. Uniques go
    // into the schema's structured `unique_name`; rares/magics/normals
    // surface as a free-form `additional_text` hint since the schema
    // doesn't model them structurally.
    const item = pob.items.catalog[String(slot.itemId)]
    if (item) {
      if (item.rarity === 'UNIQUE' && item.name) {
        buildItem.unique_name = item.name
      } else if (item.rarity && (item.baseType || item.name)) {
        // RARE items have separate name + baseType ("Sol Paw" /
        // "Opulent Gloves") — surface both. MAGIC and NORMAL items
        // don't have a separate base-type line in PoB's text format
        // (the name itself contains the base), so just surface name.
        let hint: string
        if (item.baseType && item.name && item.name !== item.baseType) {
          hint = `${item.rarity}: ${item.baseType} ("${item.name}")`
        } else if (item.name) {
          hint = `${item.rarity}: ${item.name}`
        } else {
          hint = `${item.rarity}: ${item.baseType}`
        }
        buildItem.additional_text = hint
      }
    }

    out.push(buildItem)
  }
  return out
}

/**
 * Translate a PoB inventory slot name ("Weapon 1", "Body Armour") to the
 * `.build` `inventory_id` vocabulary. This mapping is verified against
 * game-accepted `.build` files (repo `fixtures/`), which are ground truth
 * over GGG's developer docs:
 *
 *  - Weapons: `Weapon1` (set I) and `Weapon2` (the weapon-swap set II).
 *    There is NO `Offhand` — the game never emits it. Staff builds put
 *    the swap weapon in "Weapon 1 Swap" -> `Weapon2`.
 *  - Armour is always suffixed: `Helm1`, `BodyArmour1`, `Gloves1`, `Boots1`.
 *  - Jewellery: `Amulet1`, `Belt1`, `Ring1`, `Ring2`. Rings are the only
 *    category that increments.
 *  - Every charm collapses to `Charm1`; every flask to `Flask1`, regardless
 *    of how many are equipped.
 *
 * Returns `null` for slots outside this vocabulary (PoB carries empty
 * placeholder slots like "Ring 3", "Arm 1", "Leg 1"); the caller skips
 * them rather than emitting a non-vocabulary id.
 *
 * Note: a set-I offhand ("Weapon 2") and a swap weapon ("Weapon 1 Swap")
 * both target `Weapon2`. No game-accepted fixture exercises both at once
 * (two-handed staff builds have no set-I offhand); if a build ever did,
 * two `Weapon2` hints would be emitted.
 */
function translateSlotName(name: string): string | null {
  const map: Record<string, string> = {
    'Weapon 1': 'Weapon1',
    'Weapon 2': 'Weapon2',
    'Weapon 1 Swap': 'Weapon2',
    'Weapon 2 Swap': 'Weapon2',
    'Body Armour': 'BodyArmour1',
    Helmet: 'Helm1',
    Gloves: 'Gloves1',
    Boots: 'Boots1',
    Belt: 'Belt1',
    Amulet: 'Amulet1',
    'Ring 1': 'Ring1',
    'Ring 2': 'Ring2',
    'Charm 1': 'Charm1',
    'Charm 2': 'Charm1',
    'Charm 3': 'Charm1',
    'Flask 1': 'Flask1',
    'Flask 2': 'Flask1'
  }
  return map[name] ?? null
}
