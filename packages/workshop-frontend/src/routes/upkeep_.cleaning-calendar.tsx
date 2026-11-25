import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/upkeep_/cleaning-calendar')({
  component: () => <LisbeyondRoutePage route="upkeep/cleaning-calendar" title="Cleaning calendar" />,
})
