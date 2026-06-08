import type {
  LocationPermissionState,
  LocationService,
  LocationWatchCallback,
} from "../types"

function getLocationResult(coords: GeolocationCoordinates) {
  return {
    accuracy: coords.accuracy,
    altitude: coords.altitude,
    altitudeAccuracy: coords.altitudeAccuracy,
    heading: coords.heading,
    latitude: coords.latitude,
    longitude: coords.longitude,
    speed: coords.speed,
  }
}

export const geolocation: LocationService = {
  async getPermissionState(): Promise<LocationPermissionState> {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: "geolocation" })
      return status.state
    }

    if (navigator.geolocation) return "granted"
    return "denied"
  },

  async requestPermission(): Promise<LocationPermissionState> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve("granted"),
        (error) => {
          if (error.code === error.PERMISSION_DENIED) resolve("denied")
          else reject(error)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      )
    })
  },

  async getCurrentPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve(getLocationResult(position.coords)),
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      )
    })
  },

  subscribePermissionState(callback) {
    if (!navigator.permissions) return () => {}

    let permissionStatus: PermissionStatus | undefined
    const eventListener: EventListener = (event) =>
      callback((event.target as PermissionStatus).state)

    void navigator.permissions.query({ name: "geolocation" }).then((status) => {
      permissionStatus = status
      callback(status.state)
      status.addEventListener("change", eventListener)
    })

    return () => {
      permissionStatus?.removeEventListener("change", eventListener)
    }
  },

  async watchPosition(callback: LocationWatchCallback) {
    const watchId = navigator.geolocation.watchPosition(
      (position) => callback({ location: getLocationResult(position.coords) }),
      ({ code }) => callback({ warning: code }),
      { enableHighAccuracy: true },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  },
}
