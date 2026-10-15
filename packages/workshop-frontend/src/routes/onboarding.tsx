import { createFileRoute, redirect } from '@tanstack/react-router'

// Onboarding moved to Upkeep › Onboarding & QA (LIS-307); old links keep working.
export const Route = createFileRoute('/onboarding')({
  beforeLoad: () => {
    throw redirect({ to: '/upkeep/onboarding', search: true, hash: true, replace: true })
  },
  component: () => null,
})
