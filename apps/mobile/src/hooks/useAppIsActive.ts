import { useEffect, useState } from "react"
import { appShell } from "@/platform"

export function useAppIsActive() {
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    let mounted = true

    void appShell.getIsActive().then((nextIsActive) => {
      if (mounted) setIsActive(nextIsActive)
    })

    const unsubscribe = appShell.onActiveChange(setIsActive)

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  return isActive
}
