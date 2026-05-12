/**
 * Typed representation of a Path of Building 2 export, after decode +
 * XML parse. Modelled from the actual `<PathOfBuilding2>` document
 * structure (see packages/core/tests/fixtures/pob-90pcuxN4XtJG.xml).
 *
 * Not every PoB element is modelled; rare or UI-only fields are left
 * in `raw` for advanced consumers to inspect.
 */

export interface PathOfBuilding2 {
  build: Build
  tree?: Tree
  skills?: Skills
  items?: Items
  notes?: string
  /**
   * The full fast-xml-parser output for the root element. Useful for
   * accessing fields not yet modelled by the typed accessors above.
   */
  raw: unknown
}

export interface Build {
  level: number
  className: string
  ascendClassName: string
  /** PoE2 patch tree version, e.g. "0_1". */
  targetVersion: string
  viewMode: string
  mainSocketGroup: number
  characterLevelAutoMode: boolean
  /** Computed stats from PoB; informational. */
  stats: PlayerStat[]
}

export interface PlayerStat {
  stat: string
  value: number
}

export interface Tree {
  /** 1-based index of the active spec within `specs`. */
  activeSpec: number
  specs: Spec[]
}

export interface Spec {
  title: string
  /** PoE2 patch tree version this spec was authored against, e.g. "0_4". */
  treeVersion: string
  classId: number
  classInternalId: number
  ascendClassId: number
  /** Internal ascendancy id (e.g. "Ranger1") or empty string. */
  ascendancyInternalId: string
  /** PoB's internal numeric node IDs of allocated passives. */
  nodes: number[]
  /** Allocated nodes specific to weapon set 1. */
  weaponSet1Nodes: number[]
  /** Allocated nodes specific to weapon set 2. */
  weaponSet2Nodes: number[]
  /** PoE tree-builder URL also encoding the allocation. */
  url?: string
}

export interface Skills {
  activeSkillSet: number
  skillSets: SkillSet[]
}

export interface SkillSet {
  id: number
  title: string
  skills: Skill[]
}

export interface Skill {
  /** Slot like "Weapon 1", "Body Armour"; absent for unassigned. */
  slot?: string
  enabled: boolean
  /**
   * Skill-gem group. By PoB convention the first gem is the active
   * skill and the rest are linked support gems, but this is not
   * enforced by the format.
   */
  gems: Gem[]
}

export interface Gem {
  /**
   * GGG-format BaseItemTypes id. Usable directly in our `.build`
   * schema's skill `id` and `support_skills[].id` fields.
   * Examples:
   *   "Metadata/Items/Gems/SkillGemWhirlingSlash"
   *   "Metadata/Items/Gem/SupportGemRetreat"
   * (Both singular "Gem" and plural "Gems" forms appear in PoB output.)
   */
  gemId: string
  /** PoB variant id, e.g. "WhirlingSlash" or "RapidAttacksSupport". */
  variantId: string
  /** Display name shown in PoB, e.g. "Whirling Slash" or "Rapid Attacks I". */
  nameSpec: string
  /** Internal skill id, e.g. "WhirlingSlashPlayer". */
  skillId: string
  level: number
  quality: number
  enabled: boolean
}

export interface Items {
  activeItemSet: number
  itemSets: ItemSet[]
  /**
   * Per-id catalog of items referenced by `ItemSet.slots[].itemId`.
   * Keyed by id-as-string (matching the wire format and JSON conventions).
   * Empty if the build has no items selected.
   */
  catalog: Record<string, PobItem>
}

/**
 * A single equipped item parsed from PoB's text-format `<Item>` block.
 * PoB serialises items as multi-line text starting with `Rarity: <X>`,
 * followed by the item name and base type, then implicits/mods.
 */
export interface PobItem {
  /** PoB internal id; matches `Slot.itemId`. */
  id: number
  /** `UNIQUE` / `RARE` / `MAGIC` / `NORMAL`, or empty if unparseable. */
  rarity: string
  /**
   * Item name. For uniques this is the unique's name ("Seed of Cataclysm").
   * For rares it's the rolled name. For normals it equals `baseType`.
   */
  name: string
  /** Item base type ("Lazuli Ring", "Vaal Regalia"). */
  baseType: string
}

export interface ItemSet {
  id: number
  slots: Slot[]
}

export interface Slot {
  /**
   * Inventory slot name, e.g. "Weapon 1", "Helmet", "Body Armour",
   * "Belt". Maps directly to our `.build` schema's `inventory_id`.
   */
  name: string
  /** PoB internal item id; 0 means unassigned. */
  itemId: number
}

// -----------------------------------------------------------------------------
// .build file shape (consumer side of the mapper)
// -----------------------------------------------------------------------------

/**
 * `.build` file shape, as accepted by PoE2's in-game Build Planner.
 * Mirrors `packages/schema/src/poe2-build.schema.json`. Optional
 * fields are omitted when empty so the emitted JSON is minimal.
 *
 * NOTE on naming: the dev docs and current schema use `name`; a
 * frame from the GGG reveal video shows `id` instead. We follow the
 * dev docs until ground truth is available. See
 * `docs/ui-exploration.md` Section 2 for the conflict tracking.
 */
export interface BuildFile {
  name: string
  description?: string
  ascendancy?: string
  passives?: BuildPassive[]
  skills?: BuildSkill[]
  items?: BuildItem[]
}

/** Shorthand string id, or a fuller object form with metadata. */
export type BuildPassive = string | BuildPassiveObject

export interface BuildPassiveObject {
  /** GGG `PassiveSkills` table id, e.g. "lightning14" or "AscendancyRanger1Notable3". */
  id: string
  level_interval?: [number, number]
  weapon_set?: number
  additional_text?: string
}

export type BuildSkill = string | BuildSkillObject

export interface BuildSkillObject {
  /** GGG `BaseItemTypes` id of the active skill gem. */
  id: string
  level_interval?: [number, number]
  additional_text?: string
  support_skills?: Array<string | BuildSupportObject>
}

export interface BuildSupportObject {
  /** GGG `BaseItemTypes` id of a support gem. */
  id: string
  level_interval?: [number, number]
  additional_text?: string
}

export interface BuildItem {
  inventory_id: string
  slot_x: number
  slot_y: number
  level_interval?: [number, number]
  unique_name?: string
  additional_text?: string
}
