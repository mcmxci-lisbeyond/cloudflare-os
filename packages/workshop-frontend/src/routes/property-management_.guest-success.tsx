import { createFileRoute } from '@tanstack/react-router'
import { parseWorkflowRouteState } from '../gatekeeperAppNavigation'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/property-management_/guest-success')({
  validateSearch: parseWorkflowRouteState,
  component: () => <LisbeyondRoutePage route="property-management/guest-success" title="Guest Success" />,
})
