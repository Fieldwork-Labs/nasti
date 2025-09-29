import { supabase } from "@nasti/common/supabase"
import { Database } from "@nasti/common/types/database"
import { useQuery } from "@tanstack/react-query"

type DetailLevel = "high" | "medium" | "low"

async function getRegionsByDetailLevel(
  detailLevel: DetailLevel,
  bounds?: [[number, number], [number, number]],
) {
  let rpcParams: Database["public"]["Functions"]["get_ibra_regions"]["Args"] = {
    detail_level: detailLevel,
  }

  // Only add bounds parameters if bounds are provided and detail level is high
  if (bounds && detailLevel === "high") {
    const [[minLng, minLat], [maxLng, maxLat]] = bounds
    rpcParams = {
      ...rpcParams,
      min_lng: minLng,
      min_lat: minLat,
      max_lng: maxLng,
      max_lat: maxLat,
    }
  }
  // For medium and low detail levels, bounds parameters remain undefined/null
  const { data, error } = await supabase.rpc("get_ibra_regions", rpcParams)

  if (error) throw new Error(error.message)

  return {
    type: "FeatureCollection",
    features: data.map((region) => {
      return {
        type: "Feature",
        geometry: region.geometry,
        properties: { name: region.name, code: region.code },
      }
    }),
  }
}

export const useIbraRegions = (
  zoomLevel: number,
  bounds: [[number, number], [number, number]] | undefined,
) => {
  let geometryColumn: DetailLevel = "low"

  if (zoomLevel >= 8) {
    geometryColumn = "high"
  } else if (zoomLevel >= 5) {
    geometryColumn = "medium"
  }
  const queryBounds = geometryColumn === "high" ? bounds : undefined
  return useQuery({
    queryKey: ["ibraRegions", geometryColumn, queryBounds],
    queryFn: () => getRegionsByDetailLevel(geometryColumn, queryBounds),
    refetchOnMount: false,
  })
}
