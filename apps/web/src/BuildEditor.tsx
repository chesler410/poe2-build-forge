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
import {
  passivePrefix,
  prefixLabel,
  isAttributeChoiceGroup
} from './passiveGroup'

// Canonical PoE attribute colors. Red = Strength, Blue = Intelligence,
// Green = Dexterity — matches the in-game gem tag conventions.
const ATTRIBUTE_CHOICES: Array<{ full: string; short: string; cls: string }> = [
  { full: 'Strength', short: 'Str', cls: 'chip-str' },
  { full: 'Intelligence', short: 'Int', cls: 'chip-int' },
  { full: 'Dexterity', short: 'Dex', cls: 'chip-dex' }
]

function attributeChoiceNote(full: string): string {
  return `Pick ${full}`
}

export interface EditorLabels {
  /** Map from GGG passive id (e.g. "armour21_") to display name ("Strength"). */
  passiveNameById: Record<string, string>
  /**
   * Map from gem `Metadata/Items/Gems/...` id to authoritative display
   * name extracted from PoB's Gems.lua (e.g. "Sigil of Power" with the
   * correct lowercase "of", which CamelCase splitting can't produce).
   */
  gemNameById: Record<string, string>
  /**
   * GGG ascendancy table — keys are "Mercenary2" / "Ranger1" etc., values
   * are { name, class_number }. Used to format the ascendancy summary
   * line as "Witchhunter (Mercenary)" rather than just "Mercenary2".
   */
  ascendancies: import('@poe2-build-forge/core').AscendancyLookup
}

interface Props {
  build: BuildFile
  onChange: (next: BuildFile) => void
  labels?: EditorLabels
}

type TabKey = 'passives' | 'ascendancy' | 'skills' | 'items'

export function BuildEditor({ build, onChange, labels }: Props) {
  const passives = build.passives ?? []
  const skills = build.skills ?? []
  const items = build.inventory_slots ?? []

  const isAscendancy = (p: BuildPassive) =>
    normalizePassive(p).id.startsWith('Ascendancy')
  const ascendancyIdx: number[] = []
  const regularIdx: number[] = []
  passives.forEach((p, i) => (isAscendancy(p) ? ascendancyIdx : regularIdx).push(i))

  function applyPassiveSubset(originalIndices: number[], nextSubset: BuildPassive[]) {
    const copy = passives.slice()
    originalIndices.forEach((origIdx, k) => {
      copy[origIdx] = nextSubset[k]
    })
    onChange({ ...build, passives: copy })
  }

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    ...(regularIdx.length > 0
      ? [{ key: 'passives' as const, label: 'Passives', count: regularIdx.length }]
      : []),
    ...(ascendancyIdx.length > 0
      ? [{ key: 'ascendancy' as const, label: 'Ascendancy', count: ascendancyIdx.length }]
      : []),
    ...(skills.length > 0
      ? [{ key: 'skills' as const, label: 'Skill groups', count: skills.length }]
      : []),
    ...(items.length > 0
      ? [{ key: 'items' as const, label: 'Item hints', count: items.length }]
      : [])
  ]

  const [activeTab, setActiveTab] = useState<TabKey | null>(null)
  const tab = activeTab && tabs.some((t) => t.key === activeTab) ? activeTab : tabs[0]?.key

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

      {tabs.length > 1 && (
        <div className="editor-tabs" role="tablist" aria-label="Build sections">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`editor-nav-link${tab === key ? ' editor-nav-link-active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              {label} <span className="editor-nav-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel">
        {tab === 'passives' && (
          <PassivesPanel
            passives={passives}
            regularIdx={regularIdx}
            labels={labels}
            onChange={applyPassiveSubset}
          />
        )}

        {tab === 'ascendancy' && (
          <EntryListPanel
            entries={ascendancyIdx.map((i) => passives[i])}
            renderHeader={(p) => passiveHeader(p, labels)}
            renderRow={(p, onEntryChange) => (
              <PassiveRowEditor
                passive={normalizePassive(p)}
                defaultName={labels?.passiveNameById[normalizePassive(p).id]}
                onChange={(next) => onEntryChange(collapseObj(next))}
              />
            )}
            searchableText={(p) => {
              const obj = normalizePassive(p)
              return `${obj.id} ${labels?.passiveNameById[obj.id] ?? ''}`
            }}
            hasNote={(p) => !!normalizePassive(p).additional_text}
            onChange={(next) => applyPassiveSubset(ascendancyIdx, next)}
          />
        )}

        {tab === 'skills' && (
          <EntryListPanel
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
            hasNote={(s) => !!normalizeSkill(s).additional_text}
            onChange={(next) => onChange({ ...build, skills: next })}
          />
        )}

        {tab === 'items' && (
          <EntryListPanel
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
            hasNote={(it) => !!it.additional_text}
            onChange={(next) => onChange({ ...build, inventory_slots: next })}
          />
        )}
      </div>
    </div>
  )
}

function PassivesPanel({
  passives,
  regularIdx,
  labels,
  onChange
}: {
  passives: BuildPassive[]
  regularIdx: number[]
  labels?: EditorLabels
  onChange: (originalIndices: number[], nextSubset: BuildPassive[]) => void
}) {
  // Bucket passives by id-prefix so a 150+ entry list collapses to
  // ~20 type groups instead of one long scroll.
  const groups = new Map<string, number[]>()
  regularIdx.forEach((i) => {
    const prefix = passivePrefix(normalizePassive(passives[i]).id)
    if (!groups.has(prefix)) groups.set(prefix, [])
    groups.get(prefix)!.push(i)
  })
  const sortedPrefixes = [...groups.keys()].sort()

  const [query, setQuery] = useState('')
  const [guide, setGuide] = useState(false)
  const q = query.trim().toLowerCase()
  const matchesQuery = (entry: BuildPassive) => {
    if (!q) return true
    const obj = normalizePassive(entry)
    const name = labels?.passiveNameById[obj.id] ?? ''
    return obj.id.toLowerCase().includes(q) || name.toLowerCase().includes(q)
  }

  // Global leveling order across every type — the order you'd actually
  // allocate these on the passive tree — used for both the search-hidden
  // group fallback and guide mode's step order.
  const globalSorted = [...regularIdx].sort((a, b) => {
    const pa = normalizePassive(passives[a])
    const pb = normalizePassive(passives[b])
    const la = pa.level_interval?.[0] ?? Number.POSITIVE_INFINITY
    const lb = pb.level_interval?.[0] ?? Number.POSITIVE_INFINITY
    if (la !== lb) return la - lb
    return pa.id.localeCompare(pb.id)
  })
  const guideIndices = globalSorted.filter((i) => matchesQuery(passives[i]))

  let visibleGroupCount = 0

  return (
    <div className="editor-section editor-tabpanel-body">
      <div className="editor-toolbar panel-toolbar">
        <input
          type="search"
          className="entry-search panel-toolbar-search"
          value={query}
          placeholder="Filter by name or id…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className={`secondary-button${guide ? ' secondary-button-active' : ''}`}
          onClick={() => setGuide((v) => !v)}
        >
          {guide ? 'Exit guide' : 'Guide me'}
        </button>
      </div>

      {guide ? (
        <FocusStepper
          items={guideIndices.map((i) => passives[i])}
          hasNote={(p) => !!normalizePassive(p).additional_text}
          emptyMessage={
            q ? `No passives match "${query}".` : 'No passives to guide through.'
          }
          renderHeader={(entry) => passiveHeader(entry, labels)}
          renderRow={(entry, onEntryChange) => {
            const isChoice = isAttributeChoiceGroup(
              passivePrefix(normalizePassive(entry).id)
            )
            return (
              <>
                {isChoice && (
                  <AttributeChipRow
                    passive={normalizePassive(entry)}
                    onChange={(next) => onEntryChange(collapseObj(next))}
                  />
                )}
                <PassiveRowEditor
                  passive={normalizePassive(entry)}
                  defaultName={labels?.passiveNameById[normalizePassive(entry).id]}
                  onChange={(next) => onEntryChange(collapseObj(next))}
                />
              </>
            )
          }}
          onChange={(posInList, next) => {
            const origIdx = guideIndices[posInList]
            onChange([origIdx], [next])
          }}
        />
      ) : (
        <div className="passive-groups">
          {sortedPrefixes.map((prefix) => {
            const rawIndices = groups.get(prefix)!
            // Sort by level_interval[0] ascending (allocation order in a
            // leveling guide). Entries without level_interval go last;
            // id alphabetical breaks ties for determinism.
            const sortedIndices = [...rawIndices].sort((a, b) => {
              const pa = normalizePassive(passives[a])
              const pb = normalizePassive(passives[b])
              const la = pa.level_interval?.[0] ?? Number.POSITIVE_INFINITY
              const lb = pb.level_interval?.[0] ?? Number.POSITIVE_INFINITY
              if (la !== lb) return la - lb
              return pa.id.localeCompare(pb.id)
            })
            const entries = sortedIndices.map((i) => passives[i])
            const visibleK = entries
              .map((entry, k) => ({ entry, k }))
              .filter(({ entry }) => matchesQuery(entry))
            if (q !== '' && visibleK.length === 0) return null
            visibleGroupCount += 1
            const isChoice = isAttributeChoiceGroup(prefix)
            return (
              <details
                key={prefix}
                className="editor-subsection"
                open={q !== '' || entries.length <= 3}
              >
                <summary className="editor-subsection-title">
                  {prefixLabel(prefix)} ({q !== '' ? visibleK.length : entries.length})
                </summary>
                <ul className="entry-list">
                  {visibleK.map(({ entry, k }) => (
                    <li key={sortedIndices[k]} className="entry-row">
                      {passiveHeader(entry, labels)}
                      {isChoice && (
                        <AttributeChipRow
                          passive={normalizePassive(entry)}
                          onChange={(next) => {
                            const copy = entries.slice()
                            copy[k] = collapseObj(next)
                            onChange(sortedIndices, copy)
                          }}
                        />
                      )}
                      <PassiveRowEditor
                        passive={normalizePassive(entry)}
                        defaultName={
                          labels?.passiveNameById[normalizePassive(entry).id]
                        }
                        onChange={(next) => {
                          const copy = entries.slice()
                          copy[k] = collapseObj(next)
                          onChange(sortedIndices, copy)
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )
          })}
          {q !== '' && visibleGroupCount === 0 && (
            <p className="entry-no-match">No passives match "{query}".</p>
          )}
        </div>
      )}
    </div>
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
  entries: T[]
  renderHeader: (entry: T) => React.ReactNode
  renderRow: (entry: T, onEntryChange: (next: T) => void) => React.ReactNode
  searchableText?: (entry: T) => string
  hasNote?: (entry: T) => boolean
  onChange: (next: T[]) => void
}

function EntryListPanel<T>({
  entries,
  renderHeader,
  renderRow,
  searchableText,
  hasNote,
  onChange
}: EntryListProps<T>) {
  const [query, setQuery] = useState('')
  const [guide, setGuide] = useState(false)
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
    <div className="editor-section editor-tabpanel-body">
      {(showSearch || hasNote) && (
        <div className="editor-toolbar panel-toolbar">
          {showSearch && (
            <input
              type="search"
              className="entry-search panel-toolbar-search"
              value={query}
              placeholder="Filter by name or id…"
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {hasNote && (
            <button
              type="button"
              className={`secondary-button${guide ? ' secondary-button-active' : ''}`}
              onClick={() => setGuide((v) => !v)}
            >
              {guide ? 'Exit guide' : 'Guide me'}
            </button>
          )}
        </div>
      )}
      {guide && hasNote ? (
        <FocusStepper
          items={visible.map(({ entry }) => entry)}
          hasNote={hasNote}
          emptyMessage={q ? `No entries match "${query}".` : 'Nothing to guide through.'}
          renderHeader={renderHeader}
          renderRow={renderRow}
          onChange={(posInList, next) => {
            const { idx } = visible[posInList]
            const copy = entries.slice()
            copy[idx] = next
            onChange(copy)
          }}
        />
      ) : visible.length === 0 ? (
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
    </div>
  )
}

/**
 * One-at-a-time walkthrough over a flat, already-ordered/filtered list —
 * the "hand-held guide" mode. "Only entries without a note" narrows what
 * Next/Prev will stop on (evaluated at click time, not reactively) so
 * typing in the current entry's note field never yanks focus away as
 * soon as the field stops being empty.
 */
function FocusStepper<T>({
  items,
  hasNote,
  emptyMessage,
  renderHeader,
  renderRow,
  onChange
}: {
  items: T[]
  hasNote: (entry: T) => boolean
  emptyMessage: string
  renderHeader: (entry: T) => React.ReactNode
  renderRow: (entry: T, onEntryChange: (next: T) => void) => React.ReactNode
  onChange: (indexInItems: number, next: T) => void
}) {
  const [onlyUnannotated, setOnlyUnannotated] = useState(false)
  const [pos, setPos] = useState(0)

  if (items.length === 0) {
    return <p className="entry-no-match">{emptyMessage}</p>
  }

  const clamped = Math.min(pos, items.length - 1)
  const current = items[clamped]
  const remaining = items.filter((e) => !hasNote(e)).length

  function step(dir: 1 | -1) {
    let next = clamped + dir
    while (
      next >= 0 &&
      next < items.length &&
      onlyUnannotated &&
      hasNote(items[next])
    ) {
      next += dir
    }
    if (next >= 0 && next < items.length) setPos(next)
  }

  return (
    <div className="focus-stepper">
      <div className="focus-toolbar">
        <label className="focus-only-unannotated">
          <input
            type="checkbox"
            checked={onlyUnannotated}
            onChange={(e) => setOnlyUnannotated(e.target.checked)}
          />
          Only entries without a note
        </label>
        <span className="focus-remaining">{remaining} without a note</span>
      </div>
      <div className="focus-progress">
        {clamped + 1} / {items.length}
      </div>
      <div className="focus-card">
        {renderHeader(current)}
        {renderRow(current, (next) => onChange(clamped, next))}
      </div>
      <div className="focus-nav">
        <button
          type="button"
          className="secondary-button"
          disabled={clamped === 0}
          onClick={() => step(-1)}
        >
          ← Prev
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={clamped === items.length - 1}
          onClick={() => step(1)}
        >
          Next →
        </button>
      </div>
    </div>
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

function AttributeChipRow({
  passive,
  onChange
}: {
  passive: BuildPassiveObject
  onChange: (next: BuildPassiveObject) => void
}) {
  const current = passive.additional_text
  return (
    <div className="attribute-chips">
      <span className="attribute-chips-label">Recommend</span>
      {ATTRIBUTE_CHOICES.map(({ full, short, cls }) => {
        const isActive = current === attributeChoiceNote(full)
        return (
          <button
            key={full}
            type="button"
            className={`chip ${cls}${isActive ? ' chip-active' : ''}`}
            onClick={() =>
              onChange({ ...passive, additional_text: attributeChoiceNote(full) })
            }
            title={`Set note to "${attributeChoiceNote(full)}"`}
          >
            {short}
          </button>
        )
      })}
      <button
        type="button"
        className="chip chip-clear"
        onClick={() => onChange({ ...passive, additional_text: undefined })}
        title="Clear the note"
        disabled={!current}
      >
        ×
      </button>
    </div>
  )
}

function PassiveRowEditor({
  passive,
  defaultName,
  onChange
}: {
  passive: BuildPassiveObject
  /**
   * Node's display name from the bundled lookup ("Strength",
   * "Shock Chance", "Sustainable Practices"). Used as the Display Name
   * input's placeholder so authors see the canonical label and can
   * choose to override it with a build-specific note.
   */
  defaultName?: string
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
            placeholder={defaultName ?? 'Optional'}
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
