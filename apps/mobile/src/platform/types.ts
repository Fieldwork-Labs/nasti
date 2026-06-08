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

export interface AppShellService {
  prepareDocument(): void
}

export type AuthStorageService = SupportedStorage
