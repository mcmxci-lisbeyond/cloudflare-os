import { useCallback, useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { List, X } from '@phosphor-icons/react'
import TopBarNotice from '../../TopBarNotice'
import ReconnectingChip from '../ReconnectingChip'
import { useConnectionLost } from '../../RpcContext'
import { useServerConfig } from '../../ServerConfigContext'
import Sidebar from './Sidebar'
import CommandPalette from './CommandPalette'
import { OPEN_COMMAND_PALETTE_EVENT } from './commandPaletteBus'
import { RailConnectionsProvider } from './railConnectionsContext'
import { RailSidebarProvider } from './railSidebarContext'

const STORAGE_KEY_COLLAPSED = 'gadgets:sidebar-collapsed'

// Read synchronously for the initial state so the rail doesn't flash open then collapse.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1'
  } catch {
    return false
  }
}

/**
 * The authenticated, non-fullscreen application chrome: a persistent left rail and routed content.
 * Desktop reserves a notice row only when there is an announcement. Chat and Gadget editor
 * pages are still rendered fullscreen by __root.tsx without this shell.
 *
 * Mobile: below `md` the rail collapses to an overlay drawer triggered by a hamburger button in a
 * minimal top bar. We don't try to gracefully shrink the rail at narrow widths; the overlay model
 * is simpler and matches how the rest of the app handles small screens.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const connectionLost = useConnectionLost()
  const hasAnnouncement = Boolean(useServerConfig()?.announcement?.trim())

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY_COLLAPSED, next ? '1' : '0') } catch {}
      return next
    })
  }, [])

  // Close mobile drawer when escape is pressed.
  useEffect(() => {
    if (!mobileOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [mobileOpen])

  // Close the mobile drawer on navigation. Links in the drawer (primary nav, Gatekeepers, the user
  // menu, workspace rows) otherwise navigate while leaving the drawer covering the page — so on a
  // phone it looks like nothing happened. Watching the pathname catches every navigation source
  // without prop-drilling a close callback through the whole rail. No-op on desktop, where the
  // drawer is never open.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Global ⌘K / Ctrl+K opens the command palette; the rail's search button opens it via a custom
  // event so it doesn't have to prop-drill into the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    const onOpen = () => setPaletteOpen(true)
    document.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    }
  }, [])

  return (
    <RailConnectionsProvider>
      <RailSidebarProvider>
      <div className="flex h-screen min-h-screen w-screen overflow-hidden bg-kumo-base">
      {/* Desktop sidebar — hidden on mobile in favor of the drawer. */}
      <div className="hidden md:flex">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px] md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 md:hidden">
            <Sidebar collapsed={false} onToggleCollapsed={() => setMobileOpen(false)} />
          </div>
        </>
      )}

      {/* Main column */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Mobile needs a menu button. Desktop starts at the routed page's own header unless
            there is an actual announcement; never reserve an empty chrome row. */}
        <div className={`flex min-h-14 shrink-0 items-center border-b border-kumo-line bg-kumo-base px-3 ${hasAnnouncement ? '' : 'md:hidden'}`}>
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-kumo-default transition-colors hover:bg-kumo-tint md:hidden"
          >
            {mobileOpen ? <X size={16} /> : <List size={16} />}
          </button>
          <TopBarNotice inline />
          <div className="ml-auto flex items-center gap-2 md:hidden">
            {connectionLost && <ReconnectingChip />}
          </div>
        </div>

        {/* Routed content. Flat enterprise canvas — no texture. */}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        {connectionLost && (
          <div className="pointer-events-none absolute bottom-4 right-4 z-30 hidden md:block">
            <ReconnectingChip />
          </div>
        )}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </div>
      </RailSidebarProvider>
    </RailConnectionsProvider>
  )
}
