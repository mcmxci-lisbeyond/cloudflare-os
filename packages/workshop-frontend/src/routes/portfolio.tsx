import { createFileRoute, redirect } from '@tanstack/react-router'

// Portfolio's tools now live in their team sections (LIS-307). Its tabs differed per person, so an
// old bookmark goes Home rather than to a page this person may not be able to open.
export const Route = createFileRoute('/portfolio')({
  beforeLoad: () => {
    throw redirect({ to: '/', replace: true })
  },
  component: () => null,
})
