import { useQuery, UseQueryOptions } from "@tanstack/react-query"
import { useMemo } from "react"
import { Trip } from "@nasti/common/types"
import { supabase } from "@nasti/common/supabase"
import { useDebounce } from "@uidotdev/usehooks"

interface TripsSearchParams {
  search?: string
  pageParam?: number
  pageSize?: number
}

interface TripsSearchPage {
  trips: Trip[]
  nextPage: number | undefined
  totalCount: number
}

const searchTrips = async ({
  search,
  pageParam = 1,
  pageSize = 20,
}: TripsSearchParams): Promise<TripsSearchPage> => {
  const from = (pageParam - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from("trip")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })

  // Apply search filters if search term exists
  if (search?.trim()) {
    query = query.or(`name.ilike.%${search}%,location_name.ilike.%${search}%`)
  }

  // Apply pagination
  query = query.range(from, to)

  const { data: trips, error, count } = await query

  if (error) throw new Error(error.message)

  const totalCount = count || 0
  const hasNextPage = to < totalCount - 1
  const nextPage = hasNextPage ? pageParam + 1 : undefined

  return {
    trips: trips as Trip[],
    nextPage,
    totalCount,
  }
}

export const getTripsSearchQueryOptions = (
  search: string = "",
  pageSize: number = 20,
  page: number = 1,
): UseQueryOptions<TripsSearchPage> => ({
  queryKey: ["trips", "search", search, page, pageSize],
  queryFn: () => searchTrips({ search, pageParam: page, pageSize }),
  placeholderData: (previousData) => previousData,
})

interface UseTripsSearchOptions {
  search: string
  pageSize?: number
  page?: number
  debounceMs?: number
}

export const useTripsSearch = ({
  search,
  pageSize = 20,
  page = 1,
  debounceMs = 300,
}: UseTripsSearchOptions) => {
  // Debounce the search term
  const debouncedSearch = useDebounce(search, debounceMs)
  const qOptions = getTripsSearchQueryOptions(debouncedSearch, pageSize, page)

  const { data, isLoading, isError, error, isPending, isFetching, refetch } =
    useQuery(qOptions)

  // Flatten all pages into a single array
  const trips = data?.trips || []

  // Get total count from the first page
  const { totalPages, totalCount } = useMemo(() => {
    const totalCount = data?.totalCount || 0
    return {
      totalPages: Math.ceil(totalCount / pageSize),
      totalCount,
    }
  }, [data?.totalCount, pageSize])

  return {
    trips,
    isLoading,
    isError,
    error,
    isPending,
    isFetching,
    refetch,
    // Convenience properties
    totalCount,
    totalPages,
    isSearching: Boolean(debouncedSearch.trim()),
    isEmpty: !isLoading && trips.length === 0,
    canLoadMore: totalPages > page,
  }
}
