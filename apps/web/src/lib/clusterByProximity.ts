export interface GeoPoint {
  latitude: number
  longitude: number
}

const METERS_PER_DEGREE_LAT = 111320

const metersPerPixel = (latitude: number, zoom: number) =>
  (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom)

const distanceInMeters = (a: GeoPoint, b: GeoPoint) => {
  const dLat = (a.latitude - b.latitude) * METERS_PER_DEGREE_LAT
  const dLon =
    (a.longitude - b.longitude) *
    METERS_PER_DEGREE_LAT *
    Math.cos((a.latitude * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLon * dLon)
}

/**
 * Groups items whose map marker would render within `pixelThreshold` pixels
 * of each other at the given zoom level, so overlapping markers can be
 * displayed as a single stacked marker instead of occluding one another.
 */
export function clusterByProximity<T>(
  items: T[],
  getCoords: (item: T) => GeoPoint,
  zoom: number,
  pixelThreshold = 40,
): T[][] {
  const clusters: { coords: GeoPoint; items: T[] }[] = []

  for (const item of items) {
    const coords = getCoords(item)
    const thresholdMeters =
      pixelThreshold * metersPerPixel(coords.latitude, zoom)

    const cluster = clusters.find(
      (c) => distanceInMeters(coords, c.coords) <= thresholdMeters,
    )

    if (cluster) {
      cluster.items.push(item)
    } else {
      clusters.push({ coords, items: [item] })
    }
  }

  return clusters.map((c) => c.items)
}
