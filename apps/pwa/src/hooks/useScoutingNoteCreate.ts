import {
  ScoutingNote,
  ScoutingNoteWithCoord,
  NewScoutingNote,
} from "@nasti/common/types"
import { EntityConfig, useEntityCreate } from "./useEntityCreate"

const scoutingNoteConfig = {
  tableName: "scouting_notes",
  queryKeyPrefix: "scoutingNotes",
  mutationKeyPrefix: "createScoutingNote",
  photoMutationKeySegment: "scoutingNote",
} satisfies EntityConfig

export const useScoutingNoteCreate = ({ tripId }: { tripId: string }) =>
  useEntityCreate<ScoutingNote, NewScoutingNote, ScoutingNoteWithCoord>(
    tripId,
    scoutingNoteConfig,
  )
