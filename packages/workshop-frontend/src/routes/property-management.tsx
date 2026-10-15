import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/property-management')({
  component: () => <LisbeyondRoutePage route="property-management" title="Property Management" />,
})
