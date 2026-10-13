import { encodePobCode } from './decode'
import type { AscendancyLookup, PassiveLookup } from './map'
import type {
  BuildFile,
  BuildItem,
  BuildPassive,
  BuildSkill,
  Gem,
  PathOfBuilding2,
  Skill,
  Spec
} from './types'

/** Shown in the report and copied into PoB notes. Gear is never rebuilt. */
export const EQUIPMENT_NOT_RECONSTRUCTED =
  'Equipment was not reconstructed. Slot hints were copied into the build notes as text, not as Path of Building items.'

const TREE_VERSION = '0_5'
const TARGET_VERSION = '0_1'

export interface CharacterEntry {
  name: string
  integer_id: number
}

export interface BuildToPobOptions {
  passives: PassiveLookup
  ascendancies?: AscendancyLookup
  characters?: CharacterEntry[]
  /** Optional display names for gem `nameSpec`. Keyed by gem id. */
  gemLabels?: Record<string, string>
}

export interface ConvertedPassive {
  id: string
  pobId: number
  weaponSet?: 1 | 2
}

export interface SkippedPassive {
  id: string
  reason: 'unknown_passive'
}

export interface ConvertedGem {
  gemId: string
  level: number
}

export interface ConvertedSkillGroup {
  gemId: string
  level: number
  supports: ConvertedGem[]
}

export interface EquipmentSlotReport {
  inventoryId: string
  uniqueName?: string
  note?: string
}

export interface BuildToPobReport {
  passives: {
    converted: ConvertedPassive[]
    skipped: SkippedPassive[]
  }
  skills: {
    groups: ConvertedSkillGroup[]
  }
  equipment: {
    reconstructed: false
    message: string
    slots: EquipmentSlotReport[]
  }
  ascendancy: {
    key?: string
    className?: string
    ascendClassName?: string
    recognized: boolean
  }
}

export interface BuildToPobResult {
  pob: PathOfBuilding2
  xml: string
  code: string
  report: BuildToPobReport
}

/**
 * Turn a `.build` file back into a Path of Building 2 share code.
 *
 * Allocated passives become numeric node ids. Each skill becomes one
 * socket group. Items are not rebuilt: `additional_text` is copied into
 * the notes, and a `unique_name` is recorded only as that name.
 */
export function mapBuildToPob(
  build: BuildFile,
  options: BuildToPobOptions
): BuildToPobResult {
  assertBuild(build)

  const slugToNode = invertPassives(options.passives)
  const passives = mapPassives(build.passives ?? [], slugToNode)
  const skills = mapSkills(build.skills ?? [], options.gemLabels)
  const slots = mapSlots(build.inventory_slots ?? [])
  const ascendancy = resolveAscendancy(
    build.ascendancy,
    options.ascendancies,
    options.characters
  )
  const notes = composeNotes(build, slots)

  const spec: Spec = {
    title: build.name,
    treeVersion: TREE_VERSION,
    classId: ascendancy.classId,
    classInternalId: ascendancy.classId,
    ascendClassId: ascendancy.ascendClassId,
    ascendancyInternalId: ascendancy.key ?? '',
    nodes: passives.converted.map((p) => p.pobId),
    weaponSet1Nodes: passives.converted
      .filter((p) => p.weaponSet === 1)
      .map((p) => p.pobId),
    weaponSet2Nodes: passives.converted
      .filter((p) => p.weaponSet === 2)
      .map((p) => p.pobId)
  }

  const pob: PathOfBuilding2 = {
    build: {
      level: 1,
      className: ascendancy.className,
      ascendClassName: ascendancy.ascendClassName,
      targetVersion: TARGET_VERSION,
      viewMode: 'IMPORT',
      mainSocketGroup: skills.groups.length > 0 ? 1 : 0,
      characterLevelAutoMode: false,
      stats: []
    },
    tree: { activeSpec: 1, specs: [spec] },
    skills:
      skills.groups.length > 0
        ? {
            activeSkillSet: 1,
            skillSets: [{ id: 1, title: '', skills: skills.socketGroups }]
          }
        : undefined,
    notes,
    raw: {}
  }

  const xml = emitPobXml(pob)
  return {
    pob,
    xml,
    code: encodePobCode(xml),
    report: {
      passives: {
        converted: passives.converted,
        skipped: passives.skipped
      },
      skills: { groups: skills.groups },
      equipment: {
        reconstructed: false,
        message: EQUIPMENT_NOT_RECONSTRUCTED,
        slots
      },
      ascendancy: {
        key: ascendancy.key,
        className: ascendancy.className || undefined,
        ascendClassName: ascendancy.ascendClassName || undefined,
        recognized: ascendancy.recognized
      }
    }
  }
}

function assertBuild(build: BuildFile): void {
  if (!build || typeof build !== 'object' || Array.isArray(build)) {
    throw new Error('Expected a .build JSON object')
  }
  if (typeof build.name !== 'string' || build.name.length === 0) {
    throw new Error('Expected a .build JSON object with a name')
  }
  if (build.passives !== undefined && !Array.isArray(build.passives)) {
    throw new Error('passives must be an array')
  }
  if (build.skills !== undefined && !Array.isArray(build.skills)) {
    throw new Error('skills must be an array')
  }
  if (
    build.inventory_slots !== undefined &&
    !Array.isArray(build.inventory_slots)
  ) {
    throw new Error('inventory_slots must be an array')
  }
}

function invertPassives(lookup: PassiveLookup): Map<string, number> {
  const out = new Map<string, number>()
  for (const [pobId, entry] of Object.entries(lookup)) {
    const numeric = Number(pobId)
    if (!Number.isFinite(numeric) || out.has(entry.id)) continue
    out.set(entry.id, numeric)
  }
  return out
}

function mapPassives(
  passives: BuildPassive[],
  slugToNode: Map<string, number>
): { converted: ConvertedPassive[]; skipped: SkippedPassive[] } {
  const converted: ConvertedPassive[] = []
  const skipped: SkippedPassive[] = []
  const seen = new Set<string>()

  for (const passive of passives) {
    const id = passiveId(passive)
    if (!id || seen.has(id)) continue
    seen.add(id)

    const pobId = slugToNode.get(id)
    if (pobId === undefined) {
      skipped.push({ id, reason: 'unknown_passive' })
      continue
    }

    const weaponSet = weaponSetOf(passive)
    converted.push(
      weaponSet === undefined ? { id, pobId } : { id, pobId, weaponSet }
    )
  }

  return { converted, skipped }
}

function passiveId(passive: BuildPassive): string | undefined {
  if (typeof passive === 'string') return passive.length > 0 ? passive : undefined
  if (passive && typeof passive.id === 'string' && passive.id.length > 0) {
    return passive.id
  }
  return undefined
}

function weaponSetOf(passive: BuildPassive): 1 | 2 | undefined {
  if (typeof passive === 'string' || !passive) return undefined
  if (passive.weapon_set === 1 || passive.weapon_set === 2) return passive.weapon_set
  return undefined
}

function mapSkills(
  skills: BuildSkill[],
  gemLabels: Record<string, string> | undefined
): { groups: ConvertedSkillGroup[]; socketGroups: Skill[] } {
  const groups: ConvertedSkillGroup[] = []
  const socketGroups: Skill[] = []

  for (const skill of skills) {
    const gemId = skillGemId(skill)
    if (!gemId) continue
    const level = gemLevel(skill)
    const supports: ConvertedGem[] = []
    if (typeof skill !== 'string' && Array.isArray(skill.support_skills)) {
      for (const support of skill.support_skills) {
        const supportId = skillGemId(support)
        if (!supportId) continue
        supports.push({ gemId: supportId, level: gemLevel(support) })
      }
    }
    groups.push({ gemId, level, supports })
    socketGroups.push({
      enabled: true,
      gems: [
        toGem(gemId, level, gemLabels),
        ...supports.map((support) => toGem(support.gemId, support.level, gemLabels))
      ]
    })
  }

  return { groups, socketGroups }
}

function skillGemId(skill: BuildSkill | string | { id?: string }): string | undefined {
  if (typeof skill === 'string') return skill.length > 0 ? skill : undefined
  if (skill && typeof skill.id === 'string' && skill.id.length > 0) return skill.id
  return undefined
}

/**
 * `.build` `level_interval` is a character-level window, usually ending at
 * 100. The only gem-level signal in the file is the start of that window.
 */
function gemLevel(skill: BuildSkill | string | { level_interval?: [number, number] }): number {
  if (typeof skill === 'string' || !skill?.level_interval) return 1
  const start = skill.level_interval[0]
  if (!Number.isFinite(start)) return 1
  return Math.max(1, Math.trunc(start))
}

function toGem(
  gemId: string,
  level: number,
  gemLabels: Record<string, string> | undefined
): Gem {
  return {
    gemId,
    variantId: '',
    nameSpec: gemLabels?.[gemId] ?? '',
    skillId: '',
    level,
    quality: 0,
    enabled: true
  }
}

function mapSlots(items: BuildItem[]): EquipmentSlotReport[] {
  return items.map((item) => {
    const slot: EquipmentSlotReport = { inventoryId: item.inventory_id }
    if (typeof item.unique_name === 'string' && item.unique_name.length > 0) {
      slot.uniqueName = item.unique_name
    }
    if (
      typeof item.additional_text === 'string' &&
      item.additional_text.trim().length > 0
    ) {
      slot.note = item.additional_text
    }
    return slot
  })
}

interface ResolvedAscendancy {
  key?: string
  className: string
  ascendClassName: string
  classId: number
  ascendClassId: number
  recognized: boolean
}

function resolveAscendancy(
  ascendancy: string | undefined,
  lookup: AscendancyLookup | undefined,
  characters: CharacterEntry[] | undefined
): ResolvedAscendancy {
  const raw = ascendancy?.trim()
  if (!raw) {
    return {
      className: '',
      ascendClassName: '',
      classId: 0,
      ascendClassId: 0,
      recognized: false
    }
  }

  let key = raw
  let ascendClassName = ''
  let ascendClassId = 0
  let matchedLookup = false

  if (lookup?.[raw]) {
    matchedLookup = true
    ascendClassName = lookup[raw].name
    ascendClassId = lookup[raw].class_number
  } else if (lookup) {
    const match = Object.entries(lookup).find(([, value]) => value.name === raw)
    if (match) {
      matchedLookup = true
      key = match[0]
      ascendClassName = raw
      ascendClassId = match[1].class_number
    }
  }

  const character = longestClassPrefix(key, characters ?? [])
  return {
    key,
    className: character?.name ?? '',
    ascendClassName,
    classId: character?.integer_id ?? 0,
    ascendClassId,
    recognized: matchedLookup && character !== undefined
  }
}

function longestClassPrefix(
  key: string,
  characters: CharacterEntry[]
): CharacterEntry | undefined {
  const ranked = [...characters].sort((a, b) => b.name.length - a.name.length)
  return ranked.find((character) => key.startsWith(character.name))
}

function composeNotes(build: BuildFile, slots: EquipmentSlotReport[]): string {
  const parts: string[] = []
  if (typeof build.description === 'string' && build.description.trim()) {
    parts.push(build.description.trim())
  }
  if (typeof build.author === 'string' && build.author.trim()) {
    parts.push(`Author: ${build.author.trim()}`)
  }
  parts.push(EQUIPMENT_NOT_RECONSTRUCTED)
  if (slots.length > 0) {
    parts.push(slots.map(formatSlot).join('\n\n'))
  }
  return parts.join('\n\n')
}

function formatSlot(slot: EquipmentSlotReport): string {
  const header = slot.uniqueName
    ? `${slot.inventoryId}: ${slot.uniqueName}`
    : slot.inventoryId
  if (!slot.note) return header
  return `${header}\n${slot.note.trim()}`
}

function emitPobXml(pob: PathOfBuilding2): string {
  const build = pob.build
  const spec = pob.tree?.specs[0]
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<PathOfBuilding2>',
    `\t<Build level="${build.level}" className="${escAttr(build.className)}" ascendClassName="${escAttr(build.ascendClassName)}" targetVersion="${escAttr(build.targetVersion)}" viewMode="${escAttr(build.viewMode)}" mainSocketGroup="${build.mainSocketGroup}" characterLevelAutoMode="${build.characterLevelAutoMode ? 'true' : 'false'}"/>`
  ]

  if (spec) {
    lines.push(`\t<Tree activeSpec="${pob.tree?.activeSpec ?? 1}">`)
    lines.push(
      `\t\t<Spec title="${escAttr(spec.title)}" treeVersion="${escAttr(spec.treeVersion)}" classId="${spec.classId}" classInternalId="${spec.classInternalId}" ascendClassId="${spec.ascendClassId}" ascendancyInternalId="${escAttr(spec.ascendancyInternalId)}"${nodesAttr(spec.nodes)}>`
    )
    if (spec.weaponSet1Nodes.length > 0) {
      lines.push(`\t\t\t<WeaponSet1 nodes="${spec.weaponSet1Nodes.join(',')}"/>`)
    }
    if (spec.weaponSet2Nodes.length > 0) {
      lines.push(`\t\t\t<WeaponSet2 nodes="${spec.weaponSet2Nodes.join(',')}"/>`)
    }
    lines.push('\t\t</Spec>')
    lines.push('\t</Tree>')
  }

  const skillSet = pob.skills?.skillSets[0]
  if (skillSet && skillSet.skills.length > 0) {
    lines.push(
      `\t<Skills activeSkillSet="${pob.skills?.activeSkillSet ?? 1}">`
    )
    lines.push(`\t\t<SkillSet id="${skillSet.id}">`)
    for (const skill of skillSet.skills) {
      lines.push('\t\t\t<Skill enabled="true">')
      for (const gem of skill.gems) {
        lines.push(
          `\t\t\t\t<Gem gemId="${escAttr(gem.gemId)}" variantId="${escAttr(gem.variantId)}" nameSpec="${escAttr(gem.nameSpec)}" skillId="${escAttr(gem.skillId)}" level="${gem.level}" quality="${gem.quality}" enabled="${gem.enabled ? 'true' : 'false'}"/>`
        )
      }
      lines.push('\t\t\t</Skill>')
    }
    lines.push('\t\t</SkillSet>')
    lines.push('\t</Skills>')
  }

  if (pob.notes) {
    lines.push(`\t<Notes>${escText(pob.notes)}</Notes>`)
  }

  lines.push('</PathOfBuilding2>')
  return lines.join('\n')
}

function nodesAttr(nodes: number[]): string {
  if (nodes.length === 0) return ''
  return ` nodes="${nodes.join(',')}"`
}

function escAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
