import { Outlet, useLocation } from '@tanstack/react-router'
import LisbeyondRoutePage, { type LisbeyondProductRoute } from './LisbeyondRoutePage'
import { GATEKEEPER_APP_ROUTES } from '../gatekeeperAppNavigation'

// Product routes this outlet hosts. The pre-team routes (/portfolio/*, /onboarding) are absent on
// purpose: their route files redirect to the team pages (LIS-307), so old links keep working.
const titles: Partial<Record<LisbeyondProductRoute, string>> = {
  home: 'Home', properties: 'Properties', 'sales/new-leads': 'New Leads',
  workflows: 'Workflows', connections: 'Connections', settings: 'Settings',
  'management/business-pulse': 'Weekly Business Pulse',
  finance: 'Finance', 'finance/invoices': 'Invoices', 'finance/pnl': 'P&L',
  renovations: 'Renovations', 'renovations/invoice-review': 'Invoice review',
  sales: 'Sales',
  'property-management': 'Property Management',
  'property-management/owner-success': 'Owner & Property Success',
  'property-management/guest-success': 'Guest Success',
  'property-management/revenue-management': 'Revenue Management',
  upkeep: 'Upkeep', 'upkeep/onboarding': 'Onboarding & QA',
}

/** The authenticated shell owns this instance, so sibling product routes cannot remount it. */
export default function LisbeyondRouteOutlet() {
  const { pathname } = useLocation()
  const route = (Object.keys(titles) as LisbeyondProductRoute[])
    .find(key => GATEKEEPER_APP_ROUTES[key] === pathname)
  return route ? <LisbeyondRoutePage route={route} title={titles[route]!} /> : <Outlet />
}
