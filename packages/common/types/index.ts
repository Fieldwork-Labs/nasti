import { Database, TablesInsert, TablesUpdate } from "./database"

type Table<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]
type Function<T extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][T]

export type Organisation = Table<"organisation">
export type Invitation = Table<"invitation">
export type Species = Table<"species">
export type TripSpecies = Table<"trip_species">
export type SpeciesPhoto = Table<"species_photo"> & {
  source_type: "upload" | "collection_photo" | "ala"
}

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
export type UpdateCollection = TablesUpdate<"collection"> & {
  id: string
  location: string
}

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

export type UpdateScoutingNote = TablesUpdate<"scouting_notes"> & {
  id: string
  location: string
}

export type ScoutingNotePhoto = Table<"scouting_notes_photos">

export type TripMember = Table<"trip_member">
export type GetOrgUsers = Function<"get_organisation_users">
export type Person = GetOrgUsers["Returns"][number]

type Enums = Database["public"]["Enums"]
export type Role = Enums["org_user_types"]

export enum ROLE {
  ADMIN = "Admin",
  MEMBER = "Member",
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

// Treatment (batch treatment/processing events)
export type Treatment = Omit<Table<"treatments">, "treat"> & {
  treat: string[]
}
// Aliases for backward compat
export type BatchTreating = Treatment
export type BatchProcessing = Treatment

export type BatchCustody = Table<"batch_custody">
export type BatchSplit = Table<"batch_splits">
export type BatchMerge = Table<"batch_merges">
export type BatchStorage = Table<"batch_storage">
export type StorageLocation = Table<"storage_locations">

// Sub-batches
export type SubBatch = Table<"sub_batches">

// Cleaning
export type BatchCleaning = Table<"batch_cleaning">
export type BatchCleaningOutput = Table<"batch_cleaning_output">

export type BatchTreatType = Enums["batch_treatment_type"]
// Keep old name as alias
export type BatchProcessType = BatchTreatType
export type BatchQuality = Enums["batch_quality"]

// Material types for cleaning
export type MaterialType = "seed" | "covering_structure"
export const MATERIAL_SUBTYPES = [
  "pod",
  "floret",
  "capsule",
  "achene",
  "drupe",
  "berry",
  "nut",
  "samara",
  "caryopsis",
  "other",
] as const
export type MaterialSubtype = (typeof MATERIAL_SUBTYPES)[number]

// Test Types
export type Test = Table<"tests">

// Quality Test Types
export type QualityTestType = "x-ray" | "cut test" | "tz" | "germination"

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
  relative_humidity_percent?: number
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

// Testing Organisation Types
export type OrganisationType = Enums["organisation_type"]
export type OrganisationLink = Table<"organisation_link">
export type OrganisationLinkRequest = Table<"organisation_link_request">
export type BatchTestingAssignment = Table<"batch_testing_assignment">

// Extended types with joined data
export type OrganisationLinkWithName = OrganisationLink & {
  testing_org: { name: string }
}

export type OrganisationLinkRequestWithName = OrganisationLinkRequest & {
  testing_org: { name: string }
}
