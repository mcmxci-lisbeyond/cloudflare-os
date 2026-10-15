import { Link } from '@tanstack/react-router'
import {
  Hexagon,
  MagnifyingGlass,
  SidebarSimple,
} from '@phosphor-icons/react'
import { useSiteName } from '../../ServerConfigContext'
import SiteLogo from '../SiteLogo'
import { openCommandPalette } from './commandPaletteBus'
import {
  SidebarWorkspacesProvider,
  SidebarWorkspacesLists,
} from './SidebarWorkspaces'
import SidebarUtilityStrip from './SidebarUtilityStrip'
import RailConnections from './RailConnections'
import { RailAdmin, SidebarTeams } from './SidebarTeams'
import { useRailSidebar } from './railSidebarContext'

/**
 * The persistent left rail. Three pinned regions sandwich a single scrolling region of lists, so
 * the user can always reach Search, primary nav, and the bottom utility strip no matter how many
 * workspaces they have.
 *
 * Layout (top → bottom):
 *   • brand row                            pinned
 *   • search                               pinned
 *   • team navigation (LIS-307), then Favorites / Recent workspaces   SCROLLS
 *   • connection status (until the app reports the sidebar)           pinned
 *   • Admin pop-out (access administrators)                           pinned
 *   • utility strip (theme, settings, avatar) pinned
 */
export default function Sidebar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const siteName = useSiteName()
  const { sidebar } = useRailSidebar()
  return (
    <aside
      aria-label="Primary"
      data-collapsed={collapsed ? 'true' : 'false'}
      className={[
        'lb-sidebar-rail flex h-screen flex-col bg-lb-rail text-lb-rail-ink-2',
        collapsed ? 'w-[56px]' : 'w-[248px]',
        'shrink-0 transition-[width] duration-200 ease-out',
      ].join(' ')}
    >
      <div className={`flex h-14 shrink-0 items-center ${collapsed ? 'px-2' : 'px-3'}`}>
        {collapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="press flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-lb-rail-muted transition-colors hover:bg-lb-rail-active hover:text-lb-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11 max-md:w-11"
          >
            <SidebarSimple size={16} className="rotate-180" />
          </button>
        ) : (
          <Link to="/" aria-label={siteName} className="flex h-10 min-w-0 flex-1 items-center">
            <SiteLogo
              size={144}
              srcOverride="/brand/lisbeyond-lockup-horizontal-beige.svg"
              className="h-auto w-[144px] max-w-full shrink-0"
            >
              <Hexagon size={24} weight="bold" className="shrink-0 text-lb-rail-ink" />
            </SiteLogo>
          </Link>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="press flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-lb-rail-muted transition-colors hover:bg-lb-rail-active hover:text-lb-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11 max-md:w-11"
          >
            <SidebarSimple size={16} />
          </button>
        )}
      </div>

      <div className={collapsed ? 'flex shrink-0 justify-center px-2' : 'shrink-0 px-3'}>
        <button
          type="button"
          onClick={() => openCommandPalette()}
          aria-label="Search"
          title="Search (⌘K)"
          className={[
            'press flex h-10 cursor-pointer items-center rounded-lg text-lb-rail-ink-2 transition-colors hover:bg-lb-rail-active hover:text-lb-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11',
            collapsed ? 'w-10 justify-center max-md:w-11' : 'w-full gap-2 bg-lb-rail-active/30 px-3',
          ].join(' ')}
        >
          <MagnifyingGlass size={16} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-[13px] font-medium">Search</span>
              <kbd className="rounded bg-lb-rail-active px-1.5 py-0.5 font-sans text-[10px] text-lb-rail-muted">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      <SidebarWorkspacesProvider>
        {/* Scrolling middle: the team navigation (LIS-307), then the Favorites / Recent lists.
            Founders can have many team rows, so the navigation scrolls instead of pinning.
            min-h-0 lets flex children compute scroll height correctly. */}
        <div className="sidebar-scroll mt-3 min-h-0 flex-1 overflow-y-auto">
          <SidebarTeams collapsed={collapsed} />
          <div className="mt-1">
            <SidebarWorkspacesLists collapsed={collapsed} />
          </div>
        </div>
      </SidebarWorkspacesProvider>

      {/* Connections moves into the Admin pop-out once the app has reported the sidebar. */}
      {!sidebar && <RailConnections collapsed={collapsed} />}
      <RailAdmin collapsed={collapsed} />
      <SidebarUtilityStrip collapsed={collapsed} />
    </aside>
  )
}
