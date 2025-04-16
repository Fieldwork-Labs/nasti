import {
  CollectionWithCoordAndPhotos,
  useHydrateTripDetails,
} from "./useHydrateTripDetails"
import { Species } from "@nasti/common/types"

export type FullCollection = CollectionWithCoordAndPhotos & {
  species?: Species
}

export const useCollection = ({
  collectionId,
  tripId,
}: {
  collectionId: string
  tripId: string
}) => {
  const tripDetails = useHydrateTripDetails({ id: tripId })
  const collection = tripDetails.data.trip?.collections.find(
    (c) => c.id === collectionId,
  )
  const species =
    tripDetails.data.species?.find((s) => s.id === collection?.species_id) ?? {}

  return { ...collection, species } as FullCollection
}
