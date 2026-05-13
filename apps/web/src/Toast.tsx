import { useEffect } from 'react'

export interface Toast {
  id: number
  message: React.ReactNode
  kind: 'info' | 'success' | 'error'
}

interface Props {
  toasts: Toast[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: Props) {
  return (
    <div className="toast-stack" role="region" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast
  onDismiss: () => void
}) {
  // Auto-dismiss after 4s. Errors get a little longer (6s) so the user
  // has time to read them.
  useEffect(() => {
    const ms = toast.kind === 'error' ? 6000 : 4000
    const handle = window.setTimeout(onDismiss, ms)
    return () => window.clearTimeout(handle)
  }, [onDismiss, toast.kind])

  return (
    <div className={`toast toast-${toast.kind}`}>
      <span className="toast-message">{toast.message}</span>
      <button
        type="button"
        className="toast-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
