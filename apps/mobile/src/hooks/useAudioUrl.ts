import { supabase } from "@nasti/common/supabase"
import { getAudio, subscribeToAudio } from "@/lib/persistAudio"
import { useEffect, useRef, useState } from "react"

type AudioUrlState = {
  data: string | null
  status: "pending" | "success" | "error"
  error: Error | null
}

// Audio streams over a longer playback session than a photo download, and the
// user may seek later, so use a longer-lived signed URL than the photo window.
// `refresh()` regenerates it if it expires mid-playback (see AudioPlayer).
const SIGNED_URL_EXPIRES_IN = 60 * 60 // 1 hour

/**
 * Resolves a playable audio URL on demand:
 *   1. Local blob in `audio-store` (originating device) → Blob URL.
 *   2. Otherwise → a freshly-signed Supabase Storage URL, streamed by `<audio>`.
 *
 * No background pre-fetching. Recordings from other devices are only fetched
 * when this hook runs for a recording the user is actually viewing/playing.
 */
export const useAudioUrl = ({
  audioId,
  url,
}: {
  audioId?: string
  url?: string
}) => {
  const [state, setState] = useState<AudioUrlState>({
    data: null,
    status: audioId ? "pending" : "success",
    error: null,
  })
  const objectUrlRef = useRef<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      if (!audioId) {
        setState({ data: null, status: "success", error: null })
        return
      }

      setState((prev) => ({
        ...prev,
        status: prev.data ? "success" : "pending",
        error: null,
      }))

      // 1. Prefer local blob (originating device).
      try {
        const record = await getAudio(audioId)
        if (cancelled) return
        if (record) {
          revokeObjectUrl()
          const objectUrl = URL.createObjectURL(record.blob)
          objectUrlRef.current = objectUrl
          setState({ data: objectUrl, status: "success", error: null })
          return
        }
      } catch {
        // Fall through to streaming.
      }

      // 2. Stream on demand via a signed Storage URL.
      if (!url) {
        setState({
          data: null,
          status: "error",
          error: new Error("No audio URL"),
        })
        return
      }
      const { data, error } = await supabase.storage
        .from("collection-audio")
        .createSignedUrl(url, SIGNED_URL_EXPIRES_IN)
      if (cancelled) return
      if (error || !data?.signedUrl) {
        setState({
          data: null,
          status: "error",
          error: error ?? new Error("Failed to get audio URL"),
        })
        return
      }
      setState({ data: data.signedUrl, status: "success", error: null })
    }

    void resolve()

    // Re-resolve when the local blob lands (e.g. a recording saved just now).
    const unsubscribe = audioId
      ? subscribeToAudio(audioId, () => {
          void resolve()
        })
      : undefined

    return () => {
      cancelled = true
      unsubscribe?.()
      revokeObjectUrl()
    }
  }, [audioId, url, refreshNonce])

  const refresh = () => setRefreshNonce((n) => n + 1)

  return { ...state, refresh }
}
