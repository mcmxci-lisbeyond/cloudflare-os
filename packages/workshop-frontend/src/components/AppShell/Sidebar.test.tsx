// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from './Sidebar'
import { openCommandPalette } from './commandPaletteBus'
import {
  RailConnectionsProvider,
  useRailConnections,
  type RailConnection,
} from './railConnectionsContext'
import { RailSidebarProvider, useRailSidebar } from './railSidebarContext'
import { parseGatekeeperAppSidebar, type GatekeeperAppSidebar } from '../../gatekeeperAppNavigation'

vi.mock('../../ServerConfigContext', () => ({ useSiteName: () => 'Lisbeyond OS' }))
vi.mock('../SiteLogo', () => ({
  default: ({ srcOverride, children }: { srcOverride?: string, children: React.ReactNode }) =>
    srcOverride ? <img src={srcOverride} alt="" /> : children,
}))
vi.mock('./commandPaletteBus', () => ({ openCommandPalette: vi.fn<() => void>() }))
vi.mock('./SidebarWorkspaces', () => ({
  SidebarWorkspacesProvider: ({ children }: { children: React.ReactNode }) => children,
  SidebarWorkspacesLists: () => null,
}))
vi.mock('./SidebarUtilityStrip', () => ({ default: () => null }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ROUTES = [
  '/',
  '/properties',
  '/sales',
  '/sales/new-leads',
  '/ask-bifana',
  '/finance',
  '/finance/invoices',
  '/finance/pnl',
  '/management/business-pulse',
  '/workflows',
  '/settings',
  '/connections',
] as const

const MONICA = parseGatekeeperAppSidebar({
  access: 'active',
  top: ['home', 'ask-bifana', 'properties'],
  sections: [
    { id: 'finance', items: ['finance-invoices', 'finance-pnl'], open: true },
    { id: 'sales', items: ['new-leads'], open: false },
  ],
})
const BRAM = parseGatekeeperAppSidebar({
  access: 'active',
  top: ['home', 'ask-bifana', 'properties'],
  sections: [
    { id: 'management', items: ['business-pulse'], open: false },
    { id: 'finance', items: ['finance-invoices', 'finance-pnl'], open: false },
    { id: 'admin', items: ['admin-workflows', 'admin-access', 'admin-connections'], open: false },
  ],
})

function SidebarReporter({ sidebar }: { sidebar: GatekeeperAppSidebar }) {
  const { reportSidebar } = useRailSidebar()
  useEffect(() => reportSidebar(sidebar), [reportSidebar, sidebar])
  return null
}

let container: HTMLDivElement | undefined
let root: Root | undefined

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  // This jsdom has no Web Storage; give the rail a fresh in-memory one per test.
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => store.clear(),
  })
})

function ConnectionsReporter({ rows }: { rows: RailConnection[] }) {
  const { reportConnections } = useRailConnections()
  useEffect(() => reportConnections(rows), [reportConnections, rows])
  return null
}

async function renderSidebar({
  collapsed = false,
  rows,
  sidebar,
  onToggleCollapsed = () => {},
}: {
  collapsed?: boolean
  rows?: RailConnection[]
  sidebar?: GatekeeperAppSidebar
  onToggleCollapsed?: () => void
} = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <RailConnectionsProvider>
        <RailSidebarProvider>
          {rows && <ConnectionsReporter rows={rows} />}
          {sidebar && <SidebarReporter sidebar={sidebar} />}
          <Sidebar collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
        </RailSidebarProvider>
      </RailConnectionsProvider>
    ),
  })
  const childRoutes = ROUTES.map((path) => createRoute({
    getParentRoute: () => rootRoute,
    path,
  }))
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: rootRoute.addChildren(childRoutes),
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root!.render(<RouterProvider router={router} />))
  return container
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Console v3 sidebar', () => {
  it('marks expanded and collapsed rails for the responsive CSS contract', async () => {
    const expanded = await renderSidebar()
    expect(expanded.querySelector('aside[aria-label="Primary"]')?.getAttribute('data-collapsed'))
      .toBe('false')

    await act(async () => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined

    const collapsed = await renderSidebar({ collapsed: true })
    expect(collapsed.querySelector('aside[aria-label="Primary"]')?.getAttribute('data-collapsed'))
      .toBe('true')
  })

  it('opens the existing command palette from labeled and collapsed search controls', async () => {
    const expanded = await renderSidebar()
    const expandedSearch = expanded.querySelector<HTMLButtonElement>('button[aria-label="Search"]')
    expect(expandedSearch?.textContent).toContain('Search')
    expect(expandedSearch?.textContent).toContain('⌘K')
    await act(async () => expandedSearch?.click())
    expect(openCommandPalette).toHaveBeenCalledTimes(1)

    await act(async () => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined

    const collapsed = await renderSidebar({ collapsed: true })
    const collapsedSearch = collapsed.querySelector<HTMLButtonElement>('button[aria-label="Search"]')
    expect(collapsedSearch?.textContent).toBe('')
    await act(async () => collapsedSearch?.click())
    expect(openCommandPalette).toHaveBeenCalledTimes(2)
  })

  it('uses the horizontal brand and exposes collapse controls in both states', async () => {
    const onToggleCollapsed = vi.fn<() => void>()
    const expanded = await renderSidebar({ onToggleCollapsed })
    expect(expanded.querySelector('img')?.getAttribute('src'))
      .toBe('/brand/lisbeyond-lockup-horizontal-beige.svg')
    await act(async () => {
      expanded.querySelector<HTMLButtonElement>('button[aria-label="Collapse sidebar"]')?.click()
    })
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)

    await act(async () => root?.unmount())
    container?.remove()
    root = undefined
    container = undefined

    const collapsed = await renderSidebar({ collapsed: true, onToggleCollapsed })
    await act(async () => {
      collapsed.querySelector<HTMLButtonElement>('button[aria-label="Expand sidebar"]')?.click()
    })
    expect(onToggleCollapsed).toHaveBeenCalledTimes(2)
  })

  it('shows only the three everyone-items until the app reports the sidebar (LIS-307)', async () => {
    const view = await renderSidebar()
    const navLinks = [...view.querySelectorAll('nav[aria-label="Main"] a')]
    expect(navLinks.map((link) => link.textContent)).toEqual(['Home', 'Ask Bifana', 'Properties'])
    expect(view.querySelector('a[href="/connections"]')?.textContent)
      .toContain('Connections · Status unknown')
    expect(view.querySelector('button[aria-label="Admin"]')).toBeNull()
  })

  it("renders Mónica's teams: her own open with its pages, Sales collapsed, no Admin", async () => {
    window.localStorage.clear()
    const view = await renderSidebar({ sidebar: MONICA })
    const links = [...view.querySelectorAll('nav[aria-label="Main"] a')]
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'], ['Ask Bifana', '/ask-bifana'], ['Properties', '/properties'],
      ['Finance', '/finance'], ['Invoices', '/finance/invoices'], ['P&L', '/finance/pnl'],
      ['Sales', '/sales'],
    ])
    expect(view.querySelector('button[aria-label="Hide Finance pages"]')?.getAttribute('aria-expanded')).toBe('true')
    expect(view.querySelector('button[aria-label="Show Sales pages"]')?.getAttribute('aria-expanded')).toBe('false')
    // Connections lives under Admin now; Mónica has neither.
    expect(view.querySelector('a[href="/connections"]')).toBeNull()
    expect(view.querySelector('button[aria-label="Admin"]')).toBeNull()

    await act(async () => view.querySelector<HTMLButtonElement>('button[aria-label="Hide Finance pages"]')?.click())
    expect(view.querySelector('a[href="/finance/invoices"]')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('lb-rail-sections-open-v1') ?? '{}')).toEqual({ finance: false })
    await act(async () => view.querySelector<HTMLButtonElement>('button[aria-label="Show Sales pages"]')?.click())
    expect(view.querySelector('a[href="/sales/new-leads"]')?.textContent).toBe('New Leads')
    window.localStorage.clear()
  })

  it('gives administrators an Admin pop-out that closes on Escape', async () => {
    const view = await renderSidebar({ sidebar: BRAM })
    // Management's only page is its landing, so it is one row with no arrow.
    expect(view.querySelector('a[href="/management/business-pulse"]')?.textContent).toBe('Management')
    expect(view.querySelector('button[aria-label$="Management pages"]')).toBeNull()
    const admin = view.querySelector<HTMLButtonElement>('button[aria-label="Admin"]')!
    await act(async () => admin.click())
    const menu = view.querySelector('[role="menu"]')
    expect([...menu!.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Workflows', '/workflows'], ['Access', '/settings'], ['Connections', '/connections'],
    ])
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(view.querySelector('[role="menu"]')).toBeNull()
    expect(document.activeElement).toBe(admin)
  })

  it('shows a pending employee Home only, with a quiet note', async () => {
    const view = await renderSidebar({ sidebar: parseGatekeeperAppSidebar({ access: 'pending', top: ['home'], sections: [] }) })
    expect([...view.querySelectorAll('nav[aria-label="Main"] a')].map((link) => link.textContent)).toEqual(['Home'])
    expect(view.textContent).toContain('Your access is being set up.')
  })

  it('offers a retry instead of every section when the sidebar failed to load', async () => {
    const view = await renderSidebar({ sidebar: parseGatekeeperAppSidebar({
      access: 'unavailable', top: ['home', 'ask-bifana', 'properties'], sections: [] }) })
    expect([...view.querySelectorAll('nav[aria-label="Main"] a')].map((link) => link.textContent))
      .toEqual(['Home', 'Ask Bifana', 'Properties'])
    expect(view.textContent).toContain("Sections didn't load · Retry")
  })

  it('shows team rows icon-only, without arrows, on the collapsed rail', async () => {
    const view = await renderSidebar({ collapsed: true, sidebar: MONICA })
    const finance = view.querySelector<HTMLAnchorElement>('a[href="/finance"]')
    expect(finance?.textContent).toBe('')
    expect(finance?.getAttribute('title')).toBe('Finance')
    expect(view.querySelector('button[aria-label$="Finance pages"]')).toBeNull()
  })

  it('keeps Connections reachable when no route has reported status', async () => {
    const view = await renderSidebar()
    const link = view.querySelector<HTMLAnchorElement>('a[href="/connections"]')
    expect(link?.getAttribute('aria-label')).toBe('Connections · Status unknown')
  })

  it('counts only live connections in the compact summary', async () => {
    const rows: RailConnection[] = [
      { id: 'hostaway', name: 'Hostaway', state: 'live', detail: 'Live' },
      { id: 'notion', name: 'Notion', state: 'off', detail: 'Not connected' },
      { id: 'salesforce', name: 'Salesforce', state: 'partial', detail: 'Needs access' },
      { id: 'slack', name: 'Slack', state: 'live', detail: 'Live' },
      { id: 'drive', name: 'Drive', state: 'live', detail: 'Live' },
      { id: 'mews', name: 'Mews', state: 'live', detail: 'Live' },
      { id: 'infraspeak', name: 'Infraspeak', state: 'live', detail: 'Live' },
    ]
    const view = await renderSidebar({ rows })
    const link = view.querySelector<HTMLAnchorElement>('a[href="/connections"]')
    expect(link?.getAttribute('aria-label')).toBe('Connections · 5 connected')
    expect(link?.textContent).toContain('Connections · 5 connected')
    expect(link?.textContent).not.toContain('Notion')
  })

  it('keeps an empty terminal report distinct from zero connected', async () => {
    const view = await renderSidebar({ rows: [] })
    expect(view.querySelector('a[href="/connections"]')?.getAttribute('aria-label'))
      .toBe('Connections · Unavailable')
  })

  it('keeps the compact Connections link labeled when collapsed', async () => {
    const view = await renderSidebar({
      collapsed: true,
      rows: [{ id: 'hostaway', name: 'Hostaway', state: 'live', detail: 'Live' }],
    })
    const link = view.querySelector<HTMLAnchorElement>('a[href="/connections"]')
    expect(link?.textContent).toBe('')
    expect(link?.getAttribute('aria-label')).toBe('Connections · 1 connected')
    expect(link?.getAttribute('title')).toBe('Connections · 1 connected')
  })
})
