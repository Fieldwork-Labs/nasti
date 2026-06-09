import {
  useQuery as usePowerSyncQuery,
  useSuspenseQuery as usePowerSyncSuspenseQuery,
} from "@powersync/tanstack-react-query"
import type { QuerySyncStreamOptions } from "@powersync/react"
import {
  type DefaultError,
  QueryClient,
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
} from "@tanstack/react-query"

type CompilableQuery<T> = {
  execute(): Promise<T[]>
  compile(): {
    readonly sql: string
    readonly parameters: ReadonlyArray<unknown>
  }
}

type PowerSyncQueryOptions<T> = {
  query?: string | CompilableQuery<T>
  parameters?: unknown[]
  streams?: QuerySyncStreamOptions[]
}

type UseBaseQueryOptions<TQueryOptions> = TQueryOptions &
  PowerSyncQueryOptions<unknown>

export const powerSyncQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: Infinity,
      retry: false,
      gcTime: Infinity,
    },
  },
})

export function useQuery<TData = unknown, TError = DefaultError>(
  options: UseBaseQueryOptions<UseQueryOptions<TData, TError>> & {
    query?: undefined
  },
): UseQueryResult<TData, TError>

export function useQuery<TData = unknown, TError = DefaultError>(
  options: UseBaseQueryOptions<UseQueryOptions<TData[], TError>> & {
    query: string | CompilableQuery<TData>
  },
): UseQueryResult<TData[], TError>

export function useQuery<TData = unknown, TError = DefaultError>(
  options: UseBaseQueryOptions<
    UseQueryOptions<TData, TError> | UseQueryOptions<TData[], TError>
  >,
): UseQueryResult<TData, TError> | UseQueryResult<TData[], TError> {
  return usePowerSyncQuery<TData, TError>(
    options as Parameters<typeof usePowerSyncQuery<TData, TError>>[0],
    powerSyncQueryClient,
  )
}

export function useSuspenseQuery<TData = unknown, TError = DefaultError>(
  options: UseBaseQueryOptions<UseSuspenseQueryOptions<TData, TError>> & {
    query?: undefined
  },
): UseSuspenseQueryResult<TData, TError>

export function useSuspenseQuery<TData = unknown, TError = DefaultError>(
  options: UseBaseQueryOptions<UseSuspenseQueryOptions<TData[], TError>> & {
    query: string | CompilableQuery<TData>
  },
): UseSuspenseQueryResult<TData[], TError>

export function useSuspenseQuery<TData = unknown, TError = DefaultError>(
  options: UseBaseQueryOptions<
    | UseSuspenseQueryOptions<TData, TError>
    | UseSuspenseQueryOptions<TData[], TError>
  >,
):
  | UseSuspenseQueryResult<TData, TError>
  | UseSuspenseQueryResult<TData[], TError> {
  return usePowerSyncSuspenseQuery<TData, TError>(
    options as Parameters<typeof usePowerSyncSuspenseQuery<TData, TError>>[0],
    powerSyncQueryClient,
  )
}
