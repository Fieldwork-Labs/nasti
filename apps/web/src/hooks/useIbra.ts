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

  // Only add bounds parameters if bounds are provided
  if (bounds) {
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

type IbraQueryKey =
  | [string, string]
  | [string, string, [[number, number], [number, number]] | undefined]
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

  let queryKey: IbraQueryKey
  const queryBounds = geometryColumn === "high" ? bounds : undefined
  if (queryBounds) queryKey = ["ibraRegions", geometryColumn, queryBounds]
  else queryKey = ["ibraRegions", geometryColumn]

  return useQuery({
    queryKey,
    queryFn: () => getRegionsByDetailLevel(geometryColumn, queryBounds),
    refetchOnMount: false,
    staleTime: Infinity,
  })
}
