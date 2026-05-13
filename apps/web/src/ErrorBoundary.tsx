import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catch render-time exceptions anywhere below this point so a crash
 * doesn't leave the user staring at a blank page. Surfaces the error
 * message, the SHA the bundle was built from, and two recovery
 * buttons:
 *   - Reload: refresh the page (preserves LocalStorage).
 *   - Reset: clear LocalStorage *then* reload. Useful when a corrupt
 *     persisted build is the trigger.
 *
 * React requires class components for error boundaries; there's no
 * hooks-based equivalent yet.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[poe2-build-forge] render crash:', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    try {
      localStorage.removeItem('poe2bf.input')
      localStorage.removeItem('poe2bf.build')
    } catch { /* ignore */ }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="error-boundary">
        <h1>Something broke.</h1>
        <p>
          poe2-build-forge hit an unexpected error. The details below help
          file a useful bug report at{' '}
          <a
            href="https://github.com/chesler410/poe2-build-forge/issues"
            target="_blank"
            rel="noreferrer"
          >
            github.com/chesler410/poe2-build-forge/issues
          </a>
          .
        </p>
        <pre className="error-boundary-detail">
          {this.state.error.message}
          {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
        </pre>
        <p>
          Build <code>{__APP_VERSION__}</code> · <code>{__APP_SHA__}</code> ·{' '}
          {__APP_BUILD_DATE__}
        </p>
        <div className="error-boundary-actions">
          <button type="button" onClick={this.handleReload}>
            Reload
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={this.handleReset}
          >
            Reset saved state + reload
          </button>
        </div>
      </main>
    )
  }
}
