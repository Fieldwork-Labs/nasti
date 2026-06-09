import { getImage, subscribeToImage } from "@/lib/persistFiles"
import { useEffect, useState } from "react"

type PhotoUrlState = {
  data: Base64URLString | null
  status: "pending" | "success" | "error"
  error: Error | null
}

export const usePhotoUrl = ({ photoId }: { photoId?: string }) => {
  const [state, setState] = useState<PhotoUrlState>({
    data: null,
    status: photoId ? "pending" : "success",
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function loadPhoto() {
      if (!photoId) {
        setState({ data: null, status: "success", error: null })
        return
      }

      setState((prev) => ({
        ...prev,
        status: prev.data ? "success" : "pending",
        error: null,
      }))

      try {
        const imageRecord = await getImage(photoId)
        if (cancelled) return
        setState({
          data: imageRecord?.image ?? null,
          status: "success",
          error: null,
        })
      } catch (error) {
        if (cancelled) return
        setState({
          data: null,
          status: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    }

    const unsubscribe = photoId
      ? subscribeToImage(photoId, () => {
          void loadPhoto()
        })
      : undefined

    void loadPhoto()

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [photoId])

  return state
}
