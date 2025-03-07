import { Geometry } from "wkx"
import { QueryClient } from "@tanstack/react-query"

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
