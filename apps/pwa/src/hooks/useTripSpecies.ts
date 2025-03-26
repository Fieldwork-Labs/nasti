import { queryClient } from "@/lib/queryClient"
import { Species } from "@nasti/common/types"
import { PostgrestResponse } from "@supabase/supabase-js"

export const useTripSpeciesList = ({ tripId }: { tripId: string }) => {
  return queryClient.getQueryData<PostgrestResponse<Species>>([
    "species",
    "forTrip",
    tripId,
  ])
}

export const useTripSpecies = ({
  tripId,
  speciesId,
}: {
  tripId: string
  speciesId?: string
}) => {
  const data = useTripSpeciesList({ tripId })
  return speciesId ? data?.data?.find((s) => s.id === speciesId) : undefined
}
