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
