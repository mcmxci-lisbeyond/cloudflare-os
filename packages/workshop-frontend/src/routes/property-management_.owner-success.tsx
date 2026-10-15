import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/property-management_/owner-success')({
  component: () => <LisbeyondRoutePage route="property-management/owner-success" title="Owner & Property Success" />,
})
