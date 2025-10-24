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
  location: string
}
// TablesUpdate includes the id field as optional but it should really be requirec
export type UpdateCollection = TablesUpdate<"collection"> & { id: string }

export type CollectionPhoto = Table<"collection_photo">
export type TripMember = Table<"trip_member">
export type GetOrgUsers = Function<"get_organisation_users">
export type Person = GetOrgUsers["Returns"][number]

type Enums = Database["public"]["Enums"]
export type Role = Enums["org_user_types"]

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
  OWNER = "Owner",
}

export type Batch = Table<"batches">
export type BatchProcessing = Table<"batch_processing">
export type BatchCustody = Table<"batch_custody">
export type BatchSplit = Table<"batch_splits">
export type BatchMerge = Table<"batch_merges">
export type BatchStorage = Table<"batch_storage">
export type StorageLocation = Table<"storage_locations">
export type Treatment = Table<"treatments">
export type Test = Table<"tests">

export type BatchProcessType = Enums["batch_process_type"]
export type BatchQuality = Enums["batch_quality"]
