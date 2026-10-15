// LIS-307 failure 13: bookmarks and Slack links to the pre-team routes keep working.
import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route as Portfolio } from './portfolio'
import { Route as BusinessPulse } from './portfolio_.business-pulse'
import { Route as PortfolioNewLeads } from './portfolio_.new-leads'
import { Route as Revenue } from './portfolio_.revenue-management'
import { Route as Onboarding } from './onboarding'
import { Route as Workflows } from './workflows'

type BeforeLoad = (context: { search: Record<string, unknown> }) => unknown

function redirectOf(route: { options: { beforeLoad?: unknown } }, search: Record<string, unknown> = {}) {
  try {
    (route.options.beforeLoad as BeforeLoad)({ search })
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options
    throw thrown
  }
  return null
}

describe('legacy route redirects', () => {
  it('sends the bare Portfolio page Home, since its first tab differed per person', () => {
    expect(redirectOf(Portfolio)).toMatchObject({ to: '/', replace: true })
  })

  it('sends the old Portfolio tools and Onboarding to their team sections, keeping the query', () => {
    for (const [route, to] of [
      [BusinessPulse, '/management/business-pulse'],
      [PortfolioNewLeads, '/sales/new-leads'],
      [Revenue, '/property-management/revenue-management'],
      [Onboarding, '/upkeep/onboarding'],
    ] as const) {
      expect(redirectOf(route)).toMatchObject({ to, search: true, replace: true })
    }
  })

  it('moves an invoice-workspace link to Finance › Invoices with its tab, status and item', () => {
    expect(redirectOf(Workflows, {
      workflow: 'renovations-invoice-intake', tab: 'payments', status: 'to_review', item: 'invoice-a',
    })).toMatchObject({ to: '/finance/invoices', search: { tab: 'payments', status: 'to_review', item: 'invoice-a' } })
  })

  it('leaves every other workflow link on the Workflows page', () => {
    expect(redirectOf(Workflows, { workflow: 'hostaway-booking-alerts', tab: 'overview' })).toBeNull()
    expect(redirectOf(Workflows, {})).toBeNull()
  })
})
