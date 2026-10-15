import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/property-management_/revenue-management')({
  component: () => <LisbeyondRoutePage route="property-management/revenue-management" title="Revenue Management" />,
})
