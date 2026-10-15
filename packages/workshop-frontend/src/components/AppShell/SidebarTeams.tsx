import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  ArrowClockwise,
  Buildings,
  CaretRight,
  ChartLineUp,
  ChartPieSlice,
  ChatCircleDots,
  ClipboardText,
  Coins,
  Hammer,
  Handshake,
  House,
  Key,
  Lightning,
  Receipt,
  ShareNetwork,
  ShieldCheck,
  Star,
  TrendUp,
  UsersThree,
  Wrench,
} from '@phosphor-icons/react'
import SidebarItem from './SidebarItem'
import { useRailSidebar } from './railSidebarContext'
import {
  GATEKEEPER_APP_ROUTES,
  GATEKEEPER_APP_SIDEBAR,
  type GatekeeperAppRoute,
  type GatekeeperAppSidebarItemId,
  type GatekeeperAppSidebarSection,
  type GatekeeperAppSidebarSectionId,
  type GatekeeperAppSidebarTopItem,
} from '../../gatekeeperAppNavigation'

const icon = (Icon: typeof House) => <Icon size={14} weight="regular" />

const TOP: Record<GatekeeperAppSidebarTopItem, { label: string; icon: ReactNode }> = {
  home: { label: 'Home', icon: icon(House) },
  'ask-bifana': { label: 'Ask Bifana', icon: icon(ChatCircleDots) },
  properties: { label: 'Properties', icon: icon(Buildings) },
}

const SECTIONS: Record<GatekeeperAppSidebarSectionId, { label: string; icon: ReactNode }> = {
  management: { label: 'Management', icon: icon(ChartPieSlice) },
  finance: { label: 'Finance', icon: icon(Coins) },
  renovations: { label: 'Renovations', icon: icon(Hammer) },
  sales: { label: 'Sales', icon: icon(Handshake) },
  'property-management': { label: 'Property Management', icon: icon(UsersThree) },
  upkeep: { label: 'Upkeep', icon: icon(Wrench) },
  admin: { label: 'Admin', icon: icon(ShieldCheck) },
}

const ITEMS: Record<GatekeeperAppSidebarItemId, { label: string; icon: ReactNode }> = {
  'business-pulse': { label: 'Business Pulse', icon: icon(ChartPieSlice) },
  'finance-invoices': { label: 'Invoices', icon: icon(Receipt) },
  'finance-pnl': { label: 'P&L', icon: icon(ChartLineUp) },
  'renovations-invoice-review': { label: 'Invoice review', icon: icon(Receipt) },
  'new-leads': { label: 'New Leads', icon: icon(TrendUp) },
  'owner-success': { label: 'Owner & Property Success', icon: icon(Handshake) },
  'guest-success': { label: 'Guest Success', icon: icon(Star) },
  'revenue-management': { label: 'Revenue Management', icon: icon(ChartLineUp) },
  onboarding: { label: 'Onboarding & QA', icon: icon(ClipboardText) },
  'admin-workflows': { label: 'Workflows', icon: icon(Lightning) },
  'admin-access': { label: 'Access', icon: icon(Key) },
  'admin-connections': { label: 'Connections', icon: icon(ShareNetwork) },
}

const pathOf = (route: GatekeeperAppRoute) => GATEKEEPER_APP_ROUTES[route]
const itemRoute = (section: GatekeeperAppSidebarSectionId, item: GatekeeperAppSidebarItemId) =>
  (GATEKEEPER_APP_SIDEBAR.sections[section].items as Record<string, GatekeeperAppRoute>)[item]

// Which team rows the employee has opened or closed, remembered per browser (display only).
const OPEN_KEY = 'lb-rail-sections-open-v1'
function readOpen(): Record<string, boolean> {
  try { return JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? '{}') as Record<string, boolean> } catch { return {} }
}
function writeOpen(value: Record<string, boolean>) {
  try { window.localStorage.setItem(OPEN_KEY, JSON.stringify(value)) } catch { /* display only */ }
}

/** The primary navigation (LIS-307): everyone's top items, then one row per team. */
export function SidebarTeams({ collapsed }: { collapsed: boolean }) {
  const { sidebar } = useRailSidebar()
  const [open, setOpen] = useState<Record<string, boolean>>(readOpen)
  const pathname = useRouterState({ select: s => s.location.pathname })
  const top = sidebar ? sidebar.top : GATEKEEPER_APP_SIDEBAR.top
  const sections = (sidebar?.sections ?? []).filter(section => section.id !== 'admin')

  const toggle = useCallback((id: string, current: boolean) => {
    setOpen(previous => {
      const next = { ...previous, [id]: !current }
      writeOpen(next)
      return next
    })
  }, [])

  return (
    <nav aria-label="Main" className={`flex flex-col gap-0.5 ${collapsed ? 'px-2' : 'px-3'}`}>
      {top.map(item => (
        <SidebarItem key={item} to={pathOf(item)} label={TOP[item].label} icon={TOP[item].icon} collapsed={collapsed} />
      ))}
      {sidebar?.access === 'pending' && !collapsed && (
        <p className="px-2.5 py-2 text-[12px] leading-4 text-lb-rail-muted">Your access is being set up.</p>
      )}
      {sidebar?.access === 'unavailable' && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          aria-label="Sections didn't load. Retry"
          title={collapsed ? "Sections didn't load. Retry" : undefined}
          className="press flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-left text-[12.5px] text-lb-rail-muted transition-[background-color,color] hover:bg-lb-rail-active hover:text-lb-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11"
        >
          <ArrowClockwise size={14} aria-hidden="true" className="shrink-0" />
          {!collapsed && <span>Sections didn't load · Retry</span>}
        </button>
      )}
      {sections.length > 0 && <div className="h-2" aria-hidden="true" />}
      {sections.map(section => (
        <TeamRow
          key={section.id}
          section={section}
          collapsed={collapsed}
          expanded={open[section.id] ?? (section.open || isWithin(section, pathname))}
          onToggle={toggle}
        />
      ))}
    </nav>
  )
}

function isWithin(section: GatekeeperAppSidebarSection, pathname: string) {
  return section.items.some(item => pathOf(itemRoute(section.id, item)) === pathname)
}

function TeamRow({ section, collapsed, expanded, onToggle }: {
  section: GatekeeperAppSidebarSection
  collapsed: boolean
  expanded: boolean
  onToggle: (id: string, current: boolean) => void
}) {
  const definition = GATEKEEPER_APP_SIDEBAR.sections[section.id]
  // Pages under the team; a page that is the team's own landing does not repeat as a child.
  const pages = section.items.filter(item => itemRoute(section.id, item) !== definition.landing)
  const meta = SECTIONS[section.id]
  if (collapsed || pages.length === 0) {
    return <SidebarItem to={pathOf(definition.landing)} label={meta.label} icon={meta.icon} collapsed={collapsed} />
  }
  const childrenId = `rail-team-${section.id}`
  return (
    <div>
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          <SidebarItem to={pathOf(definition.landing)} label={meta.label} icon={meta.icon} />
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={childrenId}
          aria-label={`${expanded ? 'Hide' : 'Show'} ${meta.label} pages`}
          onClick={() => onToggle(section.id, expanded)}
          className="press flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-lb-rail-muted transition-[background-color,color] hover:bg-lb-rail-active hover:text-lb-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11"
        >
          <CaretRight
            size={12}
            aria-hidden="true"
            className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
          />
        </button>
      </div>
      {expanded && (
        <div id={childrenId} className="mb-1 flex flex-col gap-0.5 pl-5">
          {pages.map(item => (
            <SidebarItem key={item} to={pathOf(itemRoute(section.id, item))} label={ITEMS[item].label} icon={ITEMS[item].icon} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Admin tools in a footer pop-out, for access administrators only (LIS-307). */
export function RailAdmin({ collapsed }: { collapsed: boolean }) {
  const { sidebar } = useRailSidebar()
  const admin = sidebar?.sections.find(section => section.id === 'admin')
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pathname = useRouterState({ select: s => s.location.pathname })

  useEffect(() => { setOpen(false) }, [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    const onPointer = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!admin || admin.items.length === 0) return null
  return (
    <div ref={wrapper} className={`relative shrink-0 border-t border-lb-rail-line py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Admin"
        title={collapsed ? 'Admin' : undefined}
        onClick={() => setOpen(value => !value)}
        className={[
          'press flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-lb-rail-ink-2 transition-[background-color,color] hover:bg-lb-rail-active hover:text-lb-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11',
          collapsed ? 'w-10 justify-center px-0' : 'w-full',
        ].join(' ')}
      >
        <ShieldCheck size={14} aria-hidden="true" className="shrink-0" />
        {!collapsed && <span className="min-w-0 flex-1 text-left">Admin</span>}
        {!collapsed && <CaretRight size={12} aria-hidden="true" className="shrink-0 text-lb-rail-muted" />}
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Admin"
          className="absolute bottom-2 left-full z-50 ml-2 flex w-56 flex-col gap-0.5 rounded-xl border border-kumo-line bg-kumo-base p-1.5 text-kumo-default max-md:bottom-full max-md:left-3 max-md:mb-1 max-md:ml-0"
        >
          {admin.items.map(item => (
            <Link
              key={item}
              role="menuitem"
              to={pathOf(itemRoute('admin', item)) as never}
              className="flex h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors hover:bg-kumo-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lb-rail-label max-md:h-11"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">{ITEMS[item].icon}</span>
              {ITEMS[item].label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
