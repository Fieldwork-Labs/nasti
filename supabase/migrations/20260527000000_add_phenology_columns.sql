alter table public.collection
  add column phenology_start integer null,
  add column phenology_end integer null,
  add constraint collection_phenology_start_range
    check (phenology_start is null or phenology_start between -100 and 100),
  add constraint collection_phenology_end_range
    check (phenology_end is null or phenology_end between -100 and 100),
  add constraint collection_phenology_range_order
    check (
      phenology_start is null
      or phenology_end is null
      or phenology_start <= phenology_end
    );

alter table public.scouting_notes
  add column phenology_start integer null,
  add column phenology_end integer null,
  add constraint scouting_notes_phenology_start_range
    check (phenology_start is null or phenology_start between -100 and 100),
  add constraint scouting_notes_phenology_end_range
    check (phenology_end is null or phenology_end between -100 and 100),
  add constraint scouting_notes_phenology_range_order
    check (
      phenology_start is null
      or phenology_end is null
      or phenology_start <= phenology_end
    );
