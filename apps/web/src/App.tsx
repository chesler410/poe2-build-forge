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
}

let lookupsCache: Lookups | null = null
let lookupsInFlight: Promise<Lookups> | null = null

async function loadLookups(): Promise<Lookups> {
  if (lookupsCache) return lookupsCache
  if (lookupsInFlight) return lookupsInFlight

  lookupsInFlight = (async () => {
    const [passivesModule, ascendanciesModule] = await Promise.all([
      import('@poe2-build-forge/core/data/passives_default.json'),
      import('@poe2-build-forge/core/data/ascendancies.json')
    ])
    const lookups: Lookups = {
      passives: passivesModule.default as PassiveLookup,
      ascendancies: ascendanciesModule.default as AscendancyLookup
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

interface ConvertResult {
  build: BuildFile
}

type KnownHost = 'maxroll' | 'poeninja' | 'generic'

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
    return 'generic'
  } catch {
    return 'generic'
  }
}

export function App() {
  const [input, setInput] = useState<string>(loadStoredInput)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(() => {
    const stored = loadStoredBuild()
    return stored ? { build: stored } : null
  })
  const [labels, setLabels] = useState<EditorLabels | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragDepthRef = useRef(0)

  useEffect(() => {
    try {
      if (input) localStorage.setItem(STORAGE_INPUT, input)
      else localStorage.removeItem(STORAGE_INPUT)
    } catch { /* quota or denied — ignore */ }
  }, [input])

  useEffect(() => {
    try {
      if (result) localStorage.setItem(STORAGE_BUILD, JSON.stringify(result.build))
      else localStorage.removeItem(STORAGE_BUILD)
    } catch { /* quota or denied — ignore */ }
  }, [result])

  function decodeAndShow(code: string, lookups: Lookups) {
    try {
      const xml = decodePobCode(code)
      const pob = parsePobXml(xml)
      const build = mapPobToBuild(pob, lookups)
      // Validate up front so a broken initial build is surfaced before the
      // editor opens. The editor re-emits on every change with its own
      // graceful handling of mid-edit validation errors.
      emitBuildFile(build)
      setResult({ build })
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
    setResult(null)
    const raw = input.trim()
    if (!raw) return

    setBusy(true)
    try {
      const lookups = await loadLookups()
      if (labels === null) {
        const passiveNameById: Record<string, string> = {}
        for (const v of Object.values(lookups.passives)) {
          passiveNameById[v.id] = v.name
        }
        setLabels({ passiveNameById })
      }
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
    setResult(null)
    setInput(EXAMPLE_BUILD_CODE)
  }

  function handleStartOver() {
    setInput('')
    setResult(null)
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
        setResult({ build: parsed })
        setInput('')
      } catch (err) {
        setError({
          kind: 'plain',
          message: `Couldn't load .build file: ${
            err instanceof Error ? err.message : String(err)
          }`
        })
      }
    } else {
      // Treat as a raw PoB code (.pob, .txt, anything else).
      setInput(text.trim())
      setResult(null)
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

  // Global Ctrl/Cmd+S → download the current build (preventing the browser's
  // "save page" dialog). No-op when there's no result yet.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && result) {
        e.preventDefault()
        try {
          const { filename, content } = emitBuildFile(result.build)
          downloadEdited(filename, content)
        } catch {
          // Validation error; let the user see it in the UI instead of stealing focus.
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result])

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

  const hasState = input.length > 0 || result !== null

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
          Shortcuts: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to convert,{' '}
          <kbd>Ctrl</kbd>+<kbd>S</kbd> to download. You can also drag a{' '}
          <code>.pob</code> or <code>.build</code> file onto the page.
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

      {result && (
        <ResultPanel
          build={result.build}
          labels={labels}
          onBuildChange={(b) => setResult({ build: b })}
          onDownload={downloadEdited}
        />
      )}

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
          {__APP_BUILD_DATE__}
        </span>
      </footer>
    </main>
  )
}

interface ResultPanelProps {
  build: BuildFile
  labels: EditorLabels | null
  onBuildChange: (next: BuildFile) => void
  onDownload: (filename: string, content: string) => void
}

function ResultPanel({
  build,
  labels,
  onBuildChange,
  onDownload
}: ResultPanelProps) {
  const { content, filename, error } = useEmittedContent(build)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. insecure context). Fall back to
      // a hidden textarea + execCommand so older or non-HTTPS deploys
      // still work.
      const ta = document.createElement('textarea')
      ta.value = content
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      } finally {
        document.body.removeChild(ta)
      }
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
