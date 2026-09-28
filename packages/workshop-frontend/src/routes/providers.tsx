import { createFileRoute } from '@tanstack/react-router'
import { useDocumentTitle } from '../useDocumentTitle'

export const Route = createFileRoute('/providers')({ component: ProvidersPage })

export function ProvidersPage() {
  useDocumentTitle('AI model')
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold text-kumo-default">AI model</h1>
      <p className="mt-4 text-kumo-default">GPT-6 Luna</p>
      <p className="mt-2 text-sm text-kumo-subtle">
        The model is managed by Lisbeyond OS for all employees.
      </p>
    </main>
  )
}
