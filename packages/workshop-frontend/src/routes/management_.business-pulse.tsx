import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/management_/business-pulse')({
  component: () => <LisbeyondRoutePage route="management/business-pulse" title="Weekly Business Pulse" />,
})
