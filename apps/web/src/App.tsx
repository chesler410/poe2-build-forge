import { useState } from 'react'
import {
  decodePobCode,
  parsePobXml,
  mapPobToBuild,
  emitBuildFile,
  type AscendancyLookup,
  type BuildFile,
  type PassiveLookup
} from '@poe2-build-forge/core'
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
  filename: string
  content: string
}

type KnownHost = 'maxroll' | 'poeninja' | 'generic'

type AppError =
  | { kind: 'plain'; message: string }
  | { kind: 'cors-failure'; rawUrl: string }
  | { kind: 'unsupported-url'; attemptedUrl: string; host: KnownHost }

const POBB_URL_RE = /^https?:\/\/(?:www\.)?pobb\.in\/([\w-]+)(?:\/raw)?\/?$/i

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
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [error, setError] = useState<AppError | null>(null)

  function decodeAndShow(code: string, lookups: Lookups) {
    try {
      const xml = decodePobCode(code)
      const pob = parsePobXml(xml)
      const build = mapPobToBuild(pob, lookups)
      const { filename, content } = emitBuildFile(build)
      setResult({ build, filename, content })
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

  function handleDownload() {
    if (!result) return
    const blob = new Blob([result.content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <main>
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
          placeholder="https://pobb.in/90pcuxN4XtJG  —or—  eNrtXVtX4krTvt7vr2B5rdscIXmX..."
          rows={6}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={handleConvert}
          disabled={busy || input.trim().length === 0}
        >
          {busy ? 'Converting…' : 'Convert'}
        </button>
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
        <section className="result">
          <h2>{result.build.name}</h2>
          <dl>
            <dt>Ascendancy</dt>
            <dd>{result.build.ascendancy ?? '—'}</dd>
            <dt>Passives allocated</dt>
            <dd>{result.build.passives?.length ?? 0}</dd>
            <dt>Skill groups</dt>
            <dd>{result.build.skills?.length ?? 0}</dd>
            <dt>Item-slot hints</dt>
            <dd>{result.build.items?.length ?? 0}</dd>
          </dl>
          <button type="button" onClick={handleDownload}>
            Download {result.filename}
          </button>
          <p className="placement-hint">
            Drop the downloaded file into{' '}
            <code>Documents\My Games\Path of Exile 2\BuildPlanner\</code>
            {' '}and select the build in-game.
          </p>
          <details>
            <summary>JSON preview</summary>
            <pre>{result.content}</pre>
          </details>
        </section>
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
