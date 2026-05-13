import { useEffect, useRef, useState } from 'react'
import {
  decodePobCode,
  parsePobXml,
  mapPobToBuild,
  emitBuildFile,
  type AscendancyLookup,
  type BuildFile,
  type PassiveLookup
} from '@poe2-build-forge/core'
import { BuildEditor, type EditorLabels } from './BuildEditor'
import { useEmittedContent } from './useEmittedContent'
import { buildShareUrl, decodeHashToBuild } from './shareLink'
import { ToastStack, type Toast } from './Toast'
import { EXAMPLE_BUILD_CODE } from './exampleBuild'
import './App.css'

// Lazily-loaded lookup tables. Bundling them statically would push the
// initial JS payload to ~220 KB gzipped (most of it the passive node
// table). Dynamic import splits them into separate chunks that load
// only when the user actually clicks Convert. After the first click
// they're cached in-module for the rest of the session.
interface Lookups {
  passives: PassiveLookup
  ascendancies: AscendancyLookup
  gemLabels: Record<string, string>
}

let lookupsCache: Lookups | null = null
let lookupsInFlight: Promise<Lookups> | null = null

async function loadLookups(): Promise<Lookups> {
  if (lookupsCache) return lookupsCache
  if (lookupsInFlight) return lookupsInFlight

  lookupsInFlight = (async () => {
    const [passivesModule, ascendanciesModule, gemLabelsModule] = await Promise.all([
      import('@poe2-build-forge/core/data/passives_default.json'),
      import('@poe2-build-forge/core/data/ascendancies.json'),
      import('@poe2-build-forge/core/data/gem_labels.json')
    ])
    const lookups: Lookups = {
      passives: passivesModule.default as PassiveLookup,
      ascendancies: ascendanciesModule.default as AscendancyLookup,
      gemLabels: gemLabelsModule.default as Record<string, string>
    }
    lookupsCache = lookups
    return lookups
  })()

  try {
    return await lookupsInFlight
  } finally {
    lookupsInFlight = null
  }
}

type KnownHost = 'maxroll' | 'poeninja' | 'mobalytics' | 'generic'

type AppError =
  | { kind: 'plain'; message: string }
  | { kind: 'cors-failure'; rawUrl: string }
  | { kind: 'unsupported-url'; attemptedUrl: string; host: KnownHost }

const POBB_URL_RE = /^https?:\/\/(?:www\.)?pobb\.in\/([\w-]+)(?:\/raw)?\/?$/i
const STORAGE_INPUT = 'poe2bf.input'
const STORAGE_BUILD = 'poe2bf.build'

function loadStoredInput(): string {
  try {
    return localStorage.getItem(STORAGE_INPUT) ?? ''
  } catch {
    return ''
  }
}

function loadStoredBuild(): BuildFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_BUILD)
    if (!raw) return null
    return JSON.parse(raw) as BuildFile
  } catch {
    return null
  }
}

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

function toPobbRawUrl(input: string): string | null {
  const m = input.match(POBB_URL_RE)
  if (!m) return null
  return `https://pobb.in/${m[1]}/raw`
}

function classifyHost(input: string): KnownHost {
  try {
    const host = new URL(input).host.toLowerCase().replace(/^www\./, '')
    if (host === 'maxroll.gg' || host.endsWith('.maxroll.gg')) return 'maxroll'
    if (host === 'poe.ninja' || host.endsWith('.poe.ninja')) return 'poeninja'
    if (host === 'mobalytics.gg' || host.endsWith('.mobalytics.gg')) return 'mobalytics'
    return 'generic'
  } catch {
    return 'generic'
  }
}

export function App() {
  const [input, setInput] = useState<string>(loadStoredInput)
  const [busy, setBusy] = useState(false)
  // The current build lives at history.stack[history.index]. Treating it as
  // a stack lets us do Ctrl+Z / Ctrl+Y for free; treating it as the source
  // of truth (rather than a separate `result` state) keeps things consistent.
  const [history, setHistory] = useState<{ stack: BuildFile[]; index: number }>(
    () => {
      const stored = loadStoredBuild()
      return stored ? { stack: [stored], index: 0 } : { stack: [], index: -1 }
    }
  )
  const currentBuild: BuildFile | null =
    history.index >= 0 ? history.stack[history.index] : null
  const canUndo = history.index > 0
  const canRedo = history.index < history.stack.length - 1

  function resetHistory(build: BuildFile) {
    setHistory({ stack: [build], index: 0 })
  }
  function pushEdit(build: BuildFile) {
    setHistory((h) => {
      const truncated = h.stack.slice(0, h.index + 1)
      const last = truncated[truncated.length - 1]
      if (last && JSON.stringify(last) === JSON.stringify(build)) return h
      return { stack: [...truncated, build], index: h.index + 1 }
    })
  }
  function clearHistory() {
    setHistory({ stack: [], index: -1 })
  }
  function undo() {
    setHistory((h) => (h.index > 0 ? { ...h, index: h.index - 1 } : h))
  }
  function redo() {
    setHistory((h) =>
      h.index < h.stack.length - 1 ? { ...h, index: h.index + 1 } : h
    )
  }

  const [labels, setLabels] = useState<EditorLabels | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextToastIdRef = useRef(0)

  function pushToast(message: React.ReactNode, kind: Toast['kind'] = 'info') {
    const id = ++nextToastIdRef.current
    setToasts((current) => [...current, { id, message, kind }])
  }

  function dismissToast(id: number) {
    setToasts((current) => current.filter((t) => t.id !== id))
  }

  useEffect(() => {
    try {
      if (input) localStorage.setItem(STORAGE_INPUT, input)
      else localStorage.removeItem(STORAGE_INPUT)
    } catch { /* quota or denied — ignore */ }
  }, [input])

  useEffect(() => {
    try {
      if (currentBuild) localStorage.setItem(STORAGE_BUILD, JSON.stringify(currentBuild))
      else localStorage.removeItem(STORAGE_BUILD)
    } catch { /* quota or denied — ignore */ }
  }, [currentBuild])

  // On first mount, if the URL has a #b=... hash, decode it into the
  // result and consume the hash so subsequent reloads use LocalStorage
  // rather than this snapshot. Hash takes precedence over LocalStorage
  // because following a shared link is a deliberate signal.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!hash || hash === '#') return
    const fromHash = decodeHashToBuild(hash)
    if (fromHash) {
      try {
        emitBuildFile(fromHash)
        resetHistory(fromHash)
        setInput('')
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        )
        pushToast('Loaded shared build from URL.', 'success')
      } catch (err) {
        pushToast(
          `Shared link decoded but failed validation: ${
            err instanceof Error ? err.message : String(err)
          }`,
          'error'
        )
      }
    } else {
      pushToast(
        'Shared link is malformed; nothing to load from the URL.',
        'error'
      )
    }
    // Intentionally empty deps — runs once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Whenever a build exists but labels haven't been built yet — common
  // when the build was restored from LocalStorage or a shared link
  // without going through Convert — fetch the lookup tables and derive
  // labels so the editor can render readable names.
  useEffect(() => {
    if (!currentBuild || labels) return
    let cancelled = false
    void (async () => {
      const lookups = await loadLookups()
      if (cancelled) return
      const passiveNameById: Record<string, string> = {}
      for (const v of Object.values(lookups.passives)) {
        passiveNameById[v.id] = v.name
      }
      setLabels({ passiveNameById, gemNameById: lookups.gemLabels })
    })()
    return () => {
      cancelled = true
    }
  }, [currentBuild, labels])

  function decodeAndShow(code: string, lookups: Lookups) {
    try {
      const xml = decodePobCode(code)
      const pob = parsePobXml(xml)
      const build = mapPobToBuild(pob, lookups)
      // Validate up front so a broken initial build is surfaced before the
      // editor opens. The editor re-emits on every change with its own
      // graceful handling of mid-edit validation errors.
      emitBuildFile(build)
      resetHistory(build)
    } catch (err) {
      setError({
        kind: 'plain',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async function fetchAndDecode(rawUrl: string, lookups: Lookups) {
    try {
      const res = await fetch(rawUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const code = (await res.text()).trim()
      decodeAndShow(code, lookups)
    } catch {
      setError({ kind: 'cors-failure', rawUrl })
    }
  }

  async function handleConvert() {
    setError(null)
    clearHistory()
    const raw = input.trim()
    if (!raw) return

    setBusy(true)
    try {
      const lookups = await loadLookups()
      // Labels are derived by the [currentBuild, labels] effect — single
      // source of truth keeps the gemNameById/passiveNameById build path
      // from drifting across two locations.
      if (looksLikeUrl(raw)) {
        const rawUrl = toPobbRawUrl(raw)
        if (rawUrl === null) {
          // We only know how to extract a raw PoB code from pobb.in
          // URLs. For other hosts (poe.ninja, maxroll.gg, etc.) the
          // raw code isn't exposed in a predictable way, so guide the
          // user toward pasting the code directly. Host-specific
          // messages tell them exactly where to find the code on
          // popular sites.
          setError({
            kind: 'unsupported-url',
            attemptedUrl: raw,
            host: classifyHost(raw)
          })
        } else {
          await fetchAndDecode(rawUrl, lookups)
        }
      } else {
        decodeAndShow(raw, lookups)
      }
    } catch (err) {
      setError({
        kind: 'plain',
        message: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setBusy(false)
    }
  }

  function handleLoadExample() {
    setError(null)
    clearHistory()
    setInput(EXAMPLE_BUILD_CODE)
  }

  function handleStartOver() {
    setInput('')
    clearHistory()
    setError(null)
  }

  async function loadDroppedFile(file: File) {
    setError(null)
    const name = file.name.toLowerCase()
    const text = await file.text()
    if (name.endsWith('.build')) {
      // Skip PoB conversion entirely; treat as an existing build to edit.
      try {
        const parsed = JSON.parse(text) as BuildFile
        emitBuildFile(parsed)
        resetHistory(parsed)
        setInput('')
        pushToast(`Loaded ${file.name} into the editor.`, 'success')
      } catch (err) {
        pushToast(
          `Couldn't load ${file.name}: ${
            err instanceof Error ? err.message : String(err)
          }`,
          'error'
        )
      }
    } else {
      // Treat as a raw PoB code (.pob, .txt, anything else).
      setInput(text.trim())
      clearHistory()
      pushToast(
        `Loaded ${file.name} into the input — click Convert.`,
        'info'
      )
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    if (dragDepthRef.current === 1) setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragging(false)
  }

  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void loadDroppedFile(file)
  }

  // Global keyboard shortcuts:
  //   Ctrl/Cmd+S        → download (anywhere, including form fields)
  //   Ctrl/Cmd+Z        → undo (only outside editable elements so the
  //                       browser's native textarea undo still works
  //                       while you're typing)
  //   Ctrl/Cmd+Y or
  //   Ctrl/Cmd+Shift+Z  → redo (same focus rule)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 's' && currentBuild) {
        e.preventDefault()
        try {
          const { filename, content } = emitBuildFile(currentBuild)
          downloadEdited(filename, content)
        } catch { /* validation error surfaces in the UI */ }
        return
      }
      const target = e.target as HTMLElement | null
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (inEditable) return
      if (key === 'z' && !e.shiftKey && canUndo) {
        e.preventDefault()
        undo()
      } else if ((key === 'y' || (key === 'z' && e.shiftKey)) && canRedo) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentBuild, canUndo, canRedo])

  function downloadEdited(filename: string, content: string) {
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const hasState = input.length > 0 || currentBuild !== null

  return (
    <main
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-message">
            Drop a <code>.pob</code> or <code>.build</code> file
          </div>
        </div>
      )}

      <header>
        <h1>poe2-build-forge</h1>
        <p className="tagline">
          Convert a Path of Building 2 export into a <code>.build</code> file
          the in-game Build Planner can load.
        </p>
      </header>

      <section className="quick-start">
        <h2>How to use</h2>
        <ol>
          <li>
            Copy a PoB code from your build of choice — from{' '}
            <a href="https://pobb.in" target="_blank" rel="noreferrer">
              pobb.in
            </a>
            , a maxroll.gg guide, your own Path of Building app, etc.
          </li>
          <li>Paste it in the box below.</li>
          <li>Click <strong>Convert</strong>.</li>
          <li>Click <strong>Download</strong> to save the <code>.build</code> file.</li>
          <li>
            Drop the file into{' '}
            <code>Documents\My Games\Path of Exile 2\BuildPlanner\</code> and
            pick it from the in-game Build Planner.
          </li>
        </ol>
        <p className="example-prompt">
          First time here?{' '}
          <button
            type="button"
            className="link-button"
            onClick={handleLoadExample}
          >
            Load an example build
          </button>{' '}
          to see what the result looks like.
        </p>
        <p className="example-prompt">
          Don't have a build yet? Try{' '}
          <a href="https://pobb.in" target="_blank" rel="noreferrer">
            pobb.in
          </a>
          ,{' '}
          <a
            href="https://maxroll.gg/poe2/build-guides"
            target="_blank"
            rel="noreferrer"
          >
            maxroll.gg/poe2
          </a>
          ,{' '}
          <a
            href="https://poe.ninja/poe2/builds"
            target="_blank"
            rel="noreferrer"
          >
            poe.ninja/poe2
          </a>
          , or{' '}
          <a
            href="https://mobalytics.gg/poe-2/builds"
            target="_blank"
            rel="noreferrer"
          >
            mobalytics.gg/poe-2
          </a>
          .
        </p>
      </section>

      <section className="input-section">
        <label htmlFor="pob-code">PoB code or pobb.in URL</label>
        <p className="hint">
          Paste a raw PoB export (long URL-safe base64 string) or a{' '}
          <code>pobb.in/&lt;id&gt;</code> URL. Conversion runs in your
          browser; nothing is sent to a server.
        </p>
        <textarea
          id="pob-code"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy) {
              e.preventDefault()
              handleConvert()
            }
          }}
          placeholder="https://pobb.in/90pcuxN4XtJG  —or—  eNrtXVtX4krTvt7vr2B5rdscIXmX..."
          rows={6}
          spellCheck={false}
        />
        <div className="input-actions">
          <button
            type="button"
            onClick={handleConvert}
            disabled={busy || input.trim().length === 0}
          >
            {busy ? 'Converting…' : 'Convert'}
          </button>
          {hasState && (
            <button
              type="button"
              className="secondary-button"
              onClick={handleStartOver}
              title="Clear the input and any in-progress edits."
            >
              Start over
            </button>
          )}
        </div>
        <p className="hint shortcuts-hint">
          Shortcuts: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> convert,{' '}
          <kbd>Ctrl</kbd>+<kbd>S</kbd> download,{' '}
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo / redo
          (outside text fields). Drag a <code>.pob</code> or{' '}
          <code>.build</code> file onto the page to load it.
        </p>
      </section>

      {error?.kind === 'plain' && (
        <section className="error" role="alert">
          <strong>Conversion failed:</strong>
          <pre>{error.message}</pre>
        </section>
      )}

      {error?.kind === 'cors-failure' && (
        <section className="error" role="alert">
          <strong>One extra step:</strong>
          <p>
            pobb.in's server doesn't allow cross-origin browser fetches, so
            we can't grab the code directly. Open{' '}
            <a href={error.rawUrl} target="_blank" rel="noreferrer">
              {error.rawUrl}
            </a>{' '}
            in a new tab, select all the text, copy, and paste it back
            here. Then click Convert again.
          </p>
        </section>
      )}

      {error?.kind === 'unsupported-url' && (
        <section className="error" role="alert">
          <strong>That URL needs a manual step:</strong>
          {error.host === 'maxroll' && (
            <p>
              <a
                href={error.attemptedUrl}
                target="_blank"
                rel="noreferrer"
              >
                maxroll.gg
              </a>{' '}
              build guides include a <strong>Path of Building</strong>{' '}
              section. Open the page, scroll to that section, copy the
              export code from it, and paste it into the textarea above.
            </p>
          )}
          {error.host === 'poeninja' && (
            <p>
              <a
                href={error.attemptedUrl}
                target="_blank"
                rel="noreferrer"
              >
                poe.ninja
              </a>{' '}
              build pages have a copy-code button near the build view.
              Open the page, copy the PoB export, and paste it into the
              textarea above.
            </p>
          )}
          {error.host === 'mobalytics' && (
            <p>
              <a
                href={error.attemptedUrl}
                target="_blank"
                rel="noreferrer"
              >
                mobalytics.gg
              </a>{' '}
              build pages have a <strong>Path of Building Code</strong>{' '}
              section with a <strong>Copy Code</strong> button. Open the
              page, click Copy Code, and paste the result into the textarea
              above.
            </p>
          )}
          {error.host === 'generic' && (
            <p>
              URL fetching only works for <code>pobb.in</code> right
              now. For other sources (
              <a href={error.attemptedUrl} target="_blank" rel="noreferrer">
                {error.attemptedUrl}
              </a>
              ), copy the raw PoB code from the site's share/export UI
              and paste it into the textarea above.
            </p>
          )}
        </section>
      )}

      {currentBuild && (
        <ResultPanel
          build={currentBuild}
          labels={labels}
          canUndo={canUndo}
          canRedo={canRedo}
          onBuildChange={pushEdit}
          onUndo={undo}
          onRedo={redo}
          onDownload={downloadEdited}
          onToast={pushToast}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <footer>
        <a href="https://github.com/chesler410/poe2-build-forge">GitHub</a>
        {' · '}
        <a href="https://ko-fi.com/chesler410">Tip jar</a>
        {' · '}
        <span className="version">
          v{__APP_VERSION__}
          {' · '}
          <a
            href={`https://github.com/chesler410/poe2-build-forge/commit/${__APP_SHA__}`}
          >
            {__APP_SHA__}
          </a>
          {' · '}
          built {__APP_BUILD_DATE__}
          {' · '}
          data {__APP_DATA_DATE__}
        </span>
      </footer>
    </main>
  )
}

interface ResultPanelProps {
  build: BuildFile
  labels: EditorLabels | null
  canUndo: boolean
  canRedo: boolean
  onBuildChange: (next: BuildFile) => void
  onUndo: () => void
  onRedo: () => void
  onDownload: (filename: string, content: string) => void
  onToast: (message: React.ReactNode, kind?: Toast['kind']) => void
}

function ResultPanel({
  build,
  labels,
  canUndo,
  canRedo,
  onBuildChange,
  onUndo,
  onRedo,
  onDownload,
  onToast
}: ResultPanelProps) {
  const { content, filename, error } = useEmittedContent(build)
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)

  async function writeToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        return document.execCommand('copy')
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  async function handleShareLink() {
    const url = buildShareUrl(build)
    window.history.replaceState(null, '', url)
    if (await writeToClipboard(url)) {
      setShared(true)
      window.setTimeout(() => setShared(false), 1500)
    } else {
      onToast('Could not copy to clipboard. The URL is in your address bar.', 'info')
    }
  }

  async function handleCopy() {
    if (await writeToClipboard(content)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <section className="result">
      <div className="result-summary">
        <h2>{build.name || '(unnamed build)'}</h2>
        <dl>
          <dt>Ascendancy</dt>
          <dd>{build.ascendancy ?? '—'}</dd>
          <dt>Passives allocated</dt>
          <dd>{build.passives?.length ?? 0}</dd>
          <dt>Skill groups</dt>
          <dd>{build.skills?.length ?? 0}</dd>
          <dt>Item-slot hints</dt>
          <dd>{build.items?.length ?? 0}</dd>
        </dl>
        <div className="result-actions">
          <button
            type="button"
            onClick={() => onDownload(filename, content)}
            disabled={error !== null}
            title={error ?? undefined}
          >
            Download {filename}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleCopy}
            disabled={error !== null}
            title={error ?? 'Copy the .build JSON to the clipboard'}
          >
            {copied ? 'Copied ✓' : 'Copy JSON'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={handleShareLink}
            disabled={error !== null}
            title={
              error ??
              'Copy a shareable URL with the build encoded in the page hash'
            }
          >
            {shared ? 'Link copied ✓' : 'Share link'}
          </button>
        </div>
        {error && (
          <p className="validation-error" role="alert">
            <strong>Validation:</strong> {error}
          </p>
        )}
        <p className="placement-hint">
          Drop the downloaded file into{' '}
          <code>Documents\My Games\Path of Exile 2\BuildPlanner\</code>
          {' '}and select the build in-game.
        </p>
      </div>

      <div className="editor-toolbar">
        <button
          type="button"
          className="secondary-button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo last edit (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>
      </div>

      <BuildEditor
        build={build}
        labels={labels ?? undefined}
        onChange={onBuildChange}
      />

      <details>
        <summary>JSON preview</summary>
        <pre>{content}</pre>
      </details>
    </section>
  )
}
