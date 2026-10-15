import { createFileRoute } from '@tanstack/react-router'
import { parseWorkflowRouteState } from '../gatekeeperAppNavigation'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/renovations')({
  validateSearch: parseWorkflowRouteState,
  component: () => <LisbeyondRoutePage route="renovations" title="Renovations" />,
})
