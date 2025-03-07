import { useALAImage } from "@/hooks/useALAImage"
import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import { ImageIcon } from "lucide-react"

type SpeciesDetailProps = {
  species: {
    ala_guid: string
    name: string
    indigenous_name?: string
  }
}

export const TripSpeciesDetail = ({ species }: SpeciesDetailProps) => {
  const { data, error } = useSpeciesDetail(species.ala_guid)
  const { data: image } = useALAImage(data?.imageIdentifier, "thumbnail")

  if (!data || error) {
    return <></>
  }

  return (
    <div className="flex h-16 gap-4">
      {image ? (
        <img src={image} alt={`${species.name} Image`} width={80} height={60} />
      ) : (
        <span className="flex h-16 w-20 justify-center bg-slate-500 align-middle">
          <ImageIcon />
        </span>
      )}
      <div className="flex flex-col">
        <h5 className="font-bold">
          <i>{species.name}</i>
        </h5>
        <div className="flex flex-col">
          {data.commonNames.length > 0 && (
            <span>{data.commonNames[0].nameString}</span>
          )}
          {species.indigenous_name && (
            <span>Indigenous Name: {species.indigenous_name}</span>
          )}
        </div>
      </div>
    </div>
  )
}
