import { useCollectionPhoto } from "./useCollectionPhoto"
import { useScoutingNotePhoto } from "./useScoutingNotePhoto"

export const usePhoto = ({ id }: { id?: string }) => {
  const collectionPhoto = useCollectionPhoto({ id })
  const scoutingNotePhoto = useScoutingNotePhoto({ id })

  return collectionPhoto ?? scoutingNotePhoto
}
