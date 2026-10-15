import { createFileRoute, redirect } from '@tanstack/react-router'

// Business Pulse moved to the Management section (LIS-307); old links keep working.
export const Route = createFileRoute('/portfolio_/business-pulse')({
  beforeLoad: () => {
    throw redirect({ to: '/management/business-pulse', search: true, hash: true, replace: true })
  },
  component: () => null,
})
