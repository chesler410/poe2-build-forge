import type {
  BuildFile,
  BuildPassive,
  BuildPassiveObject,
  BuildSkill,
  BuildSkillObject,
  BuildItem
} from '@poe2-build-forge/core'

export interface EditorLabels {
  /** Map from GGG passive id (e.g. "armour21_") to display name ("Strength"). */
  passiveNameById: Record<string, string>
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
        </label>
        <p className="editor-markup-hint">
          Markup tags can nest, e.g. <code>{'<underline>{<red>{Warning}}'}</code>.
        </p>
      </div>

      {passives.length > 0 && (
        <EntryListEditor
          title={`Passives (${passives.length})`}
          entries={passives}
          renderHeader={(p) => passiveHeader(p, labels)}
          renderRow={(p, onEntryChange) => (
            <AnnotationRow
              obj={normalizePassive(p)}
              onChange={(next) => onEntryChange(collapseObj(next))}
            />
          )}
          onChange={(next) => onChange({ ...build, passives: next })}
        />
      )}

      {skills.length > 0 && (
        <EntryListEditor
          title={`Skill groups (${skills.length})`}
          entries={skills}
          renderHeader={(s) => skillHeader(s)}
          renderRow={(s, onEntryChange) => (
            <SkillRow
              skill={normalizeSkill(s)}
              onChange={(next) => onEntryChange(collapseSkill(next))}
            />
          )}
          onChange={(next) => onChange({ ...build, skills: next })}
        />
      )}

      {items.length > 0 && (
        <EntryListEditor
          title={`Item-slot hints (${items.length})`}
          entries={items}
          renderHeader={(it) => itemHeader(it)}
          renderRow={(it, onEntryChange) => (
            <AnnotationRow
              obj={it}
              onChange={(next) => onEntryChange(next as BuildItem)}
            />
          )}
          onChange={(next) => onChange({ ...build, items: next })}
        />
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

function skillHeader(s: BuildSkill): React.ReactNode {
  const obj = normalizeSkill(s)
  const pretty = formatGemId(obj.id)
  return (
    <div className="entry-header">
      {pretty !== obj.id && <span className="entry-name">{pretty}</span>}
      <code className="entry-id">{obj.id}</code>
    </div>
  )
}

function itemHeader(it: BuildItem): React.ReactNode {
  return (
    <div className="entry-header">
      <span className="entry-name">{it.inventory_id}</span>
      <code className="entry-id">at ({it.slot_x}, {it.slot_y})</code>
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
  onChange: (next: T[]) => void
}

function EntryListEditor<T>({
  title,
  entries,
  renderHeader,
  renderRow,
  onChange
}: EntryListProps<T>) {
  return (
    <details className="editor-section" open={entries.length <= 8}>
      <summary className="editor-section-title">{title}</summary>
      <ul className="entry-list">
        {entries.map((entry, idx) => (
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

