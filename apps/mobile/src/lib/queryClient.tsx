import { dehydrate, QueryClient, type Query } from "@tanstack/react-query"
import {
  PersistQueryClientProvider,
  type PersistedClient,
} from "@tanstack/react-query-persist-client"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { useEffect } from "react"
import { ORG_MEMBERS_QUERY_KEY } from "@/lib/orgMembers"
import { OFFLINE_ACCESS_MS } from "@/lib/offlineAuth"

/**
 * Any state is persisted, not only success: a roster whose latest refresh
 * failed offline still holds the last good list, and must survive a relaunch.
 */
export const shouldPersistQuery = (query: Query) =>
  query.meta?.persisted !== false

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: Infinity,
      retry: false,
      gcTime: Infinity,
    },
    dehydrate: {
      shouldDehydrateQuery: shouldPersistQuery,
    },
  },
})

/**
 * How long a persisted cache survives between launches. Matches the offline
 * sign-in window: a user who can still sign in offline keeps the data they
 * fetched. The library default of 24 hours drops it on a multi-day trip.
 */
export const PERSISTED_CACHE_MAX_AGE_MS = OFFLINE_ACCESS_MS

export const PERSIST_KEY = "nasti-persist-data-v2"
const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: PERSIST_KEY,
})

/**
 * Writes the persisted cache now, bypassing the persister's throttle, for
 * anything that must be gone from storage before the caller moves on.
 * Same shape as persistQueryClientSave.
 */
export const persistQueryCacheNow = (client: QueryClient) => {
  const persisted: PersistedClient = {
    buster: "",
    timestamp: Date.now(),
    clientState: dehydrate(client),
  }
  window.localStorage.setItem(PERSIST_KEY, JSON.stringify(persisted))
}

/**
 * Removes the org roster (names and emails of the signed-out account's
 * organisation members) from memory and from the persisted cache.
 */
export const purgeOrgMembersCache = (client: QueryClient) => {
  client.removeQueries({ queryKey: ORG_MEMBERS_QUERY_KEY })
  try {
    persistQueryCacheNow(client)
  } catch (error) {
    // Storage full or unavailable; the throttled writer retries from the
    // cleaned cache.
    console.warn("[queryClient] Could not persist after roster purge", error)
  }
}

/**
 * Drops a roster cached under the old unscoped ["people", "list"] key. It
 * belongs to whichever account was signed in when it was saved.
 */
export const discardLegacyOrgMembersCache = (client: QueryClient) => {
  client.removeQueries({ queryKey: ORG_MEMBERS_QUERY_KEY, exact: true })
}

export const NastiPersistQueryClientProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  // resume paused mutations when online state detected
  useEffect(() => {
    const onOnline = () => {
      queryClient.resumePausedMutations()
    }

    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [])

  return (
    <PersistQueryClientProvider
      persistOptions={{ persister, maxAge: PERSISTED_CACHE_MAX_AGE_MS }}
      client={queryClient}
      onSuccess={() => {
        discardLegacyOrgMembersCache(queryClient)
        queryClient.resumePausedMutations()
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
