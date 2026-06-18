import { CapacitorAudioRecorder } from "@capgo/capacitor-audio-recorder"
import type { PluginListenerHandle } from "@capacitor/core"
import type {
  AudioRecording,
  AudioService,
  AudioSession,
} from "./types"
import {
  extensionFromPath,
  extensionToMime,
  mimeToExtension,
} from "@/lib/audio"

/**
 * Cross-platform audio recording via `@capgo/capacitor-audio-recorder`.
 *
 * The plugin abstracts the platform: native (iOS/Android) `stopRecording()`
 * returns a file `uri`, web returns a `blob`. Both are handled here. This is a
 * single shared implementation rather than per-platform files because the
 * plugin leaves nothing platform-specific for us to do.
 */

/** Convert a native recording URI to a File, deriving mime from the extension. */
async function uriToFile(
  uri: string,
  durationMs: number,
): Promise<AudioRecording> {
  const ext = extensionFromPath(uri) || "m4a"
  const mime_type = extensionToMime(ext)
  const response = await fetch(uri)
  const blob = await response.blob()
  const filename = `nasti-audio-${Date.now()}-${crypto.randomUUID()}.${mimeToExtension(mime_type)}`
  const file = new File([blob], filename, { type: mime_type })
  return { file, duration_ms: durationMs, mime_type }
}

/** Web MediaRecorder may report `audio/webm;codecs=opus` — keep only the type. */
const normalizeWebMime = (mime: string): string => {
  const base = (mime || "").split(";")[0].trim().toLowerCase()
  return base || "audio/mp4"
}

function blobToRecording(blob: Blob, durationMs: number): AudioRecording {
  const mime_type = normalizeWebMime(blob.type)
  const filename = `nasti-audio-${Date.now()}-${crypto.randomUUID()}.${mimeToExtension(mime_type)}`
  const file = new File([blob], filename, { type: mime_type })
  return { file, duration_ms: durationMs, mime_type }
}

class AudioSessionImpl implements AudioSession {
  private errorListener?: PluginListenerHandle
  private recordedError: Error | null = null

  async start(): Promise<void> {
    this.errorListener = await CapacitorAudioRecorder.addListener(
      "recordingError",
      (event) => {
        this.recordedError = new Error(event.message)
      },
    )
    await CapacitorAudioRecorder.startRecording()
  }

  async getAmplitude(): Promise<number> {
    const { value } = await CapacitorAudioRecorder.getCurrentAmplitude()
    return value
  }

  async pause(): Promise<void> {
    await CapacitorAudioRecorder.pauseRecording()
  }

  async resume(): Promise<void> {
    await CapacitorAudioRecorder.resumeRecording()
  }

  async stop(): Promise<AudioRecording | null> {
    try {
      if (this.recordedError) throw this.recordedError
      const { uri, blob, duration } =
        await CapacitorAudioRecorder.stopRecording()
      const duration_ms = duration ?? 0
      if (uri) return await uriToFile(uri, duration_ms)
      if (blob) return blobToRecording(blob, duration_ms)
      return null
    } finally {
      await this.errorListener?.remove()
      this.errorListener = undefined
    }
  }

  async cancel(): Promise<void> {
    try {
      await CapacitorAudioRecorder.cancelRecording()
    } finally {
      await this.errorListener?.remove()
      this.errorListener = undefined
    }
  }
}

export const audio: AudioService = {
  async checkPermissions(): Promise<boolean> {
    const { recordAudio } = await CapacitorAudioRecorder.checkPermissions()
    return recordAudio === "granted"
  },

  async requestPermissions(): Promise<boolean> {
    const { recordAudio } = await CapacitorAudioRecorder.requestPermissions()
    return recordAudio === "granted"
  },

  async startRecording(): Promise<AudioSession> {
    const granted = await this.requestPermissions()
    if (!granted) throw new Error("Microphone permission denied")
    const session = new AudioSessionImpl()
    await session.start()
    return session
  },
}
