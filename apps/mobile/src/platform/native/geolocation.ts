import { Capacitor } from "@capacitor/core"
import { Geolocation } from "@capacitor/geolocation"
import type { Position, PositionOptions } from "@capacitor/geolocation"
import type { LocationPermissionState, LocationService } from "../types"

function toLocationPermissionState(location: string): LocationPermissionState {
  if (location === "granted") return "granted"
  if (location === "denied") return "denied"
  return "prompt"
}

function getLocationResult(position: Position) {
  return {
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
    heading: position.coords.heading,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    speed: position.coords.speed,
  }
}

function isAndroid() {
  return Capacitor.getPlatform() === "android"
}

function getCurrentPositionOptions(): PositionOptions {
  if (isAndroid()) {
    return {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 300000,
      enableLocationFallback: true,
    }
  }

  return {
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 60000,
  }
}

function getWatchPositionOptions(): PositionOptions {
  if (isAndroid()) {
    return {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 300000,
      interval: 10000,
      minimumUpdateInterval: 5000,
      enableLocationFallback: true,
    }
  }

  return {
    enableHighAccuracy: true,
    timeout: 30000,
    maximumAge: 60000,
  }
}

function formatGeolocationError(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export const geolocation: LocationService = {
  async getPermissionState() {
    const { location } = await Geolocation.checkPermissions()
    return toLocationPermissionState(location)
  },

  async requestPermission() {
    const { location } = await Geolocation.requestPermissions({
      permissions: ["location"],
    })
    return toLocationPermissionState(location)
  },

  async getCurrentPosition() {
    const position = await Geolocation.getCurrentPosition(
      getCurrentPositionOptions(),
    )
    return getLocationResult(position)
  },

  async watchPosition(callback) {
    const watchId = await Geolocation.watchPosition(
      getWatchPositionOptions(),
      (position, error) => {
        if (error) {
          console.warn(
            "[Geolocation] watchPosition failed:",
            formatGeolocationError(error),
          )
          callback({ warning: 2 })
          return
        }

        if (position) callback({ location: getLocationResult(position) })
      },
    )

    return () => {
      void Geolocation.clearWatch({ id: watchId })
    }
  },
}
