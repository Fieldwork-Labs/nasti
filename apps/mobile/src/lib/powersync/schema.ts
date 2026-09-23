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
    duration: column.text,
    field_name: column.text,
    location: column.text,
    material_type: column.text,
    organisation_id: column.text,
    species_id: column.text,
    species_uncertain: column.integer,
    specimen_collected: column.integer,
    trip_id: column.text,
    phenology_start: column.real,
    phenology_peak: column.real,
    phenology_end: column.real,
    person_ids: column.text,
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
    person_ids: column.text,
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

const person = new Table(
  {
    created_at: column.text,
    display_name: column.text,
    email: column.text,
    is_active: column.integer,
    job_role: column.text,
    organisation_id: column.text,
    personnel_id: column.text,
    source_type: column.text,
    updated_at: column.text,
    user_id: column.text,
  },
  {
    indexes: {
      organisation: ["organisation_id"],
      source: ["source_type"],
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
    retry_count: column.integer,
  },
  {
    localOnly: true,
    indexes: {
      entity: ["entity_id"],
      table_entity: ["target_table", "entity_id"],
    },
  },
)

// Retry jobs for failed remote row deletes. These never enter PowerSync CRUD:
// the target row may already be absent locally after the original DELETE.
const row_delete_retry_jobs = new Table(
  {
    target_table: column.text,
    entity_id: column.text,
    status: column.text,
    attempt_count: column.integer,
    next_attempt_at: column.text,
    created_at: column.text,
    last_error: column.text,
    notice_dismissed: column.integer,
    lease_expires_at: column.text,
  },
  {
    localOnly: true,
    indexes: {
      status_due: ["status", "next_attempt_at"],
      entity: ["target_table", "entity_id"],
    },
  },
)

// Local-only work records: media bytes remain in the legacy image/audio stores
// until the user or an explicit retention policy deletes them.
const media_upload_jobs = new Table(
  {
    kind: column.text,
    operation: column.text,
    table_name: column.text,
    bucket: column.text,
    path: column.text,
    mime_type: column.text,
    status: column.text,
    attempt_count: column.integer,
    next_attempt_at: column.text,
    created_at: column.text,
  },
  {
    localOnly: true,
    indexes: {
      status_due: ["status", "next_attempt_at"],
      kind: ["kind"],
    },
  },
)

const media_upload_failures = new Table(
  {
    kind: column.text,
    bucket: column.text,
    path: column.text,
    status_code: column.integer,
    safe_message: column.text,
    failed_at: column.text,
    app_version: column.text,
  },
  {
    localOnly: true,
    indexes: {
      kind: ["kind"],
      failed_at: ["failed_at"],
    },
  },
)

const media_migrations = new Table(
  {
    completed_at: column.text,
  },
  { localOnly: true },
)

// A durable, transactionally claimed owner for the device's shared local DB.
// The row's fixed id makes ownership a single-writer claim across app tabs.
const local_data_owner = new Table(
  {
    owner_id: column.text,
    created_at: column.text,
  },
  { localOnly: true },
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
  person,
  sync_failures,
  row_delete_retry_jobs,
  media_upload_jobs,
  media_upload_failures,
  media_migrations,
  local_data_owner,
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
export type PowerSyncPersonRow = PowerSyncAppDatabase["person"]
export type PowerSyncMediaUploadJobRow =
  PowerSyncAppDatabase["media_upload_jobs"]
