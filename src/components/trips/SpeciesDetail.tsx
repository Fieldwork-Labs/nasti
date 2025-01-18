import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import { useSpecies } from "@/hooks/useSpecies"

type SpeciesDetailProps = {
  speciesId: string
}

export const SpeciesDetail = ({ speciesId }: SpeciesDetailProps) => {
  const { data, error } = useSpeciesDetail(speciesId)
  const { data: species } = useSpecies(speciesId)

  if (!data || error || data.error) {
    return <p>No Species Found</p>
  }

  return (
    <div>
      <h5 className="mt-2 font-bold">Name: {data.name}</h5>
      <p>Common Name: {data.commonNames.map((name) => name.nameString)}</p>
      <p>Photo: {data.images.map((image) => image as string)}</p>
      {species && species.length > 0 && (
        <p>Indigenous Name: {species?.map((one) => one.indigenous_name)}</p>
      )}
    </div>
  )
}
