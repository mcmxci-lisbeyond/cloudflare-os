import { useEffect, useRef, useState } from 'react'
import type { GatekeeperUiFrame } from '@gadgets/workshop-shared/gatekeeper'
import { useAuthenticatedApi } from './AuthContext'
import SandboxedGatekeeperApp from './SandboxedGatekeeperApp'
import { reportIssue } from './errorReporting'

const MAX_AUTOMATIC_RETRIES = 2

export function isTransientConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /peer closed websocket|websocket.*1006|connection.*closed/i.test(message)
}

// The frame's `ui` is an RPC stub at runtime; dispose it to release the server-side capability.
function disposeFrame(frame: GatekeeperUiFrame | null) {
  (frame?.ui as { [Symbol.dispose]?(): void } | undefined)?.[Symbol.dispose]?.()
}

/**
 * Renders a gatekeeper's full-page management app (a sandboxed SPA the gatekeeper serves).
 * Fetches the app frame (iframe HTML + `ui` capability) from the backend and hosts it.
 */
export default function GatekeeperAppPage({ appId, appRoute = null }: {
  appId: string
  appRoute?: string | null
}) {
  const { authenticatedApi } = useAuthenticatedApi()
  // Wrap the frame in an object: it holds a `ui` RPC stub, and we never want useState's setter to
  // treat a stored value as an updater function.
  const generation = useRef(0)
  const [state, setState] = useState<{ frame: GatekeeperUiFrame; api: typeof authenticatedApi; appId: string; generation: number } | null>(null)
  const [error, setError] = useState<{ detail: string, transient: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [automaticRetries, setAutomaticRetries] = useState(0)

  useEffect(() => {
    let cancelled = false
    let acquired: GatekeeperUiFrame | null = null
    setError(null)
    setState(null)
    authenticatedApi
      .getGatekeeperApp(appId)
      .then((frame) => {
        if (!frame) {
          if (!cancelled) {
            setError({ detail: 'This app is not available on this deployment.', transient: false })
          }
          return
        }
        if (cancelled) {
          disposeFrame(frame)
          return
        }
        acquired = frame
        setAutomaticRetries(0)
        setState({ frame, api: authenticatedApi, appId, generation: ++generation.current })
      })
      .catch((err) => {
        console.error('Failed to load gatekeeper app:', err)
        reportIssue('gatekeeper-app.load', err, {
          gatekeeperVendorId: appId,
        })
        if (!cancelled) {
          setError({ detail: String(err), transient: isTransientConnectionError(err) })
        }
      })
    return () => {
      cancelled = true
      disposeFrame(acquired)
    }
  }, [authenticatedApi, appId, attempt])

  useEffect(() => {
    if (!error?.transient || automaticRetries >= MAX_AUTOMATIC_RETRIES) return
    const timeout = window.setTimeout(() => {
      setAutomaticRetries(value => value + 1)
      setAttempt(value => value + 1)
    }, 1_250 * (automaticRetries + 1))
    return () => window.clearTimeout(timeout)
  }, [automaticRetries, error])

  if (error) {
    return (
      <div className="mx-auto flex min-h-[55vh] max-w-lg items-center px-5 py-16">
        <section className="w-full rounded-2xl bg-kumo-elevated p-6 text-center shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.05)]">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-kumo-inactive">
            {error.transient ? 'Connection interrupted' : 'View unavailable'}
          </p>
          <h1 className="mt-2 text-balance text-[20px] font-semibold tracking-[-0.35px] text-kumo-default">
            {error.transient ? 'Reconnecting Lisbeyond OS' : 'This view could not be opened'}
          </h1>
          <p className="mx-auto mt-2 max-w-[48ch] text-pretty text-[13px] leading-5 text-kumo-subtle">
            {error.transient
              ? 'The secure session closed unexpectedly. Your data was not changed; retry once the connection is stable.'
              : error.detail}
          </p>
          <button
            type="button"
            onClick={() => {
              setAutomaticRetries(0)
              setAttempt(value => value + 1)
            }}
            className="press mt-5 inline-flex min-h-10 items-center justify-center rounded-lg bg-kumo-brand px-4 text-[13px] font-medium text-white transition-[background-color,scale] hover:bg-kumo-brand-hover active:scale-[0.96]"
          >Try again</button>
        </section>
      </div>
    )
  }
  if (!state || state.api !== authenticatedApi || state.appId !== appId) {
    return <div className="px-4 py-16 text-center text-sm text-kumo-subtle">Loading…</div>
  }

  // Fill the shell's available space. Its mobile/announcement header is optional; subtracting a
  // fixed header height here would leave an empty strip below desktop pages.
  return (
    <div className="h-full">
      <SandboxedGatekeeperApp
        key={state.generation}
        frame={state.frame}
        gatekeeperVendorId={appId}
        appRoute={appRoute}
      />
    </div>
  )
}
