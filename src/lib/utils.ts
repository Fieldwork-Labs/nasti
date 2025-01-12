import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Geometry } from "wkx"
import { QueryClient } from "@tanstack/react-query"
import { Trip } from "@/types"

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

export const queryClient = new QueryClient()

export const parsePostGISPoint = (wkbString: string) => {
  // Convert the hex string to a buffer
  const buffer = Buffer.from(wkbString, "hex")

  // Parse the WKB
  const geometry = Geometry.parse(buffer).toGeoJSON() as GeoJSON.Point
  try {
    return {
      latitude: geometry["coordinates"][1],
      longitude: geometry["coordinates"][0],
    }
  } catch (error) {
    throw new Error("Invalid WKB point string")
  }
}

export const getTripCoordinates = (
  trip: Trip,
): { latitude: number; longitude: number } => {
  const wkbString = trip.location_coordinate
  if (!wkbString) throw new Error("No location coordinate")
  return parsePostGISPoint(wkbString)
}
