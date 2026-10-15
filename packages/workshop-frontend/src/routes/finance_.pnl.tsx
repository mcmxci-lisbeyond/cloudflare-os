import { createFileRoute } from '@tanstack/react-router'
import LisbeyondRoutePage from '../components/LisbeyondRoutePage'

export const Route = createFileRoute('/finance_/pnl')({
  component: () => <LisbeyondRoutePage route="finance/pnl" title="P&L" />,
})
