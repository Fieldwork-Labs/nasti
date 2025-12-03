import {
  useBatchesByFilter,
  invalidateBatchesByFilterCache,
} from "@/hooks/useBatches"
import { BatchStatus } from "@/components/inventory/BatchInventoryFilters"
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
  data: ReturnType<typeof useBatchesByFilter>["data"]
  isLoading: ReturnType<typeof useBatchesByFilter>["isLoading"]
  error: ReturnType<typeof useBatchesByFilter>["error"]
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

  const batchData = useBatchesByFilter(batchFilter)

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

  const invalidateBatchesCacheByFilter = useCallback(() => {
    invalidateBatchesByFilterCache(batchFilter)
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
      ...batchData,
      handleSort,
      sortDirection,
      sortField,
      filters,
      handleFiltersChange,
      invalidateBatchesCacheByFilter,
    }),
    [
      batchData,
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
