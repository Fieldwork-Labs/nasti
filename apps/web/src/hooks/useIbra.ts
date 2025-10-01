import useUserStore from "@/store/userStore"
import { Database } from "@nasti/common/types/database"
import { queryClient } from "@nasti/common/utils"
import { useQuery } from "@tanstack/react-query"
import { Feature, FeatureCollection, GeometryObject } from "geojson"

type DetailLevel = "high" | "medium" | "low"
type ResponseFeature = {
  geometry: GeometryObject
  name: string
  code: string
  id: number
}

async function getRegionsByDetailLevel(
  detailLevel: DetailLevel,
  authToken?: string,
): Promise<FeatureCollection> {
  const rpcParams: Database["public"]["Functions"]["get_ibra_regions"]["Args"] =
    {
      detail_level: detailLevel,
    }

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
  const data: ResponseFeature[] = await response.json()

  if (!data) throw new Error("Unable to fetch IBRA data")

  const featureCol: FeatureCollection = {
    type: "FeatureCollection",
    features: data.map((region) => {
      const id = region.id
      const result: Feature = {
        type: "Feature",
        geometry: region.geometry,
        id,
        properties: { id, name: region.name, code: region.code },
      }
      return result
    }),
  }
  return featureCol
}

async function getRegionsById(
  ids: number[],
  authToken?: string,
): Promise<FeatureCollection> {
  if (ids.length === 0) return { type: "FeatureCollection", features: [] }

  const cachedResults: Feature[] = []
  const missingIds: number[] = []
  const detailsQuerys = queryClient.getQueriesData<Feature>({
    queryKey: ["ibraRegions", "detail"],
  })
  ids.forEach((id) => {
    const cachedQuery = detailsQuerys.find(
      ([queryKey]) => queryKey.length === 3 && queryKey[2] === id,
    )
    if (cachedQuery && cachedQuery[1]) {
      cachedResults.push(cachedQuery[1])
    } else {
      missingIds.push(id)
    }
  })
  if (missingIds.length === 0)
    return { type: "FeatureCollection", features: cachedResults }

  const response = await fetch("http://localhost:8788/api/get_ibra_regions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      params: { ids: missingIds },
    }),
  })
  const data: ResponseFeature[] = await response.json()

  if (!data) throw new Error("Unable to fetch IBRA data")

  const features = cachedResults
  data.map((region) => {
    const id = region.id
    const result: Feature = {
      type: "Feature",
      geometry: region.geometry,
      id,
      properties: { id, name: region.name, code: region.code },
    }
    features.push(result)
    queryClient.setQueryData(["ibraRegions", "detail", id], result)
  })

  return {
    type: "FeatureCollection",
    features,
  } as FeatureCollection
}

export const useIbraRegions = (zoomLevel: number, ids?: number[]) => {
  const { session } = useUserStore()
  let geometryColumn: DetailLevel = "low"

  if (zoomLevel >= 8) {
    geometryColumn = "high"
  } else if (zoomLevel >= 5) {
    geometryColumn = "medium"
  }

  // if ids provided, look for cached query with ids
  const queryByIds = ids && ids.length > 0 && geometryColumn === "high"
  const queryKey = queryByIds
    ? ["ibraRegions", "byIdList", ids]
    : ["ibraRegions", geometryColumn]

  return useQuery({
    queryKey,
    queryFn: () =>
      queryByIds
        ? getRegionsById(ids, session?.access_token)
        : getRegionsByDetailLevel(geometryColumn, session?.access_token),
    refetchOnMount: false,
    staleTime: Infinity,
    throwOnError: false,
    retry: false,
  })
}
