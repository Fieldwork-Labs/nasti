import {
  PendingCollectionAudio,
  PendingScoutingNoteAudio,
} from "@/hooks/useAudiosMutate"
import { CollectionAudio, ScoutingNoteAudio } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { cn } from "@nasti/ui/utils"
import { PencilIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { AudioPlayer } from "./AudioPlayer"

export type ExistingAudio =
  | CollectionAudio
  | PendingCollectionAudio
  | ScoutingNoteAudio
  | PendingScoutingNoteAudio

type AudioRowProps = {
  audio: ExistingAudio
  onRemove: (id: string) => void
  onUpdateCaption?: (id: string, caption: string) => void
}

function AudioRow({ audio, onRemove, onUpdateCaption }: AudioRowProps) {
  const [isUpdatingCaption, setIsUpdatingCaption] = useState(false)

  const { register, handleSubmit } = useForm<{ caption: string }>({
    defaultValues: { caption: audio.caption ?? "" },
    mode: "onChange",
  })

  const submit = useCallback(
    ({ caption }: { caption: string }) => {
      if (!onUpdateCaption) return
      onUpdateCaption(audio.id, caption ?? "")
      setIsUpdatingCaption(false)
    },
    [onUpdateCaption, audio.id],
  )

  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <div className="flex items-start gap-2">
        <AudioPlayer
          id={audio.id}
          url={audio.url}
          mimeType={audio.mime_type}
          caption={audio.caption}
          durationMs={audio.duration_ms}
          className="flex-1"
        />
        <Button
          variant="ghost"
          onClick={() => onRemove(audio.id)}
          className="h-7 shrink-0 rounded-full border p-1"
        >
          &times;
        </Button>
      </div>
      {isUpdatingCaption ? (
        <div className="space-y-1">
          <Input
            {...register("caption")}
            placeholder="Enter caption"
            className="h-6 text-xs"
            autoFocus
            autoComplete="off"
          />
          <div className="flex justify-between">
            <Button
              className="h-6 text-xs"
              size="sm"
              variant="secondary"
              onClick={() => setIsUpdatingCaption(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 text-xs"
              variant="default"
              onClick={handleSubmit(submit)}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="flex w-full justify-between px-1"
          onClick={() => setIsUpdatingCaption(true)}
        >
          {!audio.caption ? (
            <span className="text-muted-foreground">Add caption</span>
          ) : (
            <span>{audio.caption}</span>
          )}
          <PencilIcon height={16} width={16} />
        </Button>
      )}
    </div>
  )
}

type AudiosEditFieldProps = {
  existingAudios: Array<ExistingAudio>
  onAudiosChange: (audios: Array<ExistingAudio>) => void
  className?: string
}

export const AudiosEditField = ({
  existingAudios,
  onAudiosChange,
  className,
}: AudiosEditFieldProps) => {
  const [audios, setAudios] = useState<Array<ExistingAudio>>(existingAudios)

  useEffect(() => {
    onAudiosChange?.(audios)
  }, [audios])

  const removeAudio = useCallback((id: string) => {
    setAudios((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const handleUpdateCaption = useCallback((id: string, caption: string) => {
    setAudios((prev) =>
      prev.map((a) => (a.id === id ? { ...a, caption } : a)),
    )
  }, [])

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {audios.map((audio) => (
        <AudioRow
          key={audio.id}
          audio={audio}
          onRemove={() => removeAudio(audio.id)}
          onUpdateCaption={handleUpdateCaption}
        />
      ))}
    </div>
  )
}
