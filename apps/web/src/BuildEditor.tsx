import { useMemo } from 'react'
import { emitBuildFile } from '@poe2-build-forge/core'
import type {
  BuildFile,
  BuildPassive,
  BuildPassiveObject,
  BuildSkill,
  BuildSkillObject,
  BuildItem
} from '@poe2-build-forge/core'

interface Props {
  build: BuildFile
  onChange: (next: BuildFile) => void
}

export function BuildEditor({ build, onChange }: Props) {
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
          renderId={(p) => normalizePassive(p).id}
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
          renderId={(s) => normalizeSkill(s).id}
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
          renderId={(it) => `${it.inventory_id} @ ${it.slot_x},${it.slot_y}`}
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

interface EntryListProps<T> {
  title: string
  entries: T[]
  renderId: (entry: T) => string
  renderRow: (entry: T, onEntryChange: (next: T) => void) => React.ReactNode
  onChange: (next: T[]) => void
}

function EntryListEditor<T>({
  title,
  entries,
  renderId,
  renderRow,
  onChange
}: EntryListProps<T>) {
  return (
    <details className="editor-section" open={entries.length <= 8}>
      <summary className="editor-section-title">{title}</summary>
      <ul className="entry-list">
        {entries.map((entry, idx) => (
          <li key={idx} className="entry-row">
            <code className="entry-id">{renderId(entry)}</code>
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

export function useEmittedContent(build: BuildFile): {
  content: string
  filename: string
  error: string | null
} {
  return useMemo(() => {
    try {
      const { content, filename } = emitBuildFile(build)
      return { content, filename, error: null }
    } catch (err) {
      return {
        content: JSON.stringify(build, null, 2) + '\n',
        filename: build.name ? `${build.name}.build` : 'build.build',
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }, [build])
}
