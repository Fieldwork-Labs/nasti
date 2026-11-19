import { createFileRoute } from "@tanstack/react-router"

import { TransferPage } from "./-components/transfer"

export const Route = createFileRoute("/_private/inventory/transfer")({
  component: TransferPage,
})
