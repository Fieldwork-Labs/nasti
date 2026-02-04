import { useSpecies } from "@/hooks/useSpecies"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"

import { useCollectionPhotos } from "@/hooks/useCollectionPhotos"
import { usePeople } from "@/hooks/usePeople"
import { useScoutingNote } from "@/hooks/useScoutingNote"
import { useSpeciesDisplayImage } from "@/hooks/useSpeciesDisplayImage"
import { useTripDetail } from "@/hooks/useTripDetail"
import { TaxonName } from "@nasti/common"
import { useOpenClose } from "@nasti/ui/hooks"
import { Spinner } from "@nasti/ui/spinner"
import { LeafIcon } from "lucide-react"
import { ScoutingNoteDetailModal } from "./ScoutingNoteDetailModal"

export const ScoutingNoteListItem = ({
  id,
  showTrip = false,
  onHover,
}: {
  id: string
  showTrip?: boolean
  onHover?: (id: string | undefined) => void
}) => {
  const { data: scoutingNote, error } = useScoutingNote(id)
  const { data: species } = useSpecies(scoutingNote?.species_id)
  const { photos, signedUrlsIsLoading } = useCollectionPhotos(id)
  const { image: speciesProfileImage } = useSpeciesDisplayImage(
    scoutingNote?.species_id,
    species?.ala_guid,
    "thumbnail",
  )

  const { data: trip } = useTripDetail(scoutingNote?.trip_id ?? undefined)

  // Priority: scoutingNote photo > species profile photo > ALA image > placeholder
  const photo = photos?.[0]?.signedUrl ?? speciesProfileImage

  const { open, isOpen, close } = useOpenClose()

  const { data: people } = usePeople()

  if (!scoutingNote || error) {
    return <></>
  }

  const speciesName = species?.name ?? scoutingNote.field_name

  const creator = people?.find(
    (person) => person.id === scoutingNote.created_by,
  )

  return (
    <>
      <div
        onMouseOver={() => (onHover ? onHover(id) : null)}
        onMouseLeave={() => (onHover ? onHover(undefined) : null)}
        onClick={open}
        className="bg-secondary-background text-primary-foreground hover:bg-primary/90 h-26 flex cursor-pointer gap-2 rounded-sm"
      >
        {signedUrlsIsLoading && (
          <span className="h-26 flex w-20 items-center justify-center bg-slate-500">
            <Spinner className="h-6 w-6" />
          </span>
        )}
        {!signedUrlsIsLoading && (
          <>
            {photo ? (
              <span className="h-26 flex w-20 content-center justify-center">
                <img
                  src={photo}
                  alt={`${speciesName} Image`}
                  className="w-20 rounded-l-sm object-cover text-sm"
                />
              </span>
            ) : (
              <span className="h-26 flex w-20 items-center justify-center bg-slate-500">
                <LeafIcon />
              </span>
            )}
          </>
        )}
        <div className="text-foreground flex h-full w-full flex-col py-1 pr-2">
          <div className="flex items-center justify-start gap-2">
            {speciesName && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TaxonName
                      name={speciesName}
                      className="max-w-56 truncate font-semibold"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <TaxonName name={speciesName} />
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {showTrip && <span className="text-xs">{trip?.name}</span>}
          </div>
          <div className="flex flex-col text-start text-xs">
            {creator && <span>{creator.name ?? "Unknown Person"}</span>}
            {<span>{new Date(scoutingNote.created_at).toLocaleString()}</span>}
          </div>
        </div>
      </div>
      <ScoutingNoteDetailModal
        scoutingNote={scoutingNote}
        open={isOpen}
        onClose={close}
      />
    </>
  )
}
