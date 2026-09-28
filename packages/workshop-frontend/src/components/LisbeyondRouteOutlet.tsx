import { Outlet, useLocation } from '@tanstack/react-router'
import LisbeyondRoutePage, { type LisbeyondProductRoute } from './LisbeyondRoutePage'
import { GATEKEEPER_APP_ROUTES } from '../gatekeeperAppNavigation'

const titles: Record<LisbeyondProductRoute, string> = {
  home: 'Home', properties: 'Properties', portfolio: 'Portfolio',
  'portfolio/revenue-management': 'Portfolio', 'portfolio/business-pulse': 'Portfolio',
  'portfolio/new-leads': 'Portfolio', 'sales/new-leads': 'New Leads',
  workflows: 'Workflows', connections: 'Connections', settings: 'Settings',
}

/** The authenticated shell owns this instance, so sibling product routes cannot remount it. */
export default function LisbeyondRouteOutlet() {
  const { pathname } = useLocation()
  const route = (Object.keys(titles) as LisbeyondProductRoute[])
    .find(key => GATEKEEPER_APP_ROUTES[key] === pathname)
  return route ? <LisbeyondRoutePage route={route} title={titles[route]} /> : <Outlet />
}
