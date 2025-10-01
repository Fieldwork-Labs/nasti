import useUserStore from "@/store/userStore"
import { Database } from "@nasti/common/types/database"
import { queryClient } from "@nasti/common/utils"
import { useQuery } from "@tanstack/react-query"
import { booleanContains } from "@turf/boolean-contains"
import { buffer } from "@turf/buffer"
import { bbox } from "@turf/bbox"
import { bboxPolygon } from "@turf/bbox-polygon"
import { useCallback } from "react"
import { Geometry } from "wkx"
import { Feature, GeoJsonProperties, Polygon } from "geojson"

type DetailLevel = "high" | "medium" | "low"

async function getRegionsByDetailLevel(
  detailLevel: DetailLevel,
  bounds?: [[number, number], [number, number]],
  authToken?: string,
) {
  let rpcParams: Database["public"]["Functions"]["get_ibra_regions"]["Args"] = {
    detail_level: detailLevel,
  }

  // Only add bounds parameters if bounds are provided
  if (bounds) {
    const [[minLng, minLat], [maxLng, maxLat]] = bounds
    const originalBbox = [minLng, minLat, maxLng, maxLat] as [
      number,
      number,
      number,
      number,
    ]
    const poly = bboxPolygon(originalBbox)
    const bufferedPoly = buffer(poly, 0.2, { units: "degrees" })
    const bufferedBbox = bufferedPoly ? bbox(bufferedPoly) : originalBbox

    rpcParams = {
      ...rpcParams,
      min_lng: bufferedBbox[0],
      min_lat: bufferedBbox[1],
      max_lng: bufferedBbox[2],
      max_lat: bufferedBbox[3],
    }
  }
  // For medium and low detail levels, bounds parameters remain undefined/null

  const response = await fetch("http://localhost:8788/api/get_ibra_regions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      params: rpcParams,
    }),
  })
  const data: { geometry: Geometry; name: string; code: string }[] =
    await response.json()

  if (!data) throw new Error("Unable to fetch IBRA data")

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

type IbraQueryKeyWithBounds = [
  string,
  string,
  Feature<Polygon, GeoJsonProperties> | undefined,
]

type IbraQueryKey = [string, string] | IbraQueryKeyWithBounds

const convertBounds = (
  bounds: [[number, number], [number, number]],
): [number, number, number, number] => {
  const [[swX, swY], [neX, neY]] = bounds
  return [swX, swY, neX, neY]
}

export const useIbraRegions = (
  zoomLevel: number,
  bounds: [[number, number], [number, number]] | undefined,
) => {
  const { session } = useUserStore()
  let geometryColumn: DetailLevel = "low"

  if (zoomLevel >= 8) {
    geometryColumn = "high"
  } else if (zoomLevel >= 5) {
    geometryColumn = "medium"
  }

  const queryBounds = geometryColumn === "high" ? bounds : undefined

  // Find a cached query that contains the current bounds
  const findCachedParentQuery = useCallback((): IbraQueryKey => {
    if (!queryBounds) {
      return ["ibraRegions", geometryColumn]
    }
    // Get all cached queries for this detail level
    const cachedQueries = queryClient.getQueryCache().findAll({
      queryKey: ["ibraRegions", geometryColumn],
    })

    const queryBoundsBbox = bboxPolygon(convertBounds(queryBounds))
    // Check each cached query to see if it contains our bounds
    for (const query of cachedQueries) {
      const key = query.queryKey as IbraQueryKey

      // If the cached query has bounds
      if (key.length === 3) {
        const cachedBounds = key[2]
        if (!cachedBounds) {
          // No suitable cached query found, use new bounds
          return ["ibraRegions", geometryColumn, queryBoundsBbox]
        }

        // Check if current bounds fit within cached bounds
        if (booleanContains(cachedBounds, queryBoundsBbox)) {
          return key // Reuse this cached query
        }
      }
    }

    // No suitable cached query found, use new bounds
    return ["ibraRegions", geometryColumn, queryBoundsBbox]
  }, [queryBounds, geometryColumn])

  const queryKey = findCachedParentQuery()

  return useQuery({
    queryKey,
    queryFn: () =>
      getRegionsByDetailLevel(
        geometryColumn,
        queryBounds,
        session?.access_token,
      ),
    refetchOnMount: false,
    staleTime: Infinity,
    throwOnError: false,
    retry: false,
  })
}
