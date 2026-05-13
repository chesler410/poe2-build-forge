import type { AscendancyLookup } from '@poe2-build-forge/core'

// PoE 2 ascendancy keys follow the pattern <ParentClass><N>:
//
//   "Mercenary2" -> parent class "Mercenary", display name "Witchhunter"
//   "Druid1"     -> parent class "Druid",     display name "Oracle"
//   "Ranger2"    -> parent class "Ranger",    display name "Pathfinder"
//
// A build's `ascendancy` field can be either the key (when the mapper
// had an AscendancyLookup at conversion time) or PoB's display name as
// a passthrough fallback. formatAscendancy handles both forms and
// returns a readable "Display (Parent)" string.

export function formatAscendancy(
  value: string,
  lookup: AscendancyLookup | undefined | null
): string {
  if (!value) return ''

  // Case 1: value is a key the lookup recognizes.
  if (lookup && value in lookup) {
    const display = lookup[value].name
    const parent = stripTrailingNumber(value)
    return parent && parent !== value ? `${display} (${parent})` : display
  }

  // Case 2: value is a display name. Search the lookup for a matching entry.
  if (lookup) {
    for (const [key, entry] of Object.entries(lookup)) {
      if (entry.name === value) {
        const parent = stripTrailingNumber(key)
        return parent ? `${value} (${parent})` : value
      }
    }
  }

  // Case 3: no lookup or no match — pass through.
  return value
}

function stripTrailingNumber(s: string): string {
  return s.replace(/\d+$/, '')
}
