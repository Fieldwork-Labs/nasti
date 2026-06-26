import { Geometry } from "wkx"

export const parseWktPoint = (wktString: string) => {
  // Parse the WKB
  const geometry = Geometry.parse(wktString).toGeoJSON() as GeoJSON.Point
  try {
    return {
      latitude: geometry["coordinates"][1],
      longitude: geometry["coordinates"][0],
    }
  } catch (error) {
    throw new Error("Invalid WKT point string")
  }
}
