import { useDisplayDistance } from "@/hooks/useDisplayDistance"
import {
  createFileRoute,
  Link,
  useNavigate,
  useParams,
} from "@tanstack/react-router"
import { Binoculars, ChevronLeft, Pencil, X } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useAuth } from "@/hooks/useAuth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nasti/ui/tabs"
import { useState } from "react"
import { Photo } from "@/components/common/Photo"
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"
import { ROLE } from "@nasti/common/types"
import { useScoutingNote } from "@/hooks/useScoutingNote"
import { ScoutingNotesMap } from "@/components/scouting-notes/ScoutingNotesMap"
import { TaxonName } from "@nasti/common"
import { PhenologyRangeDisplay } from "@nasti/ui/phenologyRangeDisplay"

const ScoutingNotesDetail = () => {
  const { user, role } = useAuth()
  const { scoutingNoteId, id: tripId } = useParams({
    from: "/_private/trips/$id/scouting-notes/$scoutingNoteId/",
  })

  const scoutingNote = useScoutingNote({ scoutingNoteId })

  const navigate = useNavigate({
    from: "/trips/$id/scouting-notes/$scoutingNoteId",
  })

  const handleBackClick = () => {
    navigate({ to: "/trips/$id" })
  }

  const [fullScreenPhoto, setFullScreenPhoto] = useState<string | null>(null)

  const displayDistance = useDisplayDistance(scoutingNote?.locationCoord ?? {})

  const canEdit = scoutingNote?.created_by === user?.id || role === ROLE.ADMIN

  if (!scoutingNote)
    return (
      <div className="flex h-full w-full flex-col items-start">
        <h2 className="p-2 text-2xl">No scouting note available</h2>
        <Button
          className="flex w-full justify-start text-lg"
          variant="ghost"
          onClick={handleBackClick}
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-3 px-2">
      <div className="flex items-center justify-between align-middle">
        <div className="flex items-center text-2xl">
          <ChevronLeft onClick={handleBackClick} width={36} height={36} />{" "}
          {scoutingNote?.species?.name ? (
            <TaxonName name={scoutingNote?.species?.name} />
          ) : (
            scoutingNote.field_name
          )}
        </div>
        {canEdit && (
          <Link
            to={"/trips/$id/scouting-notes/$scoutingNoteId/edit"}
            params={{ id: tripId, scoutingNoteId }}
          >
            <Button variant="ghost" size={"icon"}>
              <Pencil className="h-5 w-5" />
            </Button>
          </Link>
        )}
      </div>
      <div className="flex justify-end">
        <Badge className="flex items-center gap-2 rounded text-lg">
          <Binoculars className="h-5 w-5" /> Scouting Note
        </Badge>
      </div>
      <table>
        <thead>
          <tr className="text-muted-foreground text-left">
            <th>Time</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {scoutingNote.created_at && (
                <span>
                  {new Date(scoutingNote.created_at).toLocaleString()}
                </span>
              )}
            </td>
            <td>
              {displayDistance && (
                <Popover>
                  <PopoverTrigger>{displayDistance} km away</PopoverTrigger>
                  <PopoverContent className="w-full">
                    {scoutingNote.locationCoord?.latitude.toFixed(6)},{" "}
                    {scoutingNote.locationCoord?.longitude.toFixed(6)}
                  </PopoverContent>
                </Popover>
              )}
            </td>
          </tr>
        </tbody>
        <thead>
          <tr className="text-muted-foreground text-left">
            <th>Recorder</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {user?.id === scoutingNote.created_by
                ? "You"
                : user?.user_metadata.name || "Unknown Person"}
            </td>
          </tr>
        </tbody>

        {scoutingNote.description && (
          <>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{scoutingNote.description}</td>
              </tr>
            </tbody>
          </>
        )}

        {scoutingNote.phenology_start && (
          <>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th>Phenology</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pt-2" colSpan={2}>
                  <PhenologyRangeDisplay
                    value={[
                      scoutingNote.phenology_start,
                      scoutingNote.phenology_peak,
                      scoutingNote.phenology_end,
                    ]}
                  />
                </td>
              </tr>
            </tbody>
          </>
        )}
      </table>

      <Tabs defaultValue="photos">
        <TabsList className="bg-secondary-background mb-2 w-full">
          <TabsTrigger className="w-full" value="photos">
            Photos
          </TabsTrigger>
          <TabsTrigger className="w-full" value="map">
            Map
          </TabsTrigger>
        </TabsList>
        <TabsContent value="photos" className="grid grid-cols-2 gap-2">
          {scoutingNote.photos.map((photo) => {
            return (
              <Photo
                id={photo.id}
                onClick={setFullScreenPhoto}
                key={photo.id}
                showCaption
                showUploadProgress
              />
            )
          })}
        </TabsContent>
        <TabsContent value="map" className="">
          <ScoutingNotesMap tripId={tripId} scoutingNoteId={scoutingNoteId} />
        </TabsContent>
      </Tabs>

      {/* Full-screen overlay */}
      {fullScreenPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-2">
          <button
            onClick={() => setFullScreenPhoto(null)}
            className="absolute right-4 top-4 p-2"
            aria-label="Close photo"
          >
            <X size={28} className="text-white" />
          </button>
          <TransformWrapper>
            <TransformComponent wrapperClass="overflow-visible">
              <img src={fullScreenPhoto} alt="Full screen" />
            </TransformComponent>
          </TransformWrapper>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute(
  "/_private/trips/$id/scouting-notes/$scoutingNoteId/",
)({
  component: ScoutingNotesDetail,
})
