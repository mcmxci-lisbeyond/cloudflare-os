import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { RpcStub, RpcTarget, newMessagePortRpcSession } from 'capnweb'
import { useLocation, useNavigate } from '@tanstack/react-router'
import type { GatekeeperUiFrame } from '@gadgets/workshop-shared/gatekeeper'
import type {
  GatekeeperAppNavigation,
  GatekeeperAppNavigationReceiver,
  GatekeeperAppPropertyNavigationMode,
  GatekeeperAppPropertyRouteState,
  GatekeeperAppTheme,
  GatekeeperAppThemeReceiver,
  GatekeeperChatModelState,
} from '@gadgets/workshop-shared/theme'
import { isHexColor } from '@gadgets/workshop-shared/api'
import { createRateLimitedCapability } from './rateLimitedCapability'
import { useTheme } from './ThemeContext'
import { useServerConfig } from './ServerConfigContext'
import { forwardTrustedFrameError } from './errorReporting'
import { useAuthenticatedApi } from './AuthContext'
import {
  GATEKEEPER_APP_ROUTES,
  gatekeeperAppCanReportConnections,
  normalizeGatekeeperAppPrompt,
  parseGatekeeperAppConnections,
  parseGatekeeperAppRoute,
  parsePropertyRouteState,
  parsePropertyGuideTarget,
  parseGuideSourceUrl,
  parseWorkflowRouteState,
  type WorkflowRouteState,
  parseGatekeeperAppWorkspaceTarget,
  type GatekeeperAppConnection,
  type GatekeeperAppRoute,
  type GatekeeperAppWorkspaceTarget,
} from './gatekeeperAppNavigation'
import { useRailConnections } from './components/AppShell/railConnectionsContext'
import { getStoredSelectedModel, persistSelectedModel } from './modelSelection'

// The content-pane rect, in viewport coordinates, that the app pins its page to while the iframe
// is full-viewport.
type OverlayRect = { left: number; top: number; width: number; height: number }

// The host's reply to a present/dismiss. On open, `rect` is where the app holds its page fixed while
// the iframe expands to full-viewport (null on restore); `willResize` is whether switching the iframe
// to/from full-viewport actually changes its pixel size (it won't if the pane already fills the window).
type PresentAck = { rect: OverlayRect | null; willResize: boolean }

// Grows the app's iframe to a full-viewport overlay for app-level modals (true) or restores it (false).
type PresentController = (active: boolean) => PresentAck
type OpenTarget = (target: GatekeeperAppWorkspaceTarget) => void
// Resolves workspace IDs the app already holds to their live titles; null for a workspace the user
// can no longer see. Deliberately a lookup, not an enumeration: the app learns nothing new.
type ResolveWorkspaceTitles = (ids: string[]) => Promise<(string | null)[]>
type OpenPrompt = (prompt: string) => void
type OpenAppRoute = (route: GatekeeperAppRoute) => void
type ReportConnections = (rows: GatekeeperAppConnection[]) => void
type GetChatModelState = () => Promise<GatekeeperChatModelState>
type SetChatModel = (modelId: string | null) => Promise<GatekeeperChatModelState>
type SetPropertyRouteState = (
  state: GatekeeperAppPropertyRouteState,
  mode: GatekeeperAppPropertyNavigationMode,
) => void

type OverlayState = 'full' | null
const CONNECTIONS_FEATURE = { connections: true } as const
const HOME_FEATURES = { connections: true, chatModels: true } as const

// Upper bound on one workspace-title lookup, matching the app's page size.
const MAX_RESOLVED_WORKSPACES = 100

// How long one gadget listing is reused across title lookups. The untrusted frame calls this once
// per page of rows (and could call it in a loop), so the listing is shared rather than repeated.
const WORKSPACE_TITLES_TTL_MS = 10_000

// Near the max int, so the full-viewport iframe sits above all Workshop chrome.
const overlayZIndex = 2147483000

const baseIframeStyle: CSSProperties = {
  border: 0,
  background: 'transparent',
}

function iframeStyleForOverlay(overlay: OverlayState): CSSProperties {
  if (overlay === 'full') {
    return {
      ...baseIframeStyle,
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      zIndex: overlayZIndex,
    }
  }
  return {
    ...baseIframeStyle,
    display: 'block',
    width: '100%',
    height: '100%',
  }
}

// The host capability exposed to the sandboxed app (the gatekeeper's iframe UI) over the MessagePort
// RPC session. The app uses `ui` to reach the gatekeeper's own capability, which Workshop relays and
// rate-limits. `setPresenting` stays in Workshop and only grows/restores the iframe's layout.
const UPDATE_NAVIGATION = Symbol("updateNavigation")

class GatekeeperAppHostImpl extends RpcTarget {
  readonly #ui: RpcStub<RpcTarget>
  readonly #disposeRateLimiter: () => void
  readonly #present: PresentController
  readonly #openTarget: OpenTarget
  readonly #openPrompt: OpenPrompt
  readonly #appRoute: () => string | null
  #navigationRevision = 0
  #navigationReceiver: RpcStub<GatekeeperAppNavigationReceiver> | null = null
  readonly #openAppRoute: OpenAppRoute
  readonly #openPropertyGuide: (pNumber: string) => void
  readonly #guideNavigationEnabled: boolean
  readonly #resolveWorkspaceTitles: ResolveWorkspaceTitles
  readonly #reportConnections: ReportConnections
  readonly #chatModelsEnabled: boolean
  readonly #getChatModelState: GetChatModelState
  readonly #setChatModel: SetChatModel
  #getWorkflowRouteState: () => WorkflowRouteState
  #setWorkflowRouteState: (state: WorkflowRouteState) => void
  #getPropertyRouteState: () => GatekeeperAppPropertyRouteState
  #setPropertyRouteState: SetPropertyRouteState
  #presenting = false
  #theme: GatekeeperAppTheme
  #themeReceiver: RpcStub<GatekeeperAppThemeReceiver> | null = null
  // Presentation changes are coalesced to a single apply per animation frame (see #applyPending).
  #pendingActive: boolean | null = null
  #pendingResolvers: ((ack: PresentAck) => void)[] = []
  #frameId: number | null = null
  #promptNavigationTimer: ReturnType<typeof setTimeout> | null = null
  #propertyNavigationTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    capability: any,
    present: PresentController,
    theme: GatekeeperAppTheme,
    openTarget: OpenTarget,
    openPrompt: OpenPrompt,
    appRoute: () => string | null,
    openAppRoute: OpenAppRoute,
    resolveWorkspaceTitles: ResolveWorkspaceTitles,
    reportConnections: ReportConnections,
    chatModelsEnabled: boolean,
    getChatModelState: GetChatModelState,
    setChatModel: SetChatModel,
    getWorkflowRouteState: () => WorkflowRouteState,
    setWorkflowRouteState: (state: WorkflowRouteState) => void,
    getPropertyRouteState: () => GatekeeperAppPropertyRouteState,
    setPropertyRouteState: SetPropertyRouteState,
    openPropertyGuide: (pNumber: string) => void,
    guideNavigationEnabled: boolean,
  ) {
    super()
    this.#theme = theme
    const { capability: ui, dispose } = createRateLimitedCapability(capability, {
      maxConcurrency: 8,
      maxCallsPerMinute: 600,
      maxPendingCalls: 128,
      onRateLimit: 'throttle',
      label: 'Gatekeeper app',
    })
    this.#ui = ui
    this.#disposeRateLimiter = dispose
    this.#present = present
    this.#openTarget = openTarget
    this.#openPrompt = openPrompt
    this.#appRoute = appRoute
    this.#openAppRoute = openAppRoute
    this.#resolveWorkspaceTitles = resolveWorkspaceTitles
    this.#reportConnections = reportConnections
    this.#chatModelsEnabled = chatModelsEnabled
    this.#getChatModelState = getChatModelState
    this.#setChatModel = setChatModel
    this.#getWorkflowRouteState = getWorkflowRouteState
    this.#setWorkflowRouteState = setWorkflowRouteState
    this.#getPropertyRouteState = getPropertyRouteState
    this.#setPropertyRouteState = setPropertyRouteState
    this.#openPropertyGuide = openPropertyGuide
    this.#guideNavigationEnabled = guideNavigationEnabled
  }

  get ui(): RpcStub<RpcTarget> {
    return this.#ui
  }

  // Navigate to a workspace the app knows about. The IDs are validated here because the app is
  // untrusted; navigation stays in-app rather than handing the frame a URL to follow.
  openWorkspace(workspaceId: string, gadgetId?: number): void {
    this.#openTarget(parseGatekeeperAppWorkspaceTarget(workspaceId, gadgetId))
  }

  // Resolve live titles for workspaces the app already references, so it never renders a stale
  // snapshot. Bounded per call; unknown or no-longer-visible workspaces come back as null.
  resolveWorkspaceTitles(ids: string[]): Promise<(string | null)[]> {
    if (!Array.isArray(ids) || ids.length > MAX_RESOLVED_WORKSPACES) {
      throw new TypeError('Invalid workspace title lookup.')
    }
    return this.#resolveWorkspaceTitles(ids)
  }

  openPrompt(prompt: string): void {
    const normalizedPrompt = normalizeGatekeeperAppPrompt(prompt)
    // Cap'n Web posts the invocation and the awaiting caller's result pull as ordered MessagePort
    // messages. The pull is already queued when this invocation reaches the host. Navigating here
    // synchronously unmounts the route-owned iframe before that pull is handled, so the caller sees
    // a closed peer instead of an acknowledgement. Move only navigation to the next browser task.
    if (this.#promptNavigationTimer !== null) clearTimeout(this.#promptNavigationTimer)
    this.#promptNavigationTimer = setTimeout(() => {
      this.#promptNavigationTimer = null
      this.#openPrompt(normalizedPrompt)
    }, 0)
  }

  getAppRoute(): string | null {
    return this.#appRoute()
  }

  #navigation(): GatekeeperAppNavigation {
    return { revision: this.#navigationRevision, route: this.getAppRoute(),
      property: this.getPropertyRouteState(), workflow: this.getWorkflowRouteState() }
  }

  subscribeNavigation(receiver: RpcStub<GatekeeperAppNavigationReceiver>): GatekeeperAppNavigation {
    this.#navigationReceiver?.[Symbol.dispose]?.()
    this.#navigationReceiver = receiver.dup()
    return this.#navigation()
  }

  // Symbol methods are host-local and cannot be invoked by the untrusted iframe over RPC.
  [UPDATE_NAVIGATION]() {
    ++this.#navigationRevision
    const receiver = this.#navigationReceiver
    if (!receiver) return
    const drop = () => {
      if (this.#navigationReceiver === receiver) {
        receiver[Symbol.dispose]?.()
        this.#navigationReceiver = null
      }
    }
    try {
      Promise.resolve(receiver.setNavigation(this.#navigation())).catch(drop)
    } catch { drop() }
  }

  openAppRoute(route: unknown): void {
    this.#openAppRoute(parseGatekeeperAppRoute(route))
  }

  // Keep the frame opaque: the host owns these bounded, user-facing destinations.
  openPropertyGuide(value: unknown): void {
    if (!this.#guideNavigationEnabled) throw new TypeError("Guide navigation is unavailable here.")
    const pNumber = parsePropertyGuideTarget(value)
    // Acknowledge before navigation; legacy hosts may still replace the calling frame.
    if (this.#propertyNavigationTimer !== null) clearTimeout(this.#propertyNavigationTimer)
    this.#propertyNavigationTimer = setTimeout(() => {
      this.#propertyNavigationTimer = null
      this.#openPropertyGuide(pNumber)
    }, 0)
  }

  openGuideSource(value: unknown): void {
    if (!this.#guideNavigationEnabled) throw new TypeError("Guide navigation is unavailable here.")
    window.open(parseGuideSourceUrl(value), "_blank", "noopener,noreferrer")
  }

  getWorkflowRouteState(): WorkflowRouteState {
    return this.getAppRoute() === "workflows" ? this.#getWorkflowRouteState() : {}
  }

  setWorkflowRouteState(value: unknown): void {
    if (this.getAppRoute() !== "workflows") throw new TypeError("Workflow navigation is unavailable here.")
    this.#setWorkflowRouteState(parseWorkflowRouteState(value))
  }

  getPropertyRouteState(): GatekeeperAppPropertyRouteState {
    return this.getAppRoute() === "properties" ? this.#getPropertyRouteState() : {}
  }

  setPropertyRouteState(value: unknown, mode: unknown): void {
    if (this.getAppRoute() !== "properties") throw new TypeError("Property navigation is unavailable here.")
    if (mode !== "push" && mode !== "replace") throw new TypeError("Invalid property navigation mode.")
    const state = parsePropertyRouteState(value)
    if (this.#propertyNavigationTimer !== null) clearTimeout(this.#propertyNavigationTimer)
    this.#propertyNavigationTimer = setTimeout(() => {
      this.#propertyNavigationTimer = null
      this.#setPropertyRouteState(state, mode as GatekeeperAppPropertyNavigationMode)
    }, 0)
  }

  reportConnections(rows: unknown): void {
    this.#reportConnections(parseGatekeeperAppConnections(rows))
  }

  getChatModelState(): Promise<GatekeeperChatModelState> {
    if (!this.#chatModelsEnabled || this.getAppRoute() !== 'home') {
      throw new TypeError('Chat model selection is unavailable for this app.')
    }
    return this.#getChatModelState()
  }

  setChatModel(modelId: string | null): Promise<GatekeeperChatModelState> {
    if (!this.#chatModelsEnabled || this.getAppRoute() !== 'home') {
      throw new TypeError('Chat model selection is unavailable for this app.')
    }
    if (modelId !== null && typeof modelId !== 'string') {
      throw new TypeError('Invalid chat model selection.')
    }
    return this.#setChatModel(modelId)
  }

  // The app calls this once to learn the current theme and register a receiver for later changes.
  // Apps that don't theme themselves never call it.
  subscribeTheme(receiver: RpcStub<GatekeeperAppThemeReceiver>): GatekeeperAppTheme {
    this.#themeReceiver?.[Symbol.dispose]?.()
    // The argument stub is disposed when this call returns, so keep our own dup (released in dispose).
    this.#themeReceiver = receiver.dup()
    return this.#theme
  }

  #dropThemeReceiver(receiver: RpcStub<GatekeeperAppThemeReceiver>) {
    if (this.#themeReceiver !== receiver) return
    receiver[Symbol.dispose]?.()
    this.#themeReceiver = null
  }

  // Push a new theme to a subscribed app; a no-op until (and unless) the app subscribes.
  updateTheme(theme: GatekeeperAppTheme) {
    this.#theme = theme
    const receiver = this.#themeReceiver
    if (!receiver) return

    try {
      Promise.resolve(receiver.setTheme(theme)).catch(() => this.#dropThemeReceiver(receiver))
    } catch {
      this.#dropThemeReceiver(receiver)
    }
  }

  // Queue a presentation change; the latest requested state is applied on the next frame.
  setPresenting(active: boolean): Promise<PresentAck> {
    return new Promise((resolve) => {
      this.#pendingActive = active
      this.#pendingResolvers.push(resolve)
      this.#frameId ??= requestAnimationFrame(() => this.#applyPending())
    })
  }

  // Apply the last-requested state once, resolving every caller queued this frame with the result.
  #applyPending() {
    this.#frameId = null
    const active = this.#pendingActive!
    const resolvers = this.#pendingResolvers
    this.#pendingActive = null
    this.#pendingResolvers = []
    // No-op toggles skip the layout apply.
    const ack: PresentAck =
      active === this.#presenting ? { rect: null, willResize: false } : this.#present(active)
    this.#presenting = active
    for (const resolve of resolvers) resolve(ack)
  }

  // Cancel the rate limiter's pending resume timer once this host is no longer in use.
  dispose() {
    this.#navigationReceiver?.[Symbol.dispose]?.()
    this.#navigationReceiver = null
    this.#disposeRateLimiter()
    this.#themeReceiver?.[Symbol.dispose]?.()
    this.#themeReceiver = null
    if (this.#frameId !== null) {
      cancelAnimationFrame(this.#frameId)
      this.#frameId = null
    }
    if (this.#promptNavigationTimer !== null) {
      clearTimeout(this.#promptNavigationTimer)
      this.#promptNavigationTimer = null
    }
    if (this.#propertyNavigationTimer !== null) {
      clearTimeout(this.#propertyNavigationTimer)
      this.#propertyNavigationTimer = null
    }
    for (const resolve of this.#pendingResolvers) resolve({ rect: null, willResize: false })
    this.#pendingResolvers = []
    this.#pendingActive = null
    if (this.#presenting) {
      this.#presenting = false
      this.#present(false)
    }
  }
}

/**
 * Hosts a gatekeeper's full-page management SPA in a sandboxed, network-isolated iframe. The app
 * talks to the gatekeeper only through the `ui` capability carried over the MessagePort RPC session.
 * The iframe fills its parent container.
 */
export default function SandboxedGatekeeperApp({ frame, gatekeeperVendorId, appRoute = null }: {
  frame: GatekeeperUiFrame,
  gatekeeperVendorId: string,
  appRoute?: string | null,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const routeStateRef = useRef<WorkflowRouteState>({})
  routeStateRef.current = parseWorkflowRouteState(location.search)
  const setWorkflowRouteState = useCallback((state: WorkflowRouteState) => {
    void navigate({ to: "/workflows", search: state, replace: true })
  }, [navigate])
  const propertyRouteStateRef = useRef<GatekeeperAppPropertyRouteState>({})
  propertyRouteStateRef.current = parsePropertyRouteState(location.search)
  const appRouteRef = useRef(appRoute)
  appRouteRef.current = appRoute
  const propertyNavigationPending = useRef(false)
  const [navigationCommit, setNavigationCommit] = useState(0)
  const setPropertyRouteState = useCallback<SetPropertyRouteState>((state, mode) => {
    if (mode === "push" && state.property) {
      const listState = { ...state }
      delete listState.property
      delete listState.tab
      delete listState.invalidProperty
      propertyNavigationPending.current = true
      void navigate({ to: "/properties", search: listState, replace: true })
        .then(() => navigate({ to: "/properties", search: state }))
        .finally(() => {
          propertyNavigationPending.current = false
          setNavigationCommit(value => value + 1)
        })
      return
    }
    void navigate({ to: "/properties", search: state, replace: true })
  }, [navigate])
  const { authenticatedApi } = useAuthenticatedApi()
  const { reportConnections } = useRailConnections()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sessionRef = useRef<{ [Symbol.dispose]?(): void } | null>(null)
  const hostRef = useRef<GatekeeperAppHostImpl | null>(null)
  const connectedRef = useRef(false)
  const invalidatedRef = useRef(false)
  const [overlay, setOverlay] = useState<OverlayState>(null)
  const overlayRef = useRef<OverlayState>(null)
  // Push the Workshop's resolved light/dark mode and deployment accent whenever either changes.
  const { resolvedThemeMode } = useTheme()
  const configuredAccentColor = useServerConfig()?.accentColor
  const accentColor = configuredAccentColor && isHexColor(configuredAccentColor)
    ? configuredAccentColor
    : null
  const connectionsEnabled = gatekeeperAppCanReportConnections(gatekeeperVendorId)
  const chatModelsEnabled = connectionsEnabled && appRoute === 'home'
  const features = chatModelsEnabled ? HOME_FEATURES : connectionsEnabled ? CONNECTIONS_FEATURE : null
  const themeRef = useRef<GatekeeperAppTheme>({
    mode: resolvedThemeMode,
    accentColor,
    ...(features ? { features } : {}),
  })
  themeRef.current = {
    mode: resolvedThemeMode,
    accentColor,
    ...(features ? { features } : {}),
  }
  useEffect(() => {
    hostRef.current?.updateTheme({
      mode: resolvedThemeMode,
      accentColor,
      ...(features ? { features } : {}),
    })
  }, [resolvedThemeMode, accentColor, features])

  const acceptConnections = useCallback((rows: GatekeeperAppConnection[]) => {
    if (!connectionsEnabled) {
      throw new TypeError('Connection reports are not available for this app.')
    }
    reportConnections(rows)
  }, [connectionsEnabled, reportConnections])

  const loadChatModelState = useCallback<GetChatModelState>(async () => {
    const models = (await authenticatedApi.listModels()).filter(model => model.id === "gpt-6-luna")
    return {
      models: models.map(({ id, name }) => ({ id, name })),
      selectedModelId: getStoredSelectedModel(models),
    }
  }, [authenticatedApi])

  const setChatModel = useCallback<SetChatModel>(async (modelId) => {
    const models = (await authenticatedApi.listModels()).filter(model => model.id === "gpt-6-luna")
    if (modelId !== "gpt-6-luna" || !models.some((model) => model.id === modelId)) {
      throw new TypeError('Invalid chat model selection.')
    }
    persistSelectedModel(modelId)
    return {
      models: models.map(({ id, name }) => ({ id, name })),
      selectedModelId: modelId,
    }
  }, [authenticatedApi])

  const setOverlayPhase = useCallback((next: OverlayState) => {
    if (overlayRef.current === next) return
    overlayRef.current = next
    setOverlay(next)
  }, [])

  // Grow the iframe to full-viewport (or restore it), then report back the pane rect and whether the
  // size actually changed.
  const present = useCallback<PresentController>((active) => {
    const el = iframeRef.current
    const before = el?.getBoundingClientRect()
    // Duplicate restores are common during cleanup; avoid forcing layout when already restored.
    if (!active && overlayRef.current === null) return { rect: null, willResize: false }
    flushSync(() => setOverlayPhase(active ? 'full' : null))
    const after = el?.getBoundingClientRect()
    const willResize =
      !!before && !!after && (before.width !== after.width || before.height !== after.height)
    // On open, `before` is the pane rect the app pins to.
    const rect =
      active && before
        ? { left: before.left, top: before.top, width: before.width, height: before.height }
        : null
    return { rect, willResize }
  }, [setOverlayPhase])
  const openTarget = useCallback<OpenTarget>(({ workspaceId, gadgetId }) => {
    navigate({
      to: '/workspace/$id',
      params: { id: workspaceId },
      search: gadgetId === undefined ? {} : { w: gadgetId },
    })
  }, [navigate])
  const titlesRef = useRef<{ at: number, titles: Promise<Map<string, string>> } | null>(null)
  const resolveWorkspaceTitles = useCallback<ResolveWorkspaceTitles>(async (ids) => {
    let entry = titlesRef.current
    if (!entry || Date.now() - entry.at >= WORKSPACE_TITLES_TTL_MS) {
      entry = {
        at: Date.now(),
        titles: authenticatedApi.listGadgets()
          .then((gadgets) => new Map(gadgets.map((gadget) => [gadget.id, gadget.title]))),
      }
      titlesRef.current = entry
      // Don't cache a failure: drop it so the next lookup retries.
      const failed = entry
      entry.titles.catch(() => {
        if (titlesRef.current === failed) titlesRef.current = null
      })
    }
    const titles = await entry.titles
    return ids.map((id) => titles.get(id) ?? null)
  }, [authenticatedApi])
  const openPrompt = useCallback<OpenPrompt>((prompt) => {
    navigate({ to: '/ask-bifana', search: { prompt } })
  }, [navigate])
  const openAppRoute = useCallback<OpenAppRoute>((route) => {
    navigate({ to: GATEKEEPER_APP_ROUTES[route] })
  }, [navigate])
  const openPropertyGuide = useCallback((pNumber: string) => {
    void navigate({ to: "/properties", search: { property: pNumber, tab: "guide" } })
  }, [navigate])
  // The gatekeeper capability is `any`: its method shape is gatekeeper-defined and opaque to us.
  const capabilityRef = useRef<any>(null)
  capabilityRef.current = frame.ui

  useEffect(() => {
    connectedRef.current = false
    invalidatedRef.current = false

    const connect = (port: MessagePort) => {
      if (connectedRef.current) {
        // A second handshake (e.g. iframe reloaded) invalidates the session.
        invalidatedRef.current = true
        port.close()
        sessionRef.current?.[Symbol.dispose]?.()
        sessionRef.current = null
        hostRef.current?.dispose()
        hostRef.current = null
        setOverlayPhase(null)
        return
      }
      if (invalidatedRef.current || !capabilityRef.current) {
        port.close()
        return
      }
      const host = new GatekeeperAppHostImpl(
        capabilityRef.current,
        present,
        themeRef.current,
        openTarget,
        openPrompt,
        () => appRouteRef.current,
        openAppRoute,
        resolveWorkspaceTitles,
        acceptConnections,
        connectionsEnabled,
        loadChatModelState,
        setChatModel,
        () => routeStateRef.current,
        setWorkflowRouteState,
        () => propertyRouteStateRef.current,
        setPropertyRouteState,
        openPropertyGuide,
        gatekeeperVendorId === "lisbeyond",
      )
      hostRef.current = host
      sessionRef.current = newMessagePortRpcSession(port, host)
      connectedRef.current = true
    }

    const handleMessage = (event: MessageEvent) => {
      // Only accept the handshake from our own sandboxed iframe (which posts from a null origin).
      // Capture contentWindow first: if the frame isn't mounted there's no legitimate sender, so
      // reject — comparing against a concrete window avoids a `source === undefined` edge.
      const frameWindow = iframeRef.current?.contentWindow
      if (!frameWindow || event.source !== frameWindow || event.origin !== 'null') return
      if (invalidatedRef.current) return
      if (forwardTrustedFrameError(
        event, frameWindow, { surface: 'gatekeeper-app', gatekeeperVendorId },
      )) return
      if (event.data?.type === 'handshake' && event.ports?.[0]) {
        connect(event.ports[0])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
      sessionRef.current?.[Symbol.dispose]?.()
      sessionRef.current = null
      hostRef.current?.dispose()
      hostRef.current = null
      setOverlayPhase(null)
    }
    // Re-establish the session if either the HTML or the `ui` capability changes, so a new frame
    // carrying a fresh stub (even with identical HTML) never keeps talking through the stale one.
  }, [acceptConnections, connectionsEnabled, frame.iframeHtml, frame.ui,
      gatekeeperVendorId, loadChatModelState, openAppRoute, openPropertyGuide, openPrompt, openTarget, present,
      setChatModel, setPropertyRouteState, setWorkflowRouteState,
      resolveWorkspaceTitles, setOverlayPhase])

  // URL changes update the existing MessagePort session, including browser Back/Forward.
  const navigationKey = JSON.stringify([appRoute, propertyRouteStateRef.current, routeStateRef.current])
  useEffect(() => {
    if (!propertyNavigationPending.current) hostRef.current?.[UPDATE_NAVIGATION]()
  }, [navigationKey, navigationCommit])

  return (
    <iframe
      ref={iframeRef}
      srcDoc={frame.iframeHtml}
      // allow-scripts: run the app's JS. allow-modals: its beforeunload unsaved-changes guard. Not
      // allow-same-origin (the frame stays an opaque origin), and the app's CSP keeps connect-src 'none'.
      sandbox={gatekeeperVendorId === "lisbeyond" ? "allow-scripts allow-modals allow-downloads" : "allow-scripts allow-modals"}
      allow="clipboard-write"
      title="Gatekeeper app"
      style={iframeStyleForOverlay(overlay)}
    />
  )
}
