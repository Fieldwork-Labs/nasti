import {
  useBatchesByFilter,
  invalidateBatchesByFilterCache,
  type BatchWithCurrentLocationAndSpecies,
} from "@/hooks/useBatches"
import {
  useAssignedBagsByFilter,
  type AssignedBag,
} from "@/hooks/useTestingOrgAssignments"
import type { InventoryStatusFilter } from "@/lib/testingAssignments"
import { BatchStatus } from "@/components/inventory/BatchInventoryFilters"
import useUserStore from "@/store/userStore"
import { queryClient } from "@nasti/common/utils"
import { getRouteApi } from "@tanstack/react-router"
import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  ReactNode,
} from "react"

export type SortField = "created_at" | "species_id" | "organisation_id"
type SortDirection = "asc" | "desc"

interface BatchFiltersContextValue {
  data: BatchWithCurrentLocationAndSpecies[] | undefined
  /**
   * Empty for General organisations. For Testing organisations it is the whole
   * list: one entry per open assignment, so two bags of one parent batch are
   * two rows. Keyed by nothing — a Map by batch id would silently drop the
   * second of them.
   */
  assignedBags: AssignedBag[]
  isLoading: boolean
  error: Error | null
  handleSort: (field: SortField) => void
  sortDirection: SortDirection
  sortField: SortField
  filters: {
    status?: BatchStatus
    speciesId: string | null
    locationId: string | null
    search: string
  }
  handleFiltersChange: (newFilters: {
    status?: BatchStatus
    speciesId?: string | null
    collectionId?: string | null
    locationId?: string | null
    search?: string
  }) => void
  invalidateBatchesCacheByFilter: () => void
}

const BatchFiltersContext = createContext<BatchFiltersContextValue | undefined>(
  undefined,
)

export const useBatchFiltersContext = () => {
  const context = useContext(BatchFiltersContext)
  if (!context) {
    throw new Error(
      "useBatchFiltersContext must be used within BatchFiltersProvider",
    )
  }
  return context
}

interface BatchFiltersProviderProps {
  children: ReactNode
}

export const BatchFiltersProvider = ({
  children,
}: BatchFiltersProviderProps) => {
  const Route = getRouteApi("/_private/inventory/")
  const searchParams = Route.useSearch()
  const navigate = Route.useNavigate()

  // Extract filters from URL search params
  const filters = useMemo(
    () => ({
      status: searchParams.status,
      speciesId: searchParams.speciesId || null,
      locationId: searchParams.locationId || null,
      search: searchParams.search || "",
    }),
    [searchParams],
  )

  // Extract sorting from URL search params
  const sortField: SortField = searchParams.sort || "created_at"
  const sortDirection: SortDirection =
    (searchParams.order as SortDirection) || "desc"

  const batchFilter = useMemo(
    () => ({
      status: filters.status,
      speciesId: filters.speciesId || undefined,
      locationId: filters.locationId || undefined,
      search: filters.search ?? "",
      sort: sortField,
      order: sortDirection,
    }),
    [filters, sortField, sortDirection],
  )

  // General organisations browse their own inventory; Testing organisations
  // see exactly what has been assigned to them and not returned. Only one of
  // the two queries runs.
  const { organisation } = useUserStore()
  const isTestingOrg = organisation?.is_testing_provider

  const assignmentFilter = useMemo(
    () => ({
      // The route validates a union of both pages' search schemas, so a
      // General status can reach this page through a hand-edited URL. Anything
      // that is not an assignment status means "no status filter".
      status:
        filters.status === "pending" || filters.status === "completed"
          ? filters.status
          : ("any" as InventoryStatusFilter),
      speciesId: filters.speciesId || undefined,
      locationId: filters.locationId || undefined,
      search: filters.search ?? "",
      sort: sortField,
      order: sortDirection,
    }),
    [filters, sortField, sortDirection],
  )

  const generalBatches = useBatchesByFilter(batchFilter, {
    enabled: !isTestingOrg,
  })
  const assignedBags = useAssignedBagsByFilter(assignmentFilter, {
    enabled: isTestingOrg,
  })

  // The two organisation types no longer look at the same thing: General sees
  // batches, Testing sees the bags it was sent. Only the loading and error
  // state is shared.
  const activeQuery = isTestingOrg ? assignedBags : generalBatches

  // Update URL search parameters
  const updateSearchParams = useCallback(
    (newParams: Record<string, string | boolean | undefined>) => {
      const updatedParams = { ...searchParams, ...newParams }
      navigate({
        from: "/inventory",
        search: updatedParams,
        replace: true,
      })
    },
    [searchParams, navigate],
  )

  // Assignment, batch, bag and test data all move together after a processing,
  // testing or return action, so refresh the lot rather than guessing which
  // key the change landed in.
  const invalidateBatchesCacheByFilter = useCallback(() => {
    invalidateBatchesByFilterCache(batchFilter)
    queryClient.invalidateQueries({ queryKey: ["assignments", "byStatus"] })
    queryClient.invalidateQueries({ queryKey: ["batches"] })
    queryClient.invalidateQueries({ queryKey: ["subBatches"] })
    queryClient.invalidateQueries({ queryKey: ["batch-assignment"] })
  }, [batchFilter])

  // Handle sorting
  const handleSort = useCallback(
    (field: SortField) => {
      const newDirection =
        sortField === field && sortDirection === "asc" ? "desc" : "asc"

      updateSearchParams({
        sort: field,
        order: newDirection,
      })
    },
    [sortField, sortDirection, updateSearchParams],
  )

  // Handle filter changes
  const handleFiltersChange = useCallback(
    (newFilters: {
      status?: BatchStatus
      speciesId?: string | null
      collectionId?: string | null
      locationId?: string | null
      search?: string
    }) => {
      // filter out undefined values from searchParams
      const definedParams: Record<string, string | boolean> =
        Object.fromEntries(
          Object.entries(searchParams).filter(
            ([_, value]) => value !== undefined && value !== "",
          ),
        )

      // replace nulls with undefined
      const finalFilters: Record<string, string | boolean | undefined> = {
        ...definedParams,
      }
      for (const [key, value] of Object.entries(newFilters)) {
        finalFilters[key] = value ?? undefined
      }
      updateSearchParams(finalFilters)
    },
    [searchParams, updateSearchParams],
  )

  const value = useMemo(
    () => ({
      data: isTestingOrg ? undefined : generalBatches.data,
      assignedBags: assignedBags.data ?? [],
      isLoading: activeQuery.isLoading,
      error: activeQuery.error,
      handleSort,
      sortDirection,
      sortField,
      filters,
      handleFiltersChange,
      invalidateBatchesCacheByFilter,
    }),
    [
      isTestingOrg,
      generalBatches.data,
      assignedBags.data,
      activeQuery.isLoading,
      activeQuery.error,
      handleSort,
      sortDirection,
      sortField,
      filters,
      handleFiltersChange,
      invalidateBatchesCacheByFilter,
    ],
  )

  return (
    <BatchFiltersContext.Provider value={value}>
      {children}
    </BatchFiltersContext.Provider>
  )
}
