import { column, Schema, Table } from "@powersync/web"

const trip = new Table(
  {
    created_at: column.text,
    created_by: column.text,
    end_date: column.text,
    location_coordinate: column.text,
    location_name: column.text,
    metadata: column.text,
    name: column.text,
    organisation_id: column.text,
    start_date: column.text,
  },
  {
    indexes: {
      organisation: ["organisation_id"],
      name: ["name"],
    },
  },
)

const trip_member = new Table(
  {
    joined_at: column.text,
    role: column.text,
    trip_id: column.text,
    user_id: column.text,
  },
  {
    indexes: {
      trip: ["trip_id"],
      user: ["user_id"],
    },
  },
)

const species = new Table(
  {
    ala_guid: column.text,
    created_at: column.text,
    description: column.text,
    indigenous_name: column.text,
    name: column.text,
    organisation_id: column.text,
  },
  {
    indexes: {
      organisation: ["organisation_id"],
      name: ["name"],
    },
  },
)

const trip_species = new Table(
  {
    species_id: column.text,
    trip_id: column.text,
  },
  {
    indexes: {
      trip: ["trip_id"],
      species: ["species_id"],
    },
  },
)

const collection = new Table(
  {
    amount_quantity: column.real,
    amount_units: column.text,
    code: column.text,
    collected_by: column.text,
    collected_on: column.text,
    created_at: column.text,
    created_by: column.text,
    description: column.text,
    field_name: column.text,
    location: column.text,
    organisation_id: column.text,
    species_id: column.text,
    species_uncertain: column.integer,
    specimen_collected: column.integer,
    trip_id: column.text,
    phenology_start: column.real,
    phenology_peak: column.real,
    phenology_end: column.real,
  },
  {
    indexes: {
      trip: ["trip_id"],
      species: ["species_id"],
      organisation: ["organisation_id"],
      created_at: ["created_at"],
    },
  },
)

const collection_photo = new Table(
  {
    caption: column.text,
    collection_id: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  {
    indexes: {
      collection: ["collection_id"],
    },
  },
)

const collection_audio = new Table(
  {
    caption: column.text,
    collection_id: column.text,
    duration_ms: column.integer,
    mime_type: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  {
    indexes: {
      collection: ["collection_id"],
    },
  },
)

const scouting_notes = new Table(
  {
    created_at: column.text,
    created_by: column.text,
    description: column.text,
    field_name: column.text,
    location: column.text,
    organisation_id: column.text,
    species_id: column.text,
    species_uncertain: column.integer,
    specimen_collected: column.integer,
    trip_id: column.text,
    phenology_start: column.real,
    phenology_peak: column.real,
    phenology_end: column.real,
  },
  {
    indexes: {
      trip: ["trip_id"],
      species: ["species_id"],
      organisation: ["organisation_id"],
      created_at: ["created_at"],
    },
  },
)

const scouting_notes_photos = new Table(
  {
    caption: column.text,
    scouting_notes_id: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  {
    indexes: {
      scouting_notes: ["scouting_notes_id"],
    },
  },
)

const scouting_notes_audio = new Table(
  {
    caption: column.text,
    scouting_notes_id: column.text,
    duration_ms: column.integer,
    mime_type: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  {
    indexes: {
      scouting_notes: ["scouting_notes_id"],
    },
  },
)

const species_photo = new Table(
  {
    caption: column.text,
    display_order: column.integer,
    organisation_id: column.text,
    source_reference: column.text,
    source_type: column.text,
    species_id: column.text,
    uploaded_at: column.text,
    url: column.text,
  },
  {
    indexes: {
      organisation: ["organisation_id"],
      species: ["species_id"],
    },
  },
)

const sync_failures = new Table(
  {
    target_table: column.text,
    entity_id: column.text,
    op_type: column.text,
    op_data: column.text,
    error_info: column.text,
    failed_at: column.text,
    classification: column.text,
  },
  {
    localOnly: true,
    indexes: {
      entity: ["entity_id"],
      table_entity: ["target_table", "entity_id"],
    },
  },
)

export const AppSchema = new Schema({
  trip,
  trip_member,
  species,
  trip_species,
  collection,
  collection_photo,
  collection_audio,
  scouting_notes,
  scouting_notes_photos,
  scouting_notes_audio,
  species_photo,
  sync_failures,
})

export type PowerSyncAppDatabase = (typeof AppSchema)["types"]
export type PowerSyncTripRow = PowerSyncAppDatabase["trip"]
export type PowerSyncTripMemberRow = PowerSyncAppDatabase["trip_member"]
export type PowerSyncSpeciesRow = PowerSyncAppDatabase["species"]
export type PowerSyncTripSpeciesRow = PowerSyncAppDatabase["trip_species"]
export type PowerSyncCollectionRow = PowerSyncAppDatabase["collection"]
export type PowerSyncCollectionPhotoRow =
  PowerSyncAppDatabase["collection_photo"]
export type PowerSyncCollectionAudioRow =
  PowerSyncAppDatabase["collection_audio"]
export type PowerSyncScoutingNoteRow = PowerSyncAppDatabase["scouting_notes"]
export type PowerSyncScoutingNotePhotoRow =
  PowerSyncAppDatabase["scouting_notes_photos"]
export type PowerSyncScoutingNoteAudioRow =
  PowerSyncAppDatabase["scouting_notes_audio"]
export type PowerSyncSpeciesPhotoRow = PowerSyncAppDatabase["species_photo"]
