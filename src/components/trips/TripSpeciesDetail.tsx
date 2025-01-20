import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"

type SpeciesDetailProps = {
  speciesId: string
}

export const TripSpeciesDetail = ({ speciesId }: SpeciesDetailProps) => {
  const { data, error } = useSpeciesDetail(speciesId)

  if (!data || error || data.error) {
    return <></>
  }

  return (
    <div>
      {data.commonNames.length > 0 && (
        <p>Common Name: {data.commonNames.map((name) => name.nameString)}</p>
      )}
      {data.images.length > 0 && (
        <p>Photo: {data.images.map((image) => image as string)}</p>
      )}
    </div>
  )
}
