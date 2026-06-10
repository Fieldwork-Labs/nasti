import type { AppShellService } from "../types"

function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {
    // WebView storage still persists best-effort if the request is denied.
  })
}

export const appShell: AppShellService = {
  prepareDocument() {
    requestPersistentStorage()
    document.body.classList.add("capacitor")
  },

  async getIsActive() {
    return !document.hidden
  },

  onActiveChange(callback) {
    const onVisibilityChange = () => callback(!document.hidden)
    const onPause = () => callback(false)
    const onResume = () => callback(true)

    document.addEventListener("visibilitychange", onVisibilityChange)
    document.addEventListener("pause", onPause)
    document.addEventListener("resume", onResume)

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      document.removeEventListener("pause", onPause)
      document.removeEventListener("resume", onResume)
    }
  },
}
