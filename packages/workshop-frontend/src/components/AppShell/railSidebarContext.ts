import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useOptionalAuthenticatedApi } from '../../AuthContext'
import { parseGatekeeperAppSidebar, type GatekeeperAppSidebar } from '../../gatekeeperAppNavigation'

// The Lisbeyond app reports which sidebar sections the employee may see (LIS-307). The shell keeps
// the last good report, and caches it per user so a cold start on a host page (a workspace, Ask
// Bifana) still shows their sections. The cache is display only: every page checks access itself.
const CACHE_PREFIX = 'lb-rail-sidebar-v1:'

type RailSidebarContextValue = {
  sidebar: GatekeeperAppSidebar | null
  reportSidebar: (sidebar: GatekeeperAppSidebar) => void
}

const RailSidebarContext = createContext<RailSidebarContextValue | null>(null)

function readCache(userId: string): GatekeeperAppSidebar | null {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + userId)
    const cached = raw ? parseGatekeeperAppSidebar(JSON.parse(raw)) : null
    // Only an active employee's sections are worth showing before the live report arrives.
    return cached?.access === 'active' ? cached : null
  } catch {
    return null
  }
}

function writeCache(userId: string, sidebar: GatekeeperAppSidebar) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(sidebar))
  } catch {
    // Storage can be unavailable (private window, blocked site data); the live report still renders.
  }
}

export function RailSidebarProvider({ children }: { children: ReactNode }) {
  const userId = useOptionalAuthenticatedApi()?.currentUser?.id ?? null
  const [sidebar, setSidebar] = useState<GatekeeperAppSidebar | null>(null)
  // Refs keep `reportSidebar` stable: the app frame's host session depends on it, and the user id
  // arrives later (whoami). A changing callback would tear that session down.
  const userRef = useRef<string | null>(userId)
  const lastReport = useRef<{ sidebar: GatekeeperAppSidebar; userId: string | null } | null>(null)

  useEffect(() => {
    userRef.current = userId
    if (!userId) return
    const last = lastReport.current
    if (last && last.userId !== null && last.userId !== userId) {
      // Another person signed in without a reload: never show the previous person's sections.
      lastReport.current = null
      setSidebar(readCache(userId))
      return
    }
    if (last) {
      // The report arrived before the user id did; it belongs to this user.
      last.userId = userId
      if (last.sidebar.access !== 'unavailable') writeCache(userId, last.sidebar)
      return
    }
    setSidebar(current => current ?? readCache(userId))
  }, [userId])

  const reportSidebar = useCallback((next: GatekeeperAppSidebar) => {
    // A failed read keeps the last good sections instead of collapsing everyone to Home.
    setSidebar(current => next.access === 'unavailable' && current && current.access !== 'unavailable'
      ? current
      : next)
    if (next.access === 'unavailable') return
    lastReport.current = { sidebar: next, userId: userRef.current }
    if (userRef.current) writeCache(userRef.current, next)
  }, [])

  const value = useMemo(() => ({ sidebar, reportSidebar }), [sidebar, reportSidebar])
  return createElement(RailSidebarContext.Provider, { value }, children)
}

export function useRailSidebar(): RailSidebarContextValue {
  const context = useContext(RailSidebarContext)
  if (!context) throw new Error('Rail sidebar must be used within RailSidebarProvider')
  return context
}

/** For app frames mounted outside the shell: no shell, no sidebar to report to. */
export function useOptionalRailSidebar(): RailSidebarContextValue | null {
  return useContext(RailSidebarContext)
}
