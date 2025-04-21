import { useALASpeciesImage } from "@nasti/common/hooks"
import { CollectionPhotoSignedUrl, Species } from "@nasti/common/types"
import { LeafIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { useCollectionPhotos } from "@/hooks/useCollectionPhotos"
import { PendingCollectionPhoto } from "@/hooks/useCollectionPhotosMutate"
import { getFile } from "@/lib/persistFiles"
import "mapbox-gl/dist/mapbox-gl.css"

const existingPhotoTypeGuard = (
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto | null,
): photo is CollectionPhotoSignedUrl =>
  Boolean(photo && "signedUrl" in photo && photo.signedUrl)

// Create a cache to store promises by photo ID to prevent re-rendering issues
type PhotoPromiseCache = {
  promise: Promise<string | null>
  status: string
  url: string | null
}
const photoPromiseCache = new Map<string, PhotoPromiseCache>()

export const getPhotoUrl = ({
  photo,
  fallbackImage,
}: {
  photo?: CollectionPhotoSignedUrl | PendingCollectionPhoto
  fallbackImage: string | null | undefined
}) => {
  // For existing photos or fallbacks, return immediately
  if (!photo) {
    if (fallbackImage) return { read: () => fallbackImage }
    else return { read: () => null }
  } else if (existingPhotoTypeGuard(photo)) {
    return { read: () => photo.signedUrl }
  }

  // For IndexedDB photos, use our cache
  const photoId = photo.id

  // Check if we already have this photo in our cache
  if (!photoPromiseCache.has(photoId)) {
    let resolvePromise: (value: string | null) => void = () => {}
    // Create a promise that we can resolve later
    const promise = new Promise<string | null>((resolve) => {
      resolvePromise = resolve
    })

    // Store both the promise and its status in our cache
    const cache: PhotoPromiseCache = {
      promise,
      status: "pending",
      url: null,
    }

    photoPromiseCache.set(photoId, cache)

    // Start loading asynchronously
    ;(async () => {
      try {
        const file = await getFile(photoId)
        if (!file) throw new Error("Photo file not found")

        const objectUrl = URL.createObjectURL(file)

        // Update our cache and resolve the promise
        cache.url = objectUrl
        cache.status = "success"
        resolvePromise(objectUrl)
      } catch (e) {
        // Fall back to image if available
        const fallback = fallbackImage ?? null
        cache.url = fallback
        cache.status = "error"
        resolvePromise(fallback)
      }
    })()
  }

  // Get our cached item
  const cachedItem = photoPromiseCache.get(photoId)

  return {
    read() {
      if (!cachedItem) return null
      if (cachedItem.status === "pending") {
        throw cachedItem.promise
      }
      return cachedItem.url
    },
  }
}

export const CollectionPhoto = ({
  photo,
  species,
  tripId,
  onClick,
}: {
  photo: CollectionPhotoSignedUrl | PendingCollectionPhoto
  onClick: (photoUrl: string) => void
  tripId?: string
  species?: Species | null
}) => {
  const fallbackImage = useALASpeciesImage({ guid: species?.ala_guid })
  const collPhoto = getPhotoUrl({ photo, fallbackImage }).read()
  const { refreshSignedUrl } = useCollectionPhotos({ id: tripId })

  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  useEffect(() => {
    setPhotoUrl(collPhoto)
  }, [collPhoto])

  const existingPhoto = useMemo(() => {
    const isExistingPhoto = existingPhotoTypeGuard(photo)
    if (isExistingPhoto) return photo
  }, [photo])

  useEffect(() => {
    // if existing photo but does not have a signedUrl, refresh it
    if (existingPhoto && !existingPhoto.signedUrl) {
      refreshSignedUrl(existingPhoto.url)
    }
  }, [existingPhoto, refreshSignedUrl])

  const checkSignedUrl = useCallback(async () => {
    if (!existingPhoto) return
    try {
      const result = await fetch(existingPhoto.signedUrl, {
        headers: { Accept: "application/json" },
      })
      const json = await result.json()
      return json
    } catch (e) {
      return null
    }
  }, [existingPhoto])

  const handleError = useCallback(
    async (e: React.ChangeEvent<HTMLImageElement>) => {
      e.preventDefault()
      if (!existingPhoto) return
      // check if photo needs to be refreshSignedUrled
      const errorJson = await checkSignedUrl()
      if (errorJson?.error === "InvalidJWT") {
        refreshSignedUrl(existingPhoto.url)
      } else {
        setPhotoUrl(null)
      }
    },
    [existingPhoto, refreshSignedUrl, checkSignedUrl],
  )

  return (
    <span className="flex content-center justify-center">
      {photoUrl && (
        <span className="flex flex-col gap-1">
          <img
            src={photoUrl}
            onError={handleError}
            alt={`${species?.name} Image`}
            onClick={() => onClick(photoUrl)}
            className="aspect-square object-cover text-sm"
          />
          {photo.caption && <span className="text-sm">{photo.caption}</span>}
        </span>
      )}
      {!photoUrl && (
        <span className="flex aspect-square w-full items-center justify-center bg-slate-500">
          <LeafIcon className="h-8 w-8" />
        </span>
      )}
    </span>
  )
}
