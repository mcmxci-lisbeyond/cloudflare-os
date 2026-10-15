import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/upkeep_/onboarding')({
  component: () => <LisbeyondRoutePage route="upkeep/onboarding" title="Onboarding & QA" />,
})
