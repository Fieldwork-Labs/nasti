import type {
  Collection,
  ScoutingNote,
  Species,
  Trip,
  TripMember,
} from "@nasti/common/types"
import type {
  PowerSyncCollectionRow,
  PowerSyncScoutingNoteRow,
  PowerSyncSpeciesRow,
  PowerSyncTripMemberRow,
  PowerSyncTripRow,
} from "./schema"

function sqliteBoolean(value: number | null | undefined): boolean | null {
  if (value === null || value === undefined) return null
  return Boolean(value)
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function rowToTrip(row: PowerSyncTripRow): Trip {
  return {
    ...row,
    metadata: parseJson(row.metadata, null),
  } as unknown as Trip
}

export function rowToTripMember(row: PowerSyncTripMemberRow): TripMember {
  return row as unknown as TripMember
}

export function rowToSpecies(row: PowerSyncSpeciesRow): Species {
  return row as unknown as Species
}

export function rowToCollection(row: PowerSyncCollectionRow): Collection {
  return {
    ...row,
    species_uncertain: Boolean(row.species_uncertain),
    specimen_collected: sqliteBoolean(row.specimen_collected),
  } as unknown as Collection
}

export function rowToScoutingNote(
  row: PowerSyncScoutingNoteRow,
): ScoutingNote {
  return {
    ...row,
    species_uncertain: Boolean(row.species_uncertain),
    specimen_collected: sqliteBoolean(row.specimen_collected),
  } as unknown as ScoutingNote
}
