import { Link } from '@tanstack/react-router'
import {
  Buildings,
  ChartPieSlice,
  ChatCircleDots,
  ClipboardText,
  Hexagon,
  House,
  Lightning,
  MagnifyingGlass,
  SidebarSimple,
} from '@phosphor-icons/react'
import { useSiteName } from '../../ServerConfigContext'
import SiteLogo from '../SiteLogo'
import { openCommandPalette } from './commandPaletteBus'
import SidebarItem from './SidebarItem'
import {
  SidebarWorkspacesProvider,
  SidebarWorkspacesLists,
} from './SidebarWorkspaces'
import SidebarUtilityStrip from './SidebarUtilityStrip'
import RailConnections from './RailConnections'

/**
 * The persistent left rail. Three pinned regions sandwich a single scrolling region of lists, so
 * the user can always reach Search, primary nav, and the bottom utility strip no matter how many
 * workspaces they have.
 *
 * Layout (top → bottom):
 *   • brand row                            pinned
 *   • search                               pinned
 *   • primary Lisbeyond navigation         pinned
 *   • Favorites / Recent workspaces        SCROLLS
 *   • connection status                    pinned
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
        {/* Pinned top stack. shrink-0 keeps it from squishing when the lists below grow. */}
        <div className="flex shrink-0 flex-col gap-3 pt-3">
          {/* Primary nav */}
          <nav className={`flex flex-col gap-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
            <SidebarItem
              to="/"
              label="Home"
              icon={<House size={14} weight="regular" />}
              collapsed={collapsed}
            />
            <SidebarItem
              to="/properties"
              label="Properties"
              icon={<Buildings size={14} weight="regular" />}
              collapsed={collapsed}
            />
            <SidebarItem
              to="/portfolio"
              label="Portfolio"
              matchPrefix
              icon={<ChartPieSlice size={14} weight="regular" />}
              collapsed={collapsed}
            />
            <SidebarItem
              to="/ask-bifana"
              label="Ask Bifana"
              icon={<ChatCircleDots size={14} weight="regular" />}
              collapsed={collapsed}
            />
            <SidebarItem
              to="/onboarding"
              label="Onboarding"
              icon={<ClipboardText size={14} weight="regular" />}
              collapsed={collapsed}
            />
            <SidebarItem
              to="/workflows"
              label="Workflows"
              icon={<Lightning size={14} weight="regular" />}
              collapsed={collapsed}
            />
          </nav>
        </div>

        {/* Scrolling middle: only the Favorites / Recent workspaces / Recent blueprints lists.
            min-h-0 lets flex children compute scroll height correctly. */}
        <div className="sidebar-scroll mt-1 min-h-0 flex-1 overflow-y-auto">
          <SidebarWorkspacesLists collapsed={collapsed} />
        </div>
      </SidebarWorkspacesProvider>

      <RailConnections collapsed={collapsed} />
      <SidebarUtilityStrip collapsed={collapsed} />
    </aside>
  )
}
