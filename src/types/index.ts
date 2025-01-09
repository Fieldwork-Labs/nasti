import { Database } from "./database"

type Table<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
type Function<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]

export type Organisation = Table<"organisation">
export type Invitation = Table<"invitation">
export type Species = Table<"species">
export type TripSpecies = Table<"trip_species">
export type Trip = Table<"trip"> & { location_coordinate: string | null }
export type TripWithCoordinates = Trip & {
  longitude: number
  latitude: number
}

export const isTripWithCoordinates = (
  trip: Trip | TripWithCoordinates,
): trip is TripWithCoordinates => {
  return "longitude" in trip && "latitude" in trip
}

export type TripMember = Table<"trip_member">
export type GetOrgUsers = Function<"get_organisation_users">

export type Role = "Admin" | "Member" | "Owner"

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
  OWNER = "Owner",
}
