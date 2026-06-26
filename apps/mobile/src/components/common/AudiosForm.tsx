import { AudioRecording } from "@/platform"
import { UploadAudioVariables } from "@/hooks/useAudiosMutate"
import { cn } from "@nasti/ui/utils"
import { Button } from "@nasti/ui/button"
import { useCallback, useEffect, useState } from "react"
import { AudioRecorder } from "./AudioRecorder"
import { AudiosEditField, ExistingAudio } from "./AudiosEditField"

export type AudioChanges = {
  add: Array<UploadAudioVariables>
  keep: Array<ExistingAudio>
}

type PendingAudio = {
  id: string
  recording: AudioRecording
  previewUrl: string
}

type AudiosFormProps = {
  initialAudios?: Array<ExistingAudio>
  onAudiosChange?: (changes: AudioChanges) => void
  className?: string
}

export const AudiosForm = ({
  initialAudios = [],
  onAudiosChange,
  className,
}: AudiosFormProps) => {
  const [add, setAdd] = useState<PendingAudio[]>([])
  const [keep, setKeep] = useState<Array<ExistingAudio>>(initialAudios)

  useEffect(() => {
    onAudiosChange?.({
      add: add.map(({ id, recording }) => ({ id, ...recording })),
      keep,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [add, keep]) // don't add onAudiosChange to deps

  // Revoke pending preview URLs on unmount.
  useEffect(
    () => () => {
      add.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    },
    [add],
  )

  const handleRecorded = useCallback((recording: AudioRecording) => {
    const previewUrl = URL.createObjectURL(recording.file)
    setAdd((prev) => [
      ...prev,
      { id: crypto.randomUUID(), recording, previewUrl },
    ])
  }, [])

  const removePending = useCallback((previewUrl: string) => {
    setAdd((prev) => {
      const target = prev.find((a) => a.previewUrl === previewUrl)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.previewUrl !== previewUrl)
    })
  }, [])

  return (
    <div className={cn(className)}>
      <AudiosEditField existingAudios={keep} onAudiosChange={setKeep} />

      {add.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {add.map(({ id, previewUrl }) => (
            <div
              key={id}
              className="flex items-start gap-2 rounded-md border p-2"
            >
              <audio
                src={previewUrl}
                controls
                preload="none"
                className="flex-1"
              />
              <Button
                variant="ghost"
                onClick={() => removePending(previewUrl)}
                className="h-7 shrink-0 rounded-full border p-1"
              >
                &times;
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2">
        <AudioRecorder onRecorded={handleRecorded} />
      </div>
    </div>
  )
}
