import { QueryClient } from "@tanstack/react-query"
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client"
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister"
import { useEffect } from "react"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      staleTime: Infinity,
      retry: false,
      gcTime: Infinity,
    },
  },
})

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
  key: "nasti-persist-data",
})

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
      persistOptions={{ persister }}
      client={queryClient}
      onSuccess={() => {
        queryClient.resumePausedMutations()
      }}
    >
      {children}
    </PersistQueryClientProvider>
  )
}
