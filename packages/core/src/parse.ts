import { XMLParser } from 'fast-xml-parser'
import type {
  Build,
  Gem,
  ItemSet,
  Items,
  PathOfBuilding2,
  PlayerStat,
  PobItem,
  Skill,
  SkillSet,
  Skills,
  Slot,
  Spec,
  Tree
} from './types'

type RawElement = Record<string, unknown>

const ALWAYS_ARRAYS = new Set([
  'PlayerStat',
  'Spec',
  'SkillSet',
  'Skill',
  'Gem',
  'ItemSet',
  'Slot',
  'SocketIdURL',
  'Item'
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => ALWAYS_ARRAYS.has(name)
})

/**
 * Parse a PoB `<PathOfBuilding2>` XML document into a typed structure.
 *
 * The result exposes the most commonly-needed fields (build header,
 * tree allocations, skill gems, item slots) as typed properties.
 * Anything not yet modelled is available under `raw` for advanced use.
 *
 * @throws Error if the root element isn't `<PathOfBuilding2>`.
 */
export function parsePobXml(xml: string): PathOfBuilding2 {
  const parsed = parser.parse(xml) as RawElement
  const root = parsed.PathOfBuilding2 as RawElement | undefined
  if (!root) {
    throw new Error('Expected <PathOfBuilding2> root element')
  }

  const buildEl = obj(root.Build)
  if (!buildEl) {
    throw new Error('Expected <Build> element under <PathOfBuilding2>')
  }

  return {
    build: parseBuild(buildEl),
    tree: parseTree(obj(root.Tree)),
    skills: parseSkills(obj(root.Skills)),
    items: parseItems(obj(root.Items)),
    notes: parseNotes(root.Notes),
    raw: root
  }
}

function obj(x: unknown): RawElement | undefined {
  return x && typeof x === 'object' ? (x as RawElement) : undefined
}

function arr(x: unknown): RawElement[] {
  if (Array.isArray(x)) return x as RawElement[]
  if (x && typeof x === 'object') return [x as RawElement]
  return []
}

function num(x: unknown, fallback = 0): number {
  if (typeof x === 'number') return x
  if (typeof x === 'string') {
    const n = Number(x)
    return Number.isNaN(n) ? fallback : n
  }
  return fallback
}

function str(x: unknown, fallback = ''): string {
  return x == null ? fallback : String(x)
}

function bool(x: unknown, fallback = false): boolean {
  if (typeof x === 'boolean') return x
  if (x === 'true') return true
  if (x === 'false') return false
  return fallback
}

function parseBuild(b: RawElement): Build {
  return {
    level: num(b['@_level']),
    className: str(b['@_className']),
    ascendClassName: str(b['@_ascendClassName']),
    targetVersion: str(b['@_targetVersion']),
    viewMode: str(b['@_viewMode']),
    mainSocketGroup: num(b['@_mainSocketGroup']),
    characterLevelAutoMode: bool(b['@_characterLevelAutoMode']),
    stats: arr(b.PlayerStat).map(parsePlayerStat)
  }
}

function parsePlayerStat(s: RawElement): PlayerStat {
  return {
    stat: str(s['@_stat']),
    value: num(s['@_value'])
  }
}

function parseTree(t: RawElement | undefined): Tree | undefined {
  if (!t) return undefined
  return {
    activeSpec: num(t['@_activeSpec'], 1),
    specs: arr(t.Spec).map(parseSpec)
  }
}

function parseSpec(s: RawElement): Spec {
  const ws1 = obj(s.WeaponSet1)
  const ws2 = obj(s.WeaponSet2)
  return {
    title: str(s['@_title']),
    treeVersion: str(s['@_treeVersion']),
    classId: num(s['@_classId']),
    classInternalId: num(s['@_classInternalId']),
    ascendClassId: num(s['@_ascendClassId']),
    ascendancyInternalId: str(s['@_ascendancyInternalId']),
    nodes: parseCsvIds(s['@_nodes']),
    weaponSet1Nodes: parseCsvIds(ws1?.['@_nodes']),
    weaponSet2Nodes: parseCsvIds(ws2?.['@_nodes']),
    url: parseUrl(s.URL)
  }
}

function parseUrl(u: unknown): string | undefined {
  if (u == null) return undefined
  const text = typeof u === 'object' ? str((u as RawElement)['#text']) : str(u)
  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseCsvIds(value: unknown): number[] {
  if (value == null) return []
  return String(value)
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((n) => !Number.isNaN(n))
}

function parseSkills(s: RawElement | undefined): Skills | undefined {
  if (!s) return undefined
  return {
    activeSkillSet: num(s['@_activeSkillSet'], 1),
    skillSets: arr(s.SkillSet).map(parseSkillSet)
  }
}

function parseSkillSet(s: RawElement): SkillSet {
  return {
    id: num(s['@_id']),
    title: str(s['@_title']),
    skills: arr(s.Skill).map(parseSkill)
  }
}

function parseSkill(s: RawElement): Skill {
  const slot = s['@_slot']
  return {
    slot: slot != null && slot !== '' ? str(slot) : undefined,
    enabled: bool(s['@_enabled'], true),
    gems: arr(s.Gem).map(parseGem)
  }
}

function parseGem(g: RawElement): Gem {
  return {
    gemId: str(g['@_gemId']),
    variantId: str(g['@_variantId']),
    nameSpec: str(g['@_nameSpec']),
    skillId: str(g['@_skillId']),
    level: num(g['@_level'], 1),
    quality: num(g['@_quality']),
    enabled: bool(g['@_enabled'], true)
  }
}

function parseItems(i: RawElement | undefined): Items | undefined {
  if (!i) return undefined
  const catalog: Record<string, PobItem> = {}
  for (const rawItem of arr(i.Item)) {
    const parsed = parsePobItem(rawItem)
    if (parsed.id > 0) {
      catalog[String(parsed.id)] = parsed
    }
  }
  return {
    activeItemSet: num(i['@_activeItemSet'], 1),
    itemSets: arr(i.ItemSet).map(parseItemSet),
    catalog
  }
}

function parsePobItem(raw: RawElement): PobItem {
  const id = num(raw['@_id'])
  // PoB serialises Item bodies as text. fxp puts text under `#text` when the
  // element also has attributes; otherwise the whole value is a string.
  const text =
    typeof raw === 'string'
      ? raw
      : str((raw as RawElement)['#text'])

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let rarity = ''
  let name = ''
  let baseType = ''

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    if (line.startsWith('Rarity:')) {
      rarity = line.slice('Rarity:'.length).trim()
      // PoB convention: the next two non-blank lines are the item's display
      // name and its base type, in that order.
      if (idx + 1 < lines.length) name = lines[idx + 1]
      if (idx + 2 < lines.length) baseType = lines[idx + 2]
      break
    }
  }

  return { id, rarity, name, baseType }
}

function parseItemSet(s: RawElement): ItemSet {
  return {
    id: num(s['@_id']),
    slots: arr(s.Slot).map(parseSlot)
  }
}

function parseSlot(s: RawElement): Slot {
  return {
    name: str(s['@_name']),
    itemId: num(s['@_itemId'])
  }
}

function parseNotes(n: unknown): string | undefined {
  if (typeof n === 'string') {
    return n.length > 0 ? n : undefined
  }
  if (n && typeof n === 'object') {
    const text = str((n as RawElement)['#text']).trim()
    return text.length > 0 ? text : undefined
  }
  return undefined
}
