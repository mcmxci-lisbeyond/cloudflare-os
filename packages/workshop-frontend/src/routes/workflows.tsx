import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseWorkflowRouteState } from '../gatekeeperAppNavigation'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/workflows')({
  validateSearch: parseWorkflowRouteState,
  // The invoice workspace moved to Finance › Invoices (LIS-307). Links from Slack and bookmarks to
  // /workflows?workflow=renovations-invoice-intake&tab=… keep their tab, status and item.
  beforeLoad: ({ search }) => {
    if (search.workflow === 'renovations-invoice-intake') {
      const { workflow: _workflow, ...state } = search
      throw redirect({ to: '/finance/invoices', search: state, hash: true, replace: true })
    }
  },
  component: WorkflowsPage,
})

function WorkflowsPage() {
  return <LisbeyondRoutePage route="workflows" title="Workflows" />
}
