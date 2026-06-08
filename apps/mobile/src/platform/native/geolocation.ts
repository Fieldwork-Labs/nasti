import { Geolocation } from "@capacitor/geolocation"
import type { Position } from "@capacitor/geolocation"
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
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 1000,
    })
    return getLocationResult(position)
  },

  async watchPosition(callback) {
    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      (position, error) => {
        if (error) {
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
