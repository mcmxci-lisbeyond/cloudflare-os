// @vitest-environment jsdom
/* eslint-disable react/react-in-jsx-scope */
// LIS-307 review: the app frame's host session depends on `reportSidebar`. If the callback changes
// when the late `whoami` answer arrives, the session is torn down and the frame goes deaf.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseGatekeeperAppSidebar, type GatekeeperAppSidebar } from '../../gatekeeperAppNavigation'

let currentUserId: string | null = null
vi.mock('../../AuthContext', () => ({
  useOptionalAuthenticatedApi: () => ({ currentUser: currentUserId ? { id: currentUserId } : null }),
}))
const { RailSidebarProvider, useRailSidebar } = await import('./railSidebarContext')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MONICA = parseGatekeeperAppSidebar({ access: 'active', top: ['home'], sections: [{ id: 'finance', items: [], open: true }] })
const seen: Array<{ report: (sidebar: GatekeeperAppSidebar) => void; sidebar: GatekeeperAppSidebar | null }> = []
function Probe() {
  const { reportSidebar, sidebar } = useRailSidebar()
  seen.push({ report: reportSidebar, sidebar })
  return null
}

let root: Root | undefined
let store: Map<string, string>
beforeEach(() => {
  seen.length = 0
  currentUserId = null
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
  })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  await act(async () => root?.unmount())
  vi.unstubAllGlobals()
})
const render = () => act(async () => root!.render(<RailSidebarProvider><Probe /></RailSidebarProvider>))

describe('rail sidebar store', () => {
  it('keeps one reportSidebar across the late sign-in lookup, and caches an early report for that user', async () => {
    await render()
    const first = seen.at(-1)!.report
    await act(async () => first(MONICA))
    currentUserId = 'monica'
    await render()
    expect(seen.at(-1)!.report).toBe(first)
    expect(JSON.parse(store.get('lb-rail-sidebar-v1:monica')!)).toMatchObject({ access: 'active' })
  })

  it("never shows the previous person's sections after a different sign-in, nor a non-active cache", async () => {
    store.set('lb-rail-sidebar-v1:rita', JSON.stringify({ access: 'pending', top: ['home'], sections: [] }))
    currentUserId = 'monica'
    await render()
    await act(async () => seen.at(-1)!.report(MONICA))
    expect(seen.at(-1)!.sidebar?.sections.map(section => section.id)).toEqual(['finance'])
    currentUserId = 'rita'
    await render()
    expect(seen.at(-1)!.sidebar).toBeNull()
  })
})
