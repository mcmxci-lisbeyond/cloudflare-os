import { createFileRoute, redirect } from '@tanstack/react-router'

// Revenue Management moved to Property Management (LIS-307); old links keep working.
export const Route = createFileRoute('/portfolio_/revenue-management')({
  beforeLoad: () => {
    throw redirect({ to: '/property-management/revenue-management', search: true, hash: true, replace: true })
  },
  component: () => null,
})
