// Group regular passive ids by their type prefix so the editor doesn't
// have to render 169 entries in a flat list.
//
// PoE 2 passive ids look like `intelligence41__`, `armour_and_evasion27`,
// `duelist_mercenary_notable1`, `passive_keystone_zeal`. The numeric +
// underscore + dash trailing portion identifies the specific node within
// a type; the alpha prefix is the type. Stripping the trailing portion
// gives a useful grouping key.

const TRAILING_PATTERN = /^(.+?)\d+[_\-]*$/

export function passivePrefix(id: string): string {
  const m = id.match(TRAILING_PATTERN)
  return m ? m[1] : id
}

export function prefixLabel(prefix: string): string {
  // Replace underscores with spaces and Title-Case the words. Leave the
  // raw id alone if it doesn't have any underscores (e.g. "intelligence"
  // -> "Intelligence", "armour_and_evasion" -> "Armour And Evasion").
  return prefix
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
