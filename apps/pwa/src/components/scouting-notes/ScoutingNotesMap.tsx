import { Binoculars } from "lucide-react"
import { LocationMap } from "../common/LocationMap"
import { useScoutingNote } from "@/hooks/useScoutingNote"

export const ScoutingNotesMap = ({
  tripId,
  scoutingNoteId,
}: {
  tripId: string
  scoutingNoteId: string
}) => {
  const scoutingNote = useScoutingNote({ tripId, scoutingNoteId })

  if (!scoutingNote.locationCoord) return null

  return (
    <LocationMap
      coord={scoutingNote.locationCoord}
      Marker={() => (
        <div className="rounded-full bg-white/50 p-2">
          <Binoculars className="text-primary h-5 w-5 cursor-pointer" />
        </div>
      )}
    />
  )
}
