import { useState } from 'react'
import type {
  BuildFile,
  BuildPassive,
  BuildPassiveObject,
  BuildSkill,
  BuildSkillObject,
  BuildItem
} from '@poe2-build-forge/core'
import { renderMarkup } from './markup'
import { parseItemAnnotation } from './itemAnnotation'
import { passivePrefix, prefixLabel } from './passiveGroup'

export interface EditorLabels {
  /** Map from GGG passive id (e.g. "armour21_") to display name ("Strength"). */
  passiveNameById: Record<string, string>
  /**
   * Map from gem `Metadata/Items/Gems/...` id to authoritative display
   * name extracted from PoB's Gems.lua (e.g. "Sigil of Power" with the
   * correct lowercase "of", which CamelCase splitting can't produce).
   */
  gemNameById: Record<string, string>
}

interface Props {
  build: BuildFile
  onChange: (next: BuildFile) => void
  labels?: EditorLabels
}

export function BuildEditor({ build, onChange, labels }: Props) {
  const passives = build.passives ?? []
  const skills = build.skills ?? []
  const items = build.items ?? []

  return (
    <div className="build-editor">
      <div className="editor-section">
        <label className="editor-field">
          <span className="editor-label">Build name</span>
          <input
            type="text"
            value={build.name}
            onChange={(e) => onChange({ ...build, name: e.target.value })}
          />
        </label>
        <label className="editor-field">
          <span className="editor-label">Description</span>
          <textarea
            rows={3}
            value={build.description ?? ''}
            placeholder="Top-level note shown above the build in-game. Markup: <bold>{...}, <italics>{...}, <underline>{...}, <red>{...}, <green>{...}, <rgb(r, g, b)>{...}. Use \n for newlines."
            onChange={(e) =>
              onChange({
                ...build,
                description: e.target.value === '' ? undefined : e.target.value
              })
            }
          />
          {build.description && (
            <MarkupPreview value={build.description} />
          )}
        </label>
        <p className="editor-markup-hint">
          Markup tags can nest, e.g. <code>{'<underline>{<red>{Warning}}'}</code>.
        </p>
      </div>

      {passives.length > 0 && (
        <PassivesSection
          passives={passives}
          labels={labels}
          onChange={(next) => onChange({ ...build, passives: next })}
        />
      )}

      {skills.length > 0 && (
        <EntryListEditor
          title={`Skill groups (${skills.length})`}
          entries={skills}
          renderHeader={(s) => skillHeader(s, labels)}
          renderRow={(s, onEntryChange) => (
            <SkillRow
              skill={normalizeSkill(s)}
              onChange={(next) => onEntryChange(collapseSkill(next))}
            />
          )}
          searchableText={(s) => {
            const obj = normalizeSkill(s)
            return `${obj.id} ${labels?.gemNameById[obj.id] ?? formatGemId(obj.id)}`
          }}
          onChange={(next) => onChange({ ...build, skills: next })}
        />
      )}

      {items.length > 0 && (
        <EntryListEditor
          title={`Item-slot hints (${items.length})`}
          entries={items}
          renderHeader={(it) => itemHeader(it)}
          renderRow={(it, onEntryChange) => (
            <ItemRowEditor
              item={it}
              onChange={(next) => onEntryChange(next)}
            />
          )}
          searchableText={(it) => {
            const parsed = parseItemAnnotation(it.additional_text)
            return [
              it.inventory_id,
              it.unique_name ?? '',
              parsed?.name ?? '',
              parsed?.baseType ?? '',
              it.additional_text ?? ''
            ].join(' ')
          }}
          onChange={(next) => onChange({ ...build, items: next })}
        />
      )}
    </div>
  )
}

function PassivesSection({
  passives,
  labels,
  onChange
}: {
  passives: BuildPassive[]
  labels?: EditorLabels
  onChange: (next: BuildPassive[]) => void
}) {
  const isAscendancy = (p: BuildPassive) =>
    normalizePassive(p).id.startsWith('Ascendancy')

  // Bucket regular passives by id-prefix so a 169-entry list collapses
  // to ~20 type groups. Ascendancy entries stay in one block; they're
  // small enough that grouping adds noise.
  const ascendancyIdx: number[] = []
  const groups = new Map<string, number[]>()
  passives.forEach((p, i) => {
    if (isAscendancy(p)) {
      ascendancyIdx.push(i)
      return
    }
    const prefix = passivePrefix(normalizePassive(p).id)
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(i)
  })
  const sortedPrefixes = [...groups.keys()].sort()
  const regularCount = sortedPrefixes.reduce(
    (s, k) => s + groups.get(k)!.length,
    0
  )

  function applyGroup(originalIndices: number[], nextSubset: BuildPassive[]) {
    const copy = passives.slice()
    originalIndices.forEach((origIdx, k) => {
      copy[origIdx] = nextSubset[k]
    })
    onChange(copy)
  }

  return (
    <>
      {regularCount > 0 && (
        <details
          className="editor-section"
          open={regularCount <= 12}
        >
          <summary className="editor-section-title">
            Passives ({regularCount}, {sortedPrefixes.length} types)
          </summary>
          <div className="passive-groups">
            {sortedPrefixes.map((prefix) => {
              const indices = groups.get(prefix)!
              const entries = indices.map((i) => passives[i])
              return (
                <details
                  key={prefix}
                  className="editor-subsection"
                  open={entries.length <= 3}
                >
                  <summary className="editor-subsection-title">
                    {prefixLabel(prefix)} ({entries.length})
                  </summary>
                  <ul className="entry-list">
                    {entries.map((entry, k) => (
                      <li key={indices[k]} className="entry-row">
                        {passiveHeader(entry, labels)}
                        <PassiveRowEditor
                          passive={normalizePassive(entry)}
                          onChange={(next) => {
                            const copy = entries.slice()
                            copy[k] = collapseObj(next)
                            applyGroup(indices, copy)
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              )
            })}
          </div>
        </details>
      )}
      {ascendancyIdx.length > 0 && (
        <EntryListEditor
          title={`Ascendancy passives (${ascendancyIdx.length})`}
          entries={ascendancyIdx.map((i) => passives[i])}
          renderHeader={(p) => passiveHeader(p, labels)}
          renderRow={(p, onEntryChange) => (
            <PassiveRowEditor
              passive={normalizePassive(p)}
              onChange={(next) => onEntryChange(collapseObj(next))}
            />
          )}
          searchableText={(p) => {
            const obj = normalizePassive(p)
            return `${obj.id} ${labels?.passiveNameById[obj.id] ?? ''}`
          }}
          onChange={(next) => applyGroup(ascendancyIdx, next)}
        />
      )}
    </>
  )
}

function passiveHeader(p: BuildPassive, labels?: EditorLabels): React.ReactNode {
  const obj = normalizePassive(p)
  const name = labels?.passiveNameById[obj.id]
  return (
    <div className="entry-header">
      {name && <span className="entry-name">{name}</span>}
      <code className="entry-id">{obj.id}</code>
    </div>
  )
}

function skillHeader(s: BuildSkill, labels?: EditorLabels): React.ReactNode {
  const obj = normalizeSkill(s)
  // PoB's gem name is authoritative; fall back to CamelCase splitting
  // when the gem isn't in the bundled lookup (data drift, new gems).
  const pretty = labels?.gemNameById[obj.id] ?? formatGemId(obj.id)
  return (
    <div className="entry-header">
      {pretty !== obj.id && <span className="entry-name">{pretty}</span>}
      <code className="entry-id">{obj.id}</code>
    </div>
  )
}

function itemHeader(it: BuildItem): React.ReactNode {
  const parsed = parseItemAnnotation(it.additional_text)

  let primary: string
  let secondary: string

  if (it.unique_name) {
    primary = it.unique_name
    secondary = `Unique · ${it.inventory_id}`
  } else if (parsed?.rarity === 'RARE' && parsed.name) {
    primary = parsed.name
    secondary = `Rare ${parsed.baseType ?? ''} · ${it.inventory_id}`.trim()
  } else if (parsed?.rarity === 'MAGIC' && parsed.baseType) {
    primary = parsed.baseType
    secondary = `Magic · ${it.inventory_id}`
  } else if (parsed?.rarity === 'NORMAL' && parsed.baseType) {
    primary = parsed.baseType
    secondary = `Normal · ${it.inventory_id}`
  } else {
    primary = it.inventory_id
    secondary = `at (${it.slot_x}, ${it.slot_y})`
  }

  return (
    <div className="entry-header">
      <span className="entry-name">{primary}</span>
      <code className="entry-id">{secondary}</code>
    </div>
  )
}

// Turn "Metadata/Items/Gem/SkillGemSigilOfPower" into "Sigil Of Power".
// Handles both singular Gem/ and plural Gems/ paths and SkillGem/SupportGem
// prefixes. Falls back to the raw id when the shape doesn't match.
function formatGemId(id: string): string {
  const m = id.match(/^Metadata\/Items\/Gems?\/(?:Skill|Support)Gem(.+)$/)
  if (!m) return id
  return m[1]
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim()
}

interface EntryListProps<T> {
  title: string
  entries: T[]
  renderHeader: (entry: T) => React.ReactNode
  renderRow: (entry: T, onEntryChange: (next: T) => void) => React.ReactNode
  searchableText?: (entry: T) => string
  onChange: (next: T[]) => void
}

function EntryListEditor<T>({
  title,
  entries,
  renderHeader,
  renderRow,
  searchableText,
  onChange
}: EntryListProps<T>) {
  const [query, setQuery] = useState('')
  const showSearch = !!searchableText && entries.length > 6
  const q = query.trim().toLowerCase()
  const visible = entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) =>
      q === '' || !searchableText
        ? true
        : searchableText(entry).toLowerCase().includes(q)
    )

  return (
    <details className="editor-section" open={entries.length <= 8}>
      <summary className="editor-section-title">{title}</summary>
      {showSearch && (
        <input
          type="search"
          className="entry-search"
          value={query}
          placeholder="Filter by name or id…"
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {visible.length === 0 ? (
        <p className="entry-no-match">No entries match "{query}".</p>
      ) : (
        <ul className="entry-list">
          {visible.map(({ entry, idx }) => (
            <li key={idx} className="entry-row">
              {renderHeader(entry)}
              {renderRow(entry, (next) => {
                const copy = entries.slice()
                copy[idx] = next
                onChange(copy)
              })}
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

interface Annotatable {
  level_interval?: [number, number]
  additional_text?: string
}

function AnnotationRow<T extends Annotatable>({
  obj,
  onChange
}: {
  obj: T
  onChange: (next: T) => void
}) {
  const [lo, hi] = obj.level_interval ?? [undefined, undefined]
  return (
    <div className="annotation-row">
      <div className="level-interval">
        <span className="ll">Lv</span>
        <input
          type="number"
          min={0}
          max={100}
          value={lo ?? ''}
          placeholder="0"
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value)
            onChange({
              ...obj,
              level_interval: pairOrUndef(v, hi)
            })
          }}
        />
        <span className="ll">–</span>
        <input
          type="number"
          min={0}
          max={100}
          value={hi ?? ''}
          placeholder="100"
          onChange={(e) => {
            const v = e.target.value === '' ? undefined : Number(e.target.value)
            onChange({
              ...obj,
              level_interval: pairOrUndef(lo, v)
            })
          }}
        />
      </div>
      <textarea
        className="annotation-text"
        rows={2}
        value={obj.additional_text ?? ''}
        placeholder="Note shown in-game when hovering this entry."
        onChange={(e) =>
          onChange({
            ...obj,
            additional_text: e.target.value === '' ? undefined : e.target.value
          })
        }
      />
      {obj.additional_text && <MarkupPreview value={obj.additional_text} />}
    </div>
  )
}

function MarkupPreview({ value }: { value: string }) {
  return (
    <div className="markup-preview">
      <span className="markup-preview-label">Preview</span>
      <div className="markup-preview-body">{renderMarkup(value)}</div>
    </div>
  )
}

function SkillRow({
  skill,
  onChange
}: {
  skill: BuildSkillObject
  onChange: (next: BuildSkillObject) => void
}) {
  return <AnnotationRow obj={skill} onChange={(next) => onChange({ ...skill, ...next })} />
}

function PassiveRowEditor({
  passive,
  onChange
}: {
  passive: BuildPassiveObject
  onChange: (next: BuildPassiveObject) => void
}) {
  return (
    <>
      <div className="extras-row">
        <label className="extras-field">
          <span className="extras-label">Display name</span>
          <input
            type="text"
            value={passive.unique_name ?? ''}
            placeholder="Optional"
            onChange={(e) =>
              onChange({
                ...passive,
                unique_name: e.target.value === '' ? undefined : e.target.value
              })
            }
          />
        </label>
        <label className="extras-field extras-field-narrow">
          <span className="extras-label">Weapon set</span>
          <select
            value={passive.weapon_set ?? ''}
            onChange={(e) =>
              onChange({
                ...passive,
                weapon_set:
                  e.target.value === '' ? undefined : Number(e.target.value)
              })
            }
          >
            <option value="">—</option>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </label>
      </div>
      <AnnotationRow obj={passive} onChange={(next) => onChange({ ...passive, ...next })} />
    </>
  )
}

function ItemRowEditor({
  item,
  onChange
}: {
  item: BuildItem
  onChange: (next: BuildItem) => void
}) {
  return (
    <>
      <div className="extras-row">
        <label className="extras-field">
          <span className="extras-label">Suggested unique</span>
          <input
            type="text"
            value={item.unique_name ?? ''}
            placeholder="e.g. The Searing Touch"
            onChange={(e) =>
              onChange({
                ...item,
                unique_name: e.target.value === '' ? undefined : e.target.value
              })
            }
          />
        </label>
      </div>
      <AnnotationRow obj={item} onChange={(next) => onChange({ ...item, ...next })} />
    </>
  )
}

function normalizePassive(p: BuildPassive): BuildPassiveObject {
  return typeof p === 'string' ? { id: p } : p
}

function normalizeSkill(s: BuildSkill): BuildSkillObject {
  return typeof s === 'string' ? { id: s } : s
}

function collapseObj(p: BuildPassiveObject): BuildPassive {
  const keys = Object.keys(p) as Array<keyof BuildPassiveObject>
  const hasOnlyId =
    keys.length === 1 ||
    keys.every((k) => k === 'id' || p[k] === undefined)
  return hasOnlyId ? p.id : p
}

function collapseSkill(s: BuildSkillObject): BuildSkill {
  const keys = Object.keys(s) as Array<keyof BuildSkillObject>
  const hasOnlyId =
    keys.length === 1 ||
    keys.every((k) => k === 'id' || s[k] === undefined)
  return hasOnlyId ? s.id : s
}

function pairOrUndef(
  a: number | undefined,
  b: number | undefined
): [number, number] | undefined {
  if (a === undefined && b === undefined) return undefined
  return [a ?? 0, b ?? 100]
}

