import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import useUserStore from "@/store/userStore"
import {
  InventoryPageGeneral,
  inventorySearchSchemaGeneral,
} from "./-components/general"
import {
  InventoryPageTesting,
  inventorySearchSchemaTesting,
} from "./-components/testing"
import { BatchFiltersProvider } from "./-components/BatchFiltersContext"

// Define search schema for URL parameters

const RouteDecider = () => {
  const { organisation } = useUserStore()
  if (organisation?.type === "Testing") {
    return <InventoryPageTesting />
  }
  return <InventoryPageGeneral />
}

const inventorySearchSchema = z.union([
  inventorySearchSchemaGeneral,
  inventorySearchSchemaTesting,
])

export const Route = createFileRoute("/_private/inventory/")({
  component: () => (
    <BatchFiltersProvider>
      <RouteDecider />
    </BatchFiltersProvider>
  ),
  validateSearch: inventorySearchSchema,
})
