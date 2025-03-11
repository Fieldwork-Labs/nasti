// src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      retry: false,
      gcTime: Infinity,
    },
  },
})

const persister = createSyncStoragePersister({
  storage: window.localStorage,
})

export const NastiPersistQueryClientProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <PersistQueryClientProvider
      persistOptions={{ persister }}
      client={queryClient}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
