type AudioItem = {
  id: string
  signedUrl: string
  mime_type: string
  caption: string | null
  duration_ms: number | null
  uploaded_at: string | null
}

const formatAudioDuration = (durationMs: number) => {
  const totalSeconds = Math.round(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = String(totalSeconds % 60).padStart(2, "0")
  return `${minutes}:${seconds}`
}

export const AudioTab = ({ audio }: { audio: AudioItem[] }) => {
  if (audio.length === 0)
    return (
      <p className="py-4 text-center text-gray-500">
        No audio recordings added yet.
      </p>
    )

  return (
    <div className="max-h-96 space-y-3 overflow-y-auto">
      {audio.map((item) => (
        <div key={item.id} className="space-y-1 rounded-lg border p-3">
          <div className="flex justify-between gap-2 text-xs">
            <span className="flex-1">
              {item.caption || (
                <span className="text-muted-foreground italic">No caption</span>
              )}
            </span>
            {item.duration_ms !== null && (
              <span className="text-muted-foreground">
                {formatAudioDuration(item.duration_ms)}
              </span>
            )}
          </div>
          <audio controls preload="none" className="w-full">
            <source src={item.signedUrl} type={item.mime_type} />
          </audio>
          {item.uploaded_at && (
            <p className="text-muted-foreground text-xs">
              {new Date(item.uploaded_at).toLocaleString()}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
