import { audio as audioService } from "@/platform"
import type { AudioRecording, AudioSession } from "@/platform"
import { Button } from "@nasti/ui/button"
import { cn } from "@nasti/ui/utils"
import { Check, Mic, Pause, Play, RotateCcw, Square, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

type RecorderStatus = "idle" | "recording" | "paused" | "preview"

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

type Props = {
  onRecorded: (recording: AudioRecording) => void
}

/**
 * Core recording UI, driven by a platform `AudioSession`.
 * States: idle → recording → paused → preview (playback + keep/discard).
 */
export function AudioRecorder({ onRecorded }: Props) {
  const sessionRef = useRef<AudioSession | null>(null)
  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [amplitude, setAmplitude] = useState(0)
  const [preview, setPreview] = useState<{
    recording: AudioRecording
    url: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  useEffect(
    () => () => {
      clearTick()
      sessionRef.current?.cancel().catch(() => {})
      sessionRef.current = null
      if (preview) URL.revokeObjectURL(preview.url)
    },
    // Only run on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const startTicker = useCallback(() => {
    clearTick()
    const start = Date.now() - elapsedMs
    tickRef.current = setInterval(async () => {
      setElapsedMs(Date.now() - start)
      try {
        const amp = await sessionRef.current?.getAmplitude()
        if (typeof amp === "number") setAmplitude(amp)
      } catch {
        // amplitude is best-effort
      }
    }, 100)
  }, [elapsedMs])

  const handleStart = useCallback(async () => {
    setError(null)
    try {
      const session = await audioService.startRecording()
      sessionRef.current = session
      setElapsedMs(0)
      setAmplitude(0)
      setStatus("recording")
      startTicker()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recording")
    }
  }, [startTicker])

  const handlePause = useCallback(async () => {
    await sessionRef.current?.pause()
    clearTick()
    setStatus("paused")
  }, [])

  const handleResume = useCallback(async () => {
    await sessionRef.current?.resume()
    setStatus("recording")
    startTicker()
  }, [startTicker])

  const handleStop = useCallback(async () => {
    clearTick()
    const recording = await sessionRef.current?.stop()
    sessionRef.current = null
    if (!recording) {
      setStatus("idle")
      return
    }
    const url = URL.createObjectURL(recording.file)
    setPreview({ recording, url })
    setElapsedMs(recording.duration_ms || elapsedMs)
    setStatus("preview")
  }, [elapsedMs])

  const handleCancel = useCallback(async () => {
    clearTick()
    await sessionRef.current?.cancel().catch(() => {})
    sessionRef.current = null
    setElapsedMs(0)
    setAmplitude(0)
    setStatus("idle")
  }, [])

  const handleRerecord = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
    setStatus("idle")
  }, [preview])

  const handleKeep = useCallback(() => {
    if (!preview) return
    onRecorded(preview.recording)
    URL.revokeObjectURL(preview.url)
    setPreview(null)
    setElapsedMs(0)
    setAmplitude(0)
    setStatus("idle")
  }, [preview, onRecorded])

  if (status === "preview" && preview) {
    return (
      <div className="flex flex-col gap-2 rounded-md border p-2">
        <audio src={preview.url} controls className="w-full" />
        <div className="flex justify-between">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRerecord}
          >
            <RotateCcw className="h-4 w-4" /> Re-record
          </Button>
          <Button type="button" size="sm" onClick={handleKeep}>
            <Check className="h-4 w-4" /> Keep
          </Button>
        </div>
      </div>
    )
  }

  const isRecording = status === "recording"
  const isPaused = status === "paused"

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {(isRecording || isPaused) && (
          <>
            <span
              className={cn(
                "h-3 w-3 rounded-full",
                isRecording ? "animate-pulse bg-red-600" : "bg-amber-500",
              )}
            />
            <span className="font-mono text-lg">{formatTime(elapsedMs)}</span>
            <div className="ml-2 flex h-6 flex-1 items-center">
              <div
                className="h-full bg-red-600/70"
                style={{ width: `${Math.min(100, amplitude * 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

      {error && <div className="text-sm text-amber-600">{error}</div>}

      <div className="flex gap-2">
        {status === "idle" && (
          <Button
            type="button"
            variant="outline"
            onClick={handleStart}
            className="w-full"
          >
            <Mic className="h-5 w-5" /> Record Audio
          </Button>
        )}
        {isRecording && (
          <>
            <Button type="button" variant="secondary" onClick={handlePause}>
              <Pause className="h-5 w-5" /> Pause
            </Button>
            <Button type="button" onClick={handleStop}>
              <Square className="h-5 w-5" /> Stop
            </Button>
          </>
        )}
        {isPaused && (
          <>
            <Button type="button" variant="secondary" onClick={handleResume}>
              <Play className="h-5 w-5" /> Resume
            </Button>
            <Button type="button" onClick={handleStop}>
              <Square className="h-5 w-5" /> Stop
            </Button>
          </>
        )}
        {(isRecording || isPaused) && (
          <Button type="button" variant="ghost" onClick={handleCancel}>
            <X className="h-5 w-5" /> Cancel
          </Button>
        )}
      </div>
    </div>
  )
}
