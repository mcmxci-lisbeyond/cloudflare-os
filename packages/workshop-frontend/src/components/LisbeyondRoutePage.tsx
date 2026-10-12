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
