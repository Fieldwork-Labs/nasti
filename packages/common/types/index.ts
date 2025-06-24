import { Database } from "./database"

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
export type NewCollection = Collection & { photos: { new: File[] } }
export type CollectionPhoto = Table<"collection_photo">
export type TripMember = Table<"trip_member">
export type GetOrgUsers = Function<"get_organisation_users">
export type Person = GetOrgUsers["Returns"][number]

export type Role = Database["public"]["Enums"]["org_user_types"]

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
  OWNER = "Owner",
}
