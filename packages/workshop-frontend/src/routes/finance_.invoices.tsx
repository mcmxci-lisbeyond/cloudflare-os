import { createFileRoute } from '@tanstack/react-router'
import { parseWorkflowRouteState } from '../gatekeeperAppNavigation'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/finance_/invoices')({
  validateSearch: parseWorkflowRouteState,
  component: () => <LisbeyondRoutePage route="finance/invoices" title="Invoices" />,
})
