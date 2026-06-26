import { parseWktPoint } from "@nasti/common/utils"

export function parseLocation<T extends { location: string | null }>(
  obj: T,
): T & { locationCoord?: { latitude: number; longitude: number } } {
  if (!obj.location) return obj

  return {
    ...obj,
    locationCoord: parseWktPoint(obj.location),
  }
}
