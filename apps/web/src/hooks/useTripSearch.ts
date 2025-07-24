import { useInfiniteQuery } from "@tanstack/react-query"
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

export const getTripsSearchInfiniteQueryOptions = (
  search: string = "",
  pageSize: number = 20,
) => ({
  queryKey: ["trips", "search", search, pageSize],
  queryFn: ({ pageParam }: { pageParam: number }) =>
    searchTrips({ search, pageParam, pageSize }),
  initialPageParam: 1,
  getNextPageParam: (lastPage: TripsSearchPage) => lastPage.nextPage,
  getPreviousPageParam: (
    firstPage: TripsSearchPage,
    allPages: TripsSearchPage[],
  ) => {
    return allPages.length > 1 ? allPages.length - 1 : undefined
  },
})

interface UseTripsSearchOptions {
  search: string
  pageSize?: number
  debounceMs?: number
}

export const useTripsSearch = ({
  search,
  pageSize = 20,
  debounceMs = 300,
}: UseTripsSearchOptions) => {
  // Debounce the search term
  const debouncedSearch = useDebounce(search, debounceMs)

  const {
    data,
    isLoading,
    isError,
    error,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery(
    getTripsSearchInfiniteQueryOptions(debouncedSearch, pageSize),
  )

  // Flatten all pages into a single array
  const trips = useMemo(() => {
    return data?.pages.flatMap((page) => page.trips) || []
  }, [data?.pages])

  // Get total count from the first page
  const totalCount = data?.pages[0]?.totalCount || 0

  return {
    trips,
    totalCount,
    hasNextPage: hasNextPage || false,
    isLoading,
    isError,
    error,
    isPending,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
    // Convenience properties
    isSearching: Boolean(debouncedSearch.trim()),
    isEmpty: !isLoading && trips.length === 0,
    canLoadMore: hasNextPage && !isFetchingNextPage,
  }
}
