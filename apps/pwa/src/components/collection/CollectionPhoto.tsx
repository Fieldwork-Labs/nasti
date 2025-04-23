import { useALASpeciesImage } from "@nasti/common/hooks"
import { CollectionPhotoSignedUrl, Species } from "@nasti/common/types"
import { LeafIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { useCollectionPhotosForTrip } from "@/hooks/useCollectionPhotosForTrip"
import { PendingCollectionPhoto } from "@/hooks/useCollectionPhotosMutate"
import { getFile } from "@/lib/persistFiles"
import { Spinner } from "@nasti/ui/spinner"
import { useCollectionPhoto } from "@/hooks/useCollectionPhoto"

export function usePhotoUrl(
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | undefined | null,
  fallback?: string | null,
) {
  const [state, setState] = useState<{
    url: string | null
    status: "idle" | "loading" | "success" | "error"
  }>({ url: null, status: "idle" })

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!photo) {
        setState({ url: fallback ?? null, status: "success" })
        return
      }
      if (isRemotePhoto(photo)) {
        setState({ url: photo.signedUrl, status: "success" })
        return
      } else {
      }

      setState((s) => ({ ...s, status: "loading" }))

      try {
        const file = await getFile(photo.id)
        if (!file) throw new Error("not found")
        const objectUrl = URL.createObjectURL(file)
        if (!cancelled) setState({ url: objectUrl, status: "success" })

        return () => URL.revokeObjectURL(objectUrl)
      } catch {
        if (!cancelled) setState({ url: fallback ?? null, status: "error" })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [photo, fallback])

  return state
}

const isRemotePhoto = (
  p: CollectionPhotoSignedUrl | PendingCollectionPhoto | null | undefined,
): p is CollectionPhotoSignedUrl => Boolean(p && "signedUrl" in p)

export function useRefreshableSignedUrl(
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | null | undefined,
  tripId?: string,
) {
  const { refreshSignedUrl } = useCollectionPhotosForTrip({ tripId })

  /* 1. Ping the signedUrl to see whether the token is still valid */
  const isExpired = useCallback(async (signedUrl?: string | null) => {
    if (!signedUrl) return false

    try {
      const res = await fetch(signedUrl, {
        headers: { Accept: "application/json" },
      })
      if (res.ok) return false

      const json = await res.json().catch(() => ({}))
      return json?.error === "InvalidJWT"
    } catch {
      return true
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!isRemotePhoto(photo)) return
    await refreshSignedUrl(photo.url)
  }, [photo, refreshSignedUrl])

  const checkAndRefresh = useCallback(async () => {
    if (isRemotePhoto(photo)) {
      if (await isExpired(photo.signedUrl)) {
        await refresh()
      }
    }
  }, [isExpired, photo, refresh])

  return { checkAndRefresh }
}

type Props = {
  id: string
  onClick: (url: string) => void
  tripId?: string
  species?: Species | null
}

export function CollectionPhoto({ id, onClick, tripId, species }: Props) {
  const photo = useCollectionPhoto({ id })
  const fallback = useALASpeciesImage({ guid: species?.ala_guid })
  const { url, status } = usePhotoUrl(photo, fallback) // status: 'loading' | 'success' | 'error'

  const { checkAndRefresh } = useRefreshableSignedUrl(
    isRemotePhoto(photo) ? photo : null,
    tripId,
  )

  const handleError = useCallback(() => {
    if (isRemotePhoto(photo)) {
      checkAndRefresh()
    }
  }, [checkAndRefresh, photo])

  return (
    <span className="flex w-full flex-col items-start gap-1">
      {/* Image area ----------------------------------------------------------- */}
      {status === "loading" ? (
        <span className="flex aspect-square w-full items-center justify-center bg-slate-500">
          <Spinner className="h-8 w-8" />
        </span>
      ) : status === "success" && url ? (
        <img
          src={url}
          alt={species?.name || "collection photo"}
          onError={handleError}
          onClick={() => onClick(url)}
          className="aspect-square w-full cursor-pointer object-cover"
          role="button"
          tabIndex={0}
        />
      ) : (
        /* status === "error" OR no url --------------------------------------- */
        <span className="flex aspect-square w-full items-center justify-center bg-slate-500">
          <LeafIcon className="h-8 w-8" />
        </span>
      )}

      {/* Optional caption ----------------------------------------------------- */}
      {photo && "caption" in photo && photo.caption && status === "success" && (
        <div className="text-sm">{photo.caption}</div>
      )}
    </span>
  )
}
