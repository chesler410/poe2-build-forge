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

export function App() {
  const [input, setInput] = useState('')
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleConvert() {
    setError(null)
    setResult(null)
    try {
      const xml = decodePobCode(input.trim())
      const pob = parsePobXml(xml)
      const build = mapPobToBuild(pob, { passives, ascendancies })
      const { filename, content } = emitBuildFile(build)
      setResult({ build, filename, content })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
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
        <label htmlFor="pob-code">PoB code</label>
        <p className="hint">
          Paste the raw export string from <a href="https://pobb.in">pobb.in</a>{' '}
          (open a build, click the share/copy button) or any PoB-format
          export. URL-based fetching directly from pobb.in is blocked by
          browser CORS, so manual copy is the path for now.
        </p>
        <textarea
          id="pob-code"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="eNrtXVtX4krTvt7vr2B5rdscIXmX834LUEYcTgL..."
          rows={6}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={handleConvert}
          disabled={input.trim().length === 0}
        >
          Convert
        </button>
      </section>

      {error && (
        <section className="error" role="alert">
          <strong>Conversion failed:</strong>
          <pre>{error}</pre>
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
