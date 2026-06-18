import type { SupportedStorage } from "@supabase/supabase-js"

export type LocationPermissionState = "granted" | "denied" | "prompt"

export type LocationResult = Pick<
  GeolocationCoordinates,
  | "accuracy"
  | "altitude"
  | "altitudeAccuracy"
  | "heading"
  | "latitude"
  | "longitude"
  | "speed"
>

export type LocationWatchUpdate = {
  location?: LocationResult
  warning?: number
}

export type LocationWatchCallback = (update: LocationWatchUpdate) => void

export interface LocationService {
  getPermissionState(): Promise<LocationPermissionState>
  requestPermission(): Promise<LocationPermissionState>
  getCurrentPosition(): Promise<LocationResult>
  subscribePermissionState?(
    callback: (state: LocationPermissionState) => void,
  ): () => void
  watchPosition(callback: LocationWatchCallback): Promise<() => void>
}

export interface PhotoService {
  addPhotos(): Promise<Array<File>>
}

/**
 * A captured audio recording, ready to persist + upload.
 * `mime_type` is determined by the platform at capture time and flows into the
 * PowerSync row, the TUS upload contentType, and the streaming Content-Type.
 */
export type AudioRecording = {
  file: File
  duration_ms: number
  mime_type: string
}

/**
 * A live recording session. The UI drives this so it can expose
 * pause/resume/cancel and live amplitude polling (see AudioRecorder).
 */
export interface AudioSession {
  /** Current input amplitude normalized to [0, 1]. Poll while recording. */
  getAmplitude(): Promise<number>
  pause(): Promise<void>
  resume(): Promise<void>
  /** Finalize and keep. Resolves with the recording, or null if nothing captured. */
  stop(): Promise<AudioRecording | null>
  /** Discard the recording entirely. */
  cancel(): Promise<void>
}

export interface AudioService {
  checkPermissions(): Promise<boolean>
  requestPermissions(): Promise<boolean>
  /** Begin a new recording session. Rejects if permission denied or hardware busy. */
  startRecording(): Promise<AudioSession>
}

export interface AppShellService {
  prepareDocument(): void
  getIsActive(): Promise<boolean>
  onActiveChange(callback: (isActive: boolean) => void): () => void
}

export type AuthStorageService = SupportedStorage
