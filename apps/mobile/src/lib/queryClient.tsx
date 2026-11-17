import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
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

export const NastiQueryClientProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  useEffect(() => {
    const onOnline = () => {
      void queryClient.resumePausedMutations()
    }

    window.addEventListener("online", onOnline)
    return () => window.removeEventListener("online", onOnline)
  }, [])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
