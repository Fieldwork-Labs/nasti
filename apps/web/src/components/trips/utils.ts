import { parsePostGISPoint } from "@/lib/utils"
import { Trip } from "@nasti/common/types"

export type TripWithLocation = Omit<Trip, "location_coordinate"> & {
  location_coordinate: string
}

export const tripWithLocationFilter = (trip: Trip): trip is TripWithLocation =>
  Boolean(trip.location_coordinate)

export const getTripCoordinates = (
  trip: Trip,
): { latitude: number; longitude: number } => {
  const wkbString = trip.location_coordinate
  if (!wkbString) throw new Error("No location coordinate")
  return parsePostGISPoint(wkbString)
}
