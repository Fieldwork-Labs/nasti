import { Geometry } from "wkx"

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
