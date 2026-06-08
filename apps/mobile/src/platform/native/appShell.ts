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
}
