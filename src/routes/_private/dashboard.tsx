import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_private/dashboard')({
  component: () => <div>Hello /_private/dashboard!</div>,
})
