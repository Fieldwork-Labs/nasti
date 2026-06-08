import { parsePostGISPoint } from "@nasti/common/utils"

export function parseWktLocation<T extends { location: string | null }>(
  obj: T,
): T & { locationCoord?: { latitude: number; longitude: number } } {
  if (!obj.location) return obj
  // obj.location is a string with the format `POINT(lng lat)`
  const innerString = obj.location.slice(
    obj.location.indexOf("(") + 1,
    obj.location.lastIndexOf(")"),
  )
  const [lng, lat] = innerString.split(" ")
  return {
    ...obj,
    locationCoord: {
      latitude: parseFloat(lat),
      longitude: parseFloat(lng),
    },
  }
}

export function parseLocation<T extends { location: string | null }>(
  obj: T,
): T & { locationCoord?: { latitude: number; longitude: number } } {
  if (!obj.location) return obj
  // location may be a string with the format `POINT(lng lat)`
  const isWkt = obj.location.startsWith("POINT")
  if (isWkt) return parseWktLocation(obj)

  return {
    ...obj,
    locationCoord: parsePostGISPoint(obj.location),
  }
}
