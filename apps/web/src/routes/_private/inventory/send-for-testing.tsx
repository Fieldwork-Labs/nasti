import { createFileRoute } from "@tanstack/react-router"

import { SendForTestingPage } from "./-components/send-for-testing"

export const Route = createFileRoute("/_private/inventory/send-for-testing")({
  component: SendForTestingPage,
})
