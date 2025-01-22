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

  if (!data || error) {
    return <></>
  }

  return (
    <div className="flex gap-4">
      {data.images.length > 0 ? (
        <img
          src={data.images[0] as string}
          alt={`${species.name} Image`}
          width={80}
        />
      ) : (
        <span className="h-20 w-20 bg-slate-500" />
      )}
      <div>
        <h5 className="mt-2 font-bold">
          <i>{species.name}</i>
        </h5>
        {data.commonNames.length > 0 && <p>{data.commonNames[0].nameString}</p>}
        {species.indigenous_name && (
          <p>Indigenous Name: {species.indigenous_name}</p>
        )}
      </div>
    </div>
  )
}
