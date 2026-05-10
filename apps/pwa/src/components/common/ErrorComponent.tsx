import { Button } from "@nasti/ui/button"
import { useState } from "react"

async function checkForUpdateAndReload() {
  if (!("serviceWorker" in navigator)) {
    location.reload()
    return
  }
  const reg = await navigator.serviceWorker.getRegistration()
  if (!reg) {
    location.reload()
    return
  }
  await reg.update().catch(() => {})
  if (reg.waiting) {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    )
    reg.waiting.postMessage({ type: "SKIP_WAITING" })
    return
  }
  location.reload()
}

type Props = {
  error: unknown
  resetError: () => void
  eventId?: string
}

export function ErrorFallback({ error, resetError, eventId }: Props) {
  const [busy, setBusy] = useState<null | "update" | "reset">(null)

  const message =
    error instanceof Error ? error.message : "Something went wrong."

  const handleUpdate = async () => {
    setBusy("update")
    await checkForUpdateAndReload()
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            The app hit an unexpected error. The error has been logged and
            Fieldwork Labs will be notified. Try one of the options below.
          </p>
        </div>

        <details className="dark:bg-muted text-muted-foreground rounded p-2 text-xs">
          <summary className="cursor-pointer">Error details</summary>
          <p className="mt-2 break-all">{message}</p>
          {eventId && <p className="mt-1 opacity-70">Event ID: {eventId}</p>}
        </details>

        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={resetError}>
            Try again
          </Button>

          <Button
            onClick={handleUpdate}
            disabled={busy !== null}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy === "update"
              ? "Checking for update…"
              : "Check for update & reload"}
          </Button>
        </div>
      </div>
    </div>
  )
}
