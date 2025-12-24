import { Database, TablesInsert, TablesUpdate } from "./database"

type Table<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
type Function<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]

export type Organisation = Table<"organisation">
export type Invitation = Table<"invitation">
export type Species = Table<"species">
export type TripSpecies = Table<"trip_species">
export type Trip = Table<"trip"> & { location_coordinate: string | null } // override for bad supabase typing on geographic point fields
export type Collection = Table<"collection"> & { location: string | null }
export type CollectionWithCoord = Collection & {
  locationCoord?: { latitude: number; longitude: number }
}

export type NewCollection = TablesInsert<"collection"> & {
  trip_id: string
  location: string
  id: string // id not necessarily required in the insert type, but makes things much easier on the client side to ensure it is there
}
// TablesUpdate includes the id field as optional but it should really be requirec
export type UpdateCollection = TablesUpdate<"collection"> & { id: string }

export type CollectionPhoto = Table<"collection_photo">

export type ScoutingNote = Table<"scouting_notes"> & { location: string | null }
export type ScoutingNoteWithCoord = ScoutingNote & {
  locationCoord?: { latitude: number; longitude: number }
}
export type NewScoutingNote = TablesInsert<"scouting_notes"> & {
  trip_id: string
  location: string
  id: string
}

export type ScoutingNotePhoto = Table<"scouting_notes_photos">

export type TripMember = Table<"trip_member">
export type GetOrgUsers = Function<"get_organisation_users">
export type Person = GetOrgUsers["Returns"][number]

export type Role = Database["public"]["Enums"]["org_user_types"]

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
}
