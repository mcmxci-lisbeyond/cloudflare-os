import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/property-management_/guest-success')({
  component: () => <LisbeyondRoutePage route="property-management/guest-success" title="Guest Success" />,
})
