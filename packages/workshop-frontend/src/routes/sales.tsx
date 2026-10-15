import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/sales')({
  component: () => <LisbeyondRoutePage route="sales" title="Sales" />,
})
