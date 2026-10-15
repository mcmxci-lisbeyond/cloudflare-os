import { createFileRoute, redirect } from '@tanstack/react-router'

// New Leads moved to the Sales section (LIS-307); old links keep working.
export const Route = createFileRoute('/portfolio_/new-leads')({
  beforeLoad: () => {
    throw redirect({ to: '/sales/new-leads', search: true, hash: true, replace: true })
  },
  component: () => null,
})
