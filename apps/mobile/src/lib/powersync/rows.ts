import type {
  Collection,
  Person,
  ScoutingNote,
  Species,
  Trip,
  TripMember,
} from "@nasti/common/types"
import type {
  PowerSyncCollectionRow,
  PowerSyncPersonRow,
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

function parseUuidArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : []
  } catch {
    if (value === "{}") return []
    if (value.startsWith("{") && value.endsWith("}")) {
      return value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
    }
    return []
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
    person_ids: parseUuidArray(row.person_ids),
  } as unknown as Collection
}

export function rowToScoutingNote(row: PowerSyncScoutingNoteRow): ScoutingNote {
  return {
    ...row,
    species_uncertain: Boolean(row.species_uncertain),
    specimen_collected: sqliteBoolean(row.specimen_collected),
    person_ids: parseUuidArray(row.person_ids),
  } as unknown as ScoutingNote
}

export function rowToPerson(row: PowerSyncPersonRow): Person {
  return {
    ...row,
    is_active: Boolean(row.is_active),
  } as unknown as Person
}
