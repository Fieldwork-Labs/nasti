import { createContext, useContext } from "react"

type SwStatusProviderProps = {
  children: React.ReactNode
}

type SwStatusProviderState = {
  offlineReady: boolean
  updateAvailable: boolean
  updateServiceWorker: () => Promise<void>
  ignoreUpdate: boolean
  setIgnoreUpdate: (ignore: boolean) => void
  isUpdating: boolean
}

const initialState: SwStatusProviderState = {
  offlineReady: false,
  updateAvailable: false,
  updateServiceWorker: () => Promise.resolve(),
  ignoreUpdate: false,
  setIgnoreUpdate: (_: boolean) => {},
  isUpdating: false,
}

const SwStatusProviderContext =
  createContext<SwStatusProviderState>(initialState)

export function SwStatusProvider({
  children,
  ...props
}: SwStatusProviderProps) {
  return (
    <SwStatusProviderContext.Provider {...props} value={initialState}>
      {children}
    </SwStatusProviderContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSwStatus = () => {
  const context = useContext(SwStatusProviderContext)

  if (context === undefined)
    throw new Error("useSwStatus must be used within a SwStatusProvider")

  return context
}
