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
import passivesJson from '@poe2-build-forge/core/data/passives_default.json'
import ascendanciesJson from '@poe2-build-forge/core/data/ascendancies.json'
import './App.css'

// Cast the imported JSON once. Avoids TS trying to infer types from
// the multi-thousand-key data objects on every render.
const passives = passivesJson as PassiveLookup
const ascendancies = ascendanciesJson as AscendancyLookup

interface ConvertResult {
  build: BuildFile
  filename: string
  content: string
}

type AppError =
  | { kind: 'plain'; message: string }
  | { kind: 'cors-failure'; rawUrl: string }

const POBB_URL_RE = /^https?:\/\/(?:www\.)?pobb\.in\/([\w-]+)(?:\/raw)?\/?$/i

function looksLikeUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

function toPobbRawUrl(input: string): string | null {
  const m = input.match(POBB_URL_RE)
  if (!m) return null
  return `https://pobb.in/${m[1]}/raw`
}

export function App() {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [error, setError] = useState<AppError | null>(null)

  function decodeAndShow(code: string) {
    try {
      const xml = decodePobCode(code)
      const pob = parsePobXml(xml)
      const build = mapPobToBuild(pob, { passives, ascendancies })
      const { filename, content } = emitBuildFile(build)
      setResult({ build, filename, content })
    } catch (err) {
      setError({
        kind: 'plain',
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async function fetchAndDecode(rawUrl: string) {
    try {
      const res = await fetch(rawUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      const code = (await res.text()).trim()
      decodeAndShow(code)
    } catch {
      // CORS / network error. Show a recoverable instruction.
      setError({ kind: 'cors-failure', rawUrl })
    }
  }

  async function handleConvert() {
    setError(null)
    setResult(null)
    const raw = input.trim()
    if (!raw) return

    if (looksLikeUrl(raw)) {
      const rawUrl = toPobbRawUrl(raw) ?? raw
      setBusy(true)
      try {
        await fetchAndDecode(rawUrl)
      } finally {
        setBusy(false)
      }
    } else {
      decodeAndShow(raw)
    }
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
          {busy ? 'Fetching…' : 'Convert'}
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
            in a new tab, select all the text, copy it, and paste it back
            here. Then click Convert again.
          </p>
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
      </footer>
    </main>
  )
}
