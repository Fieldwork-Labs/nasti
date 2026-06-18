import { useAudioUploadProgress } from "@/hooks/useAudiosMutate"
import { useAudioUrl } from "@/hooks/useAudioUrl"
import { Progress } from "@nasti/ui/progress"
import { cn } from "@nasti/ui/utils"

const formatTime = (ms?: number | null) => {
  if (!ms && ms !== 0) return null
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

type Props = {
  id: string
  url: string
  mimeType?: string
  caption?: string | null
  durationMs?: number | null
  showCaption?: boolean
  showUploadProgress?: boolean
  className?: string
}

/**
 * Plays back a single audio recording. Sources `src` from `useAudioUrl` — a
 * local Blob URL on the originating device, or a streamed signed URL elsewhere.
 */
export function AudioPlayer({
  id,
  url,
  caption,
  durationMs,
  showCaption,
  showUploadProgress,
  className,
}: Props) {
  const { data, status, error, refresh } = useAudioUrl({ audioId: id, url })
  console.log({ data, error })
  const progress = useAudioUploadProgress(id)
  const uploading = Boolean(showUploadProgress && progress && progress >= 0)

  return (
    <span className={cn("flex flex-col gap-1", className)}>
      {status === "pending" ? (
        <span className="text-muted-foreground text-sm">Loading…</span>
      ) : data ? (
        <audio
          src={data}
          controls
          preload="none"
          className="w-full"
          onError={() => refresh()}
        />
      ) : (
        <span className="text-sm text-amber-600">
          {error?.message ?? "This recording isn’t available offline."}
        </span>
      )}

      {uploading && (
        <div className="px-1">
          <Progress value={progress} className="w-full" />
        </div>
      )}

      {showCaption && status === "success" && (
        <div className="text-sm">
          {caption ? (
            caption
          ) : durationMs ? (
            <span className="text-muted-foreground">
              {formatTime(durationMs)}
            </span>
          ) : null}
        </div>
      )}
    </span>
  )
}
