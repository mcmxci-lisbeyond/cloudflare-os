import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/upkeep')({
  component: () => <LisbeyondRoutePage route="upkeep" title="Upkeep" />,
})
