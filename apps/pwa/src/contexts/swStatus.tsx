import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"
import { registerSW } from "virtual:pwa-register"

type SwStatusProviderProps = {
  children: React.ReactNode
}

type SwStatusProviderState = {
  offlineReady: boolean
  updateAvailable: boolean
  updateServiceWorker: () => Promise<void>
  ignoreUpdate: boolean
  setIgnoreUpdate: (ignore: boolean) => void
}

const initialState: SwStatusProviderState = {
  offlineReady: false,
  updateAvailable: false,
  updateServiceWorker: () => Promise.resolve(),
  ignoreUpdate: false,
  setIgnoreUpdate: (_: boolean) => {},
}

const SwStatusProviderContext =
  createContext<SwStatusProviderState>(initialState)

export function SwStatusProvider({
  children,
  ...props
}: SwStatusProviderProps) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [registration, setRegistration] = useState<
    ServiceWorkerRegistration | undefined
  >()
  const [ignoreUpdate, setIgnoreUpdate] = useState(false)

  useEffect(() => {
    const intervalMS = 10 * 60 * 1000 // every 10 min

    registerSW({
      onRegistered(registration) {
        // When registered, dispatch a custom event
        if (registration) {
          // Check for updates periodically
          setInterval(() => {
            registration.update().catch(console.error)
          }, intervalMS)

          // Dispatch a ready event
          window.dispatchEvent(
            new CustomEvent("sw-ready", { detail: registration }),
          )
        }
      },
      onNeedRefresh() {
        // When an update is available, dispatch a custom event
        if (!navigator.serviceWorker?.controller) return

        navigator.serviceWorker.getRegistration().then((registration) => {
          if (registration) {
            window.dispatchEvent(
              new CustomEvent("sw-updated", { detail: registration }),
            )
          }
        })
      },
      onOfflineReady() {
        window.dispatchEvent(new CustomEvent("sw-ready"))
      },
    })

    return () => {
      // Cleanup if needed
    }
  }, [])

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    // Add event listeners for the PWA lifecycle events
    const handleSWUpdated = (event: ServiceWorkerUpdateEvent) => {
      const registration = event.detail
      setRegistration(registration)
      setUpdateAvailable(true)
    }

    const handleSWReady = () => {
      setOfflineReady(true)
    }

    window.addEventListener("sw-updated", handleSWUpdated, { once: true })
    window.addEventListener("sw-ready", handleSWReady)

    // Cleanup listeners
    return () => {
      window.removeEventListener("sw-updated", handleSWUpdated)
      window.removeEventListener("sw-ready", handleSWReady)
    }
  }, [])

  const updateServiceWorker = useCallback(async () => {
    if (!registration?.waiting) return
    // Send a message to the waiting service worker to skip waiting and become active
    registration.waiting.postMessage({ type: "SKIP_WAITING" })
    setUpdateAvailable(false)
    // Reload the page to activate the new service worker
    window.location.reload()
  }, [])

  const value = {
    offlineReady,
    updateAvailable,
    updateServiceWorker,
    setIgnoreUpdate,
    ignoreUpdate,
  }

  return (
    <SwStatusProviderContext.Provider {...props} value={value}>
      {children}
    </SwStatusProviderContext.Provider>
  )
}

export const useSwStatus = () => {
  const context = useContext(SwStatusProviderContext)

  if (context === undefined)
    throw new Error("useSwStatus must be used within a SwStatusProvider")

  return context
}
