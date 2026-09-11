alter table public.collection
  add column material_type text[] not null default '{}'::text[],
  add constraint collection_material_type_values check (
    material_type <@ array['seed', 'capsules_pods_fruit', 'branches_stems']::text[]
  );

create index collection_material_type_idx on public.collection using gin (material_type);

comment on column public.collection.material_type is
  'What plant material was collected. Any combination of seed, capsules_pods_fruit, branches_stems. Used to pre-fill the cleaning form.';
