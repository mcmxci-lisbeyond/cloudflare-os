import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/sales_/new-leads')({
  component: () => <LisbeyondRoutePage route="sales/new-leads" title="New Leads" />,
})
