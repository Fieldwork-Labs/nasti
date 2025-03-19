import { ImageFormat, useALAImage } from "./useALAImage"
import { useALASpeciesDetail } from "./useALASpeciesDetail"

export const useALASpeciesImage = ({
  guid,
  format = "thumbnail",
}: {
  guid?: string | null
  format?: ImageFormat
}) => {
  const { data: speciesData } = useALASpeciesDetail(guid)
  const { data: image } = useALAImage(speciesData?.imageIdentifier, format)
  return image
}
