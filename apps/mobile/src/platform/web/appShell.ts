import type { AppShellService } from "../types"

function isInsidePWA() {
  return window.matchMedia("(display-mode: standalone)").matches
}

function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {
    // Browser may deny this; normal app storage still works best-effort.
  })
}

export const appShell: AppShellService = {
  prepareDocument() {
    requestPersistentStorage()

    if (isInsidePWA()) {
      document.body.classList.add("pwa")
    }
  },
}
