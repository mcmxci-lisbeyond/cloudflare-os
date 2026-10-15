import { createFileRoute } from '@tanstack/react-router'
import { parseWorkflowRouteState } from '../gatekeeperAppNavigation'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/renovations_/invoice-review')({
  validateSearch: parseWorkflowRouteState,
  component: () => <LisbeyondRoutePage route="renovations/invoice-review" title="Invoice review" />,
})
