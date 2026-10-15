import { createFileRoute } from '@tanstack/react-router'
import { parseWorkflowRouteState } from '../gatekeeperAppNavigation'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/finance')({
  validateSearch: parseWorkflowRouteState,
  component: () => <LisbeyondRoutePage route="finance" title="Finance" />,
})
