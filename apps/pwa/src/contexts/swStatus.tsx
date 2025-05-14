import { createContext, useContext, useState } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

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

const registerPeriodicSync = (
  period: number,
  swUrl: string,
  r: ServiceWorkerRegistration,
) => {
  if (period <= 0) return

  setInterval(async () => {
    if ("onLine" in navigator && !navigator.onLine) return

    const resp = await fetch(swUrl, {
      cache: "no-store",
      headers: {
        cache: "no-store",
        "cache-control": "no-cache",
      },
    })

    if (resp?.status === 200) await r.update()
  }, period)
}

export function SwStatusProvider({
  children,
  ...props
}: SwStatusProviderProps) {
  const [ignoreUpdate, setIgnoreUpdate] = useState(false)

  const period = 60 * 5 * 1000 // 5 minutes

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      if (period <= 0) return
      if (r?.active?.state === "activated") {
        registerPeriodicSync(period, swUrl, r)
      } else if (r?.installing) {
        r.installing.addEventListener("statechange", (e) => {
          const sw = e.target as ServiceWorker
          console.log("statechange", { state: sw.state, something: "changed" })
          if (sw.state === "activated") registerPeriodicSync(period, swUrl, r)
        })
      }
    },
  })

  return (
    <SwStatusProviderContext.Provider
      {...props}
      value={{
        offlineReady: Boolean(navigator.serviceWorker.controller),
        ignoreUpdate,
        setIgnoreUpdate,
        updateAvailable: needRefresh,
        updateServiceWorker,
      }}
    >
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
