import GatekeeperAppPage from '../GatekeeperAppPage'
import { useDocumentTitle } from '../useDocumentTitle'

const LISBEYOND_APP_ID = 'lisbeyond'

export type LisbeyondProductRoute =
  | 'home'
  | 'properties'
  | 'portfolio'
  | 'portfolio/revenue-management'
  | 'portfolio/business-pulse'
  | 'portfolio/new-leads'
  | 'sales/new-leads'
  | 'onboarding'
  | 'workflows'
  | 'connections'
  | 'settings'
  | 'management/business-pulse'
  | 'finance'
  | 'finance/invoices'
  | 'finance/pnl'
  | 'renovations'
  | 'renovations/invoice-review'
  | 'sales'
  | 'property-management'
  | 'property-management/owner-success'
  | 'property-management/guest-success'
  | 'property-management/revenue-management'
  | 'upkeep'
  | 'upkeep/onboarding'

/**
 * Hosts the wrapper-owned Lisbeyond management app at stable employee-facing routes. Cloudflare OS
 * still owns authentication, sandboxing, RPC, chat, and capabilities; the app owns the product UI.
 */
export default function LisbeyondRoutePage({ route, title }: {
  route: LisbeyondProductRoute
  title: string
}) {
  useDocumentTitle(title)
  return <GatekeeperAppPage appId={LISBEYOND_APP_ID} appRoute={route} />
}
