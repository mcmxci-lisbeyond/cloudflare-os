// @vitest-environment jsdom
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { expect, it } from 'vitest'
import { Route as portfolioLeadsRoute } from './routes/portfolio_.new-leads'

// LIS-307: New Leads lives in the Sales section; old Portfolio links land there.
it('resolves old Portfolio New Leads links to Sales while retaining their search and fragment', async () => {
  const root = createRootRoute()
  const legacy = createRoute({
    getParentRoute: () => root,
    path: '/portfolio/new-leads',
    beforeLoad: portfolioLeadsRoute.options.beforeLoad,
  })
  const target = createRoute({ getParentRoute: () => root, path: '/sales/new-leads' })
  const router = createRouter({
    routeTree: root.addChildren([legacy, target]),
    history: createMemoryHistory({ initialEntries: ['/portfolio/new-leads?view=changes#latest'] }),
  })
  await router.load()
  expect(router.state.location.pathname).toBe('/sales/new-leads')
  expect(router.state.location.search).toEqual({ view: 'changes' })
  expect(router.state.location.hash).toBe('latest')
})
