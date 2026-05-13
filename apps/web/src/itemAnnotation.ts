// Parser for the `additional_text` strings the mapper produces for
// equipped items. The mapper packs item rarity + base + rolled name
// into a single string with the format:
//
//   NORMAL:  "NORMAL: <base type>"
//   MAGIC:   "MAGIC: <full magic-affixed name>"
//   RARE:    "RARE: <base type> (\"<rolled name>\")"
//   UNIQUE:  uniques use the `unique_name` field instead — not this string.
//
// We parse so the editor can show a readable "Vengeance Core (Rare
// Siege Crossbow)" instead of the raw "RARE: Siege Crossbow
// (\"Vengeance Core\")".

export type ItemRarity = 'NORMAL' | 'MAGIC' | 'RARE' | 'UNIQUE'

export interface ParsedItem {
  rarity: ItemRarity
  /** Base type for rares; full affixed name for magics; base type for normals. */
  baseType?: string
  /** The rolled name in quotes — only set for rares. */
  name?: string
}

const RARITY_PATTERN = /^(NORMAL|MAGIC|RARE|UNIQUE):\s*(.+)$/
const RARE_NAME_PATTERN = /^(.+?)\s+\("(.+)"\)$/

export function parseItemAnnotation(s: string | undefined): ParsedItem | null {
  if (!s) return null
  const m = s.match(RARITY_PATTERN)
  if (!m) return null
  const rarity = m[1] as ItemRarity
  const rest = m[2]
  const rareMatch = rest.match(RARE_NAME_PATTERN)
  if (rareMatch) {
    return { rarity, baseType: rareMatch[1], name: rareMatch[2] }
  }
  return { rarity, baseType: rest }
}
