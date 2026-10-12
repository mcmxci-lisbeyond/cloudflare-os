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
  '/portfolio',
  '/sales/new-leads',
  '/ask-bifana',
  '/onboarding',
  '/workflows',
  '/connections',
] as const

let container: HTMLDivElement | undefined
let root: Root | undefined

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

function ConnectionsReporter({ rows }: { rows: RailConnection[] }) {
  const { reportConnections } = useRailConnections()
  useEffect(() => reportConnections(rows), [reportConnections, rows])
  return null
}

async function renderSidebar({
  collapsed = false,
  rows,
  onToggleCollapsed = () => {},
}: {
  collapsed?: boolean
  rows?: RailConnection[]
  onToggleCollapsed?: () => void
} = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <RailConnectionsProvider>
        {rows && <ConnectionsReporter rows={rows} />}
        <Sidebar collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
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

  it('renders six primary items and moves Connections out of primary navigation', async () => {
    const view = await renderSidebar()
    const navLinks = [...view.querySelectorAll('nav a')]
    expect(navLinks).toHaveLength(6)
    expect(navLinks.map((link) => link.textContent)).toEqual([
      'Home',
      'Properties',
      'Portfolio',
      'Ask Bifana',
      'Onboarding',
      'Workflows',
    ])
    expect(navLinks.some((link) => link.getAttribute('href') === '/connections')).toBe(false)
    expect(view.querySelector('a[href="/connections"]')?.textContent)
      .toContain('Connections · Status unknown')
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
