import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"

type SpeciesDetailProps = {
  species: {
    ala_guid: string
    name: string
    indigenous_name?: string
  }
}

export const TripSpeciesDetail = ({ species }: SpeciesDetailProps) => {
  const { data, error } = useSpeciesDetail(species.ala_guid)

  if (!data || error || data.error) {
    return <></>
  }
  console.log(data)

  return (
    <div className="grid grid-cols-2 gap-4">
      {data.images.length > 0 && (
        <img src={data.images[0] as string} alt="SPECIES Image" />
      )}
      <div>
        <h5 className="mt-2 font-bold">Name: {species.name}</h5>
        {data.commonNames.length > 0 && (
          <p>Common Name: {data.commonNames[0].nameString}</p>
        )}
        {data.taxonName.length > 0 && (
          <p>Taxonomical Name: {data.taxonName[0] as string}</p>
        )}
        {species.indigenous_name && (
          <p>Indigenous Name: {species.indigenous_name}</p>
        )}
      </div>
    </div>
  )
}
