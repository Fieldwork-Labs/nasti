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
export type ActiveBatch = Omit<
  Database["public"]["Views"]["active_batches"]["Row"],
  "latest_quality_statistics" | "organisation_id" | "id"
> & {
  id: string
  organisation_id: string
  latest_quality_statistics: QualityTestCalculations | null
}
export type BatchProcessing = Omit<Table<"batch_processing">, "process"> & {
  process: string[]
}
export type BatchCustody = Table<"batch_custody">
export type BatchSplit = Table<"batch_splits">
export type BatchMerge = Table<"batch_merges">
export type BatchStorage = Table<"batch_storage">
export type StorageLocation = Table<"storage_locations">
export type Treatment = Table<"treatments">

export type BatchProcessType = Enums["batch_process_type"]
export type BatchQuality = Enums["batch_quality"]

// Test Types
export type Test = Table<"tests">

// Quality Test Types
export type QualityTestType =
  | "x-ray"
  | "cut test"
  | "tz"
  | "slow purity"
  | "quick purity"

export interface QualityTestRepeat {
  weight_grams: number
  viable_seed_count: number
  dead_seed_count: number
}

export interface QualityTestResult {
  test_type: QualityTestType
  psu_grams: number
  inert_seed_weight_grams?: number
  other_species_seeds_grams?: number
  relative_humidity_percent: number
  repeats: QualityTestRepeat[]
  notes?: string
}

export interface QualityTestCalculations {
  tpsu: number
  psu: number
  vsu: number
  pls: number
  plsCount: number
  psuCount: number
  standardError: number
  repeat_count: number
}

type QualityTestStatistics = {
  pls: number
  psu: number
  vsu: number
  tpsu: number
  plsCount: number
  psuCount: number
  standardError: number
}

export type QualityTest = Omit<Table<"tests">, "result" | "statistics"> & {
  type: "quality"
  result: QualityTestResult
  statistics: QualityTestStatistics
}
