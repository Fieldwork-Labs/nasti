-- Combined batches: species, cleaning, listing
--
-- fn_combine_batches (previous migration) creates a batch that has no single
-- collection. Everything that read a batch's species or cleaned it through its
-- collection needs a second way to find them:
--
--   * batches.species_id holds the species of a batch that has no collection of
--     its own — a combined batch, and what cleaning it produces. A batch that
--     does have a collection keeps taking its species from that collection, so
--     correcting a collection's species is never left stale on its batches.
--   * fn_clean_batch cleans a combined batch, numbering its outputs from the
--     batch's own code.
--   * active_batches and the species policy read the species from either place.

ALTER TABLE public.batches
  ADD COLUMN species_id uuid REFERENCES public.species(id);

COMMENT ON COLUMN public.batches.species_id IS
  'Species of a batch with no collection of its own (a combined batch and its cleaning outputs). NULL when collection_id is set: the collection is then the source of truth.';

CREATE INDEX batches_species_id_idx ON public.batches USING btree (species_id)
  WHERE species_id IS NOT NULL;

-- Redefined from the previous migration to record the species.
CREATE OR REPLACE FUNCTION public.fn_combine_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_count integer;
  v_org uuid;
  v_species_count integer;
  v_species_id uuid;
  v_species_unknown boolean;
  v_ibra_count integer;
  v_ibra_unknown boolean;
  v_oldest_collected_at timestamptz;
  v_code text;
  v_new_id uuid;
BEGIN
  v_source_count := COALESCE(array_length(p_source_batch_ids, 1), 0);

  IF v_source_count < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to combine';
  END IF;

  -- count(DISTINCT) skips NULLs, so this also rejects a NULL id
  IF (SELECT count(DISTINCT s.id) FROM unnest(p_source_batch_ids) AS s(id)) <> v_source_count THEN
    RAISE EXCEPTION 'Each source batch can only be combined once';
  END IF;

  -- Authorise before looking at anything else, so a caller learns nothing about
  -- batches that are not theirs. This also rejects ids that are not batches.
  IF EXISTS (
    SELECT 1
    FROM unnest(p_source_batch_ids) AS s(id)
    WHERE NOT public.is_current_custodian(auth.uid(), s.id)
  ) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the organisation that holds every source batch';
  END IF;

  v_org := assert_same_custodian(p_source_batch_ids);

  -- Two people combining the same batch at once must not both succeed: each
  -- would consume it into a different new batch.
  PERFORM 1
  FROM batches b
  WHERE b.id = ANY (p_source_batch_ids)
  ORDER BY b.id
  FOR UPDATE;

  -- Unprocessed: still the batch a collection created, with no weight, no bags
  -- and no cleaning recorded against it.
  IF EXISTS (
    SELECT 1
    FROM batches b
    WHERE b.id = ANY (p_source_batch_ids)
      AND (
        b.collection_id IS NULL
        OR b.weight_grams IS NOT NULL
        OR EXISTS (SELECT 1 FROM sub_batches sb WHERE sb.batch_id = b.id)
        OR EXISTS (SELECT 1 FROM batch_cleaning bc WHERE bc.input_batch_id = b.id)
      )
  ) THEN
    RAISE EXCEPTION 'Only batches that have not been cleaned can be combined';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_merges bm
    WHERE bm.source_batch_id = ANY (p_source_batch_ids)
  ) THEN
    RAISE EXCEPTION 'A source batch has already been combined or merged into another batch';
  END IF;

  -- Species and IBRA region must be identical. A missing species, or a region
  -- the location does not resolve to, cannot be shown to match anything, so it
  -- blocks the combine rather than counting as one more value.
  WITH source AS (
    SELECT
      c.species_id,
      c.created_at,
      public.get_ibra_code_from_location(c.location) AS ibra_code
    FROM batches b
    JOIN collection c ON c.id = b.collection_id
    WHERE b.id = ANY (p_source_batch_ids)
  )
  SELECT
    count(DISTINCT species_id),
    (array_agg(species_id))[1],
    bool_or(species_id IS NULL),
    count(DISTINCT ibra_code),
    bool_or(ibra_code = 'UNK'),
    min(created_at)
  INTO
    v_species_count,
    v_species_id,
    v_species_unknown,
    v_ibra_count,
    v_ibra_unknown,
    v_oldest_collected_at
  FROM source;

  IF v_species_unknown OR v_species_count <> 1 THEN
    RAISE EXCEPTION 'All batches must be of the same species to combine';
  END IF;

  IF v_ibra_unknown THEN
    RAISE EXCEPTION 'Cannot combine a batch whose IBRA region is unknown';
  END IF;

  IF v_ibra_count <> 1 THEN
    RAISE EXCEPTION 'All batches must be from the same IBRA region to combine';
  END IF;

  -- Codes read SPECIES-ORG.IBRA.YY-N, and species, org and IBRA are the same
  -- across the sources. The combined batch takes the earliest year and, within
  -- it, the first number — which is simply the code of the source that sorts
  -- first. Borrowing a real code rather than assembling one means it can never
  -- match a live batch: that source is consumed here and can no longer be
  -- cleaned, so no outputs will ever be numbered from it again.
  SELECT b.code
  INTO v_code
  FROM batches b
  WHERE b.id = ANY (p_source_batch_ids)
  ORDER BY
    substring(b.code FROM '\.(\d{2})(?:-\d+)?$')::integer NULLS LAST,
    substring(b.code FROM '-(\d+)$')::integer NULLS LAST,
    b.created_at,
    b.id
  LIMIT 1;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Cannot combine batches that have no code';
  END IF;

  -- Dated from the oldest collection, as fn_mix_batches does: seed age counts
  -- from when it was collected, not from when it was pooled.
  INSERT INTO batches (
    id, collection_id, species_id, organisation_id, code, weight_grams, notes, created_at
  ) VALUES (
    gen_random_uuid(), NULL, v_species_id, v_org, v_code, NULL, p_notes, COALESCE(v_oldest_collected_at, now())
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on combine');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, s.id
  FROM unnest(p_source_batch_ids) AS s(id);

  RETURN v_new_id;
END;
$function$
;

-- Redefined to accept a batch with no collection. Such a batch names its own
-- outputs: they are numbered from its code, since there is no collection code to
-- number from, and carry its species, since they have no collection to take it
-- from. For a batch with a collection nothing changes.
CREATE OR REPLACE FUNCTION public.fn_clean_batch(p_input_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_input_code TEXT;
  v_input_species_id UUID;
  v_base_code TEXT;
  v_code_pattern TEXT;
  v_output_species_id UUID;
  v_organisation_id UUID;
  v_sub_batch_count INTEGER;
  v_output JSONB;
  v_quality TEXT;
  v_out_material_type TEXT;
  v_out_weight NUMERIC;
  v_increment INTEGER;
  v_batch_code TEXT;
  v_org_count INTEGER;
BEGIN
  IF p_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  SELECT b.collection_id, b.organisation_id, b.code, b.species_id
  INTO v_collection_id, v_organisation_id, v_input_code, v_input_species_id
  FROM batches b
  WHERE b.id = p_input_batch_id;

  IF v_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found';
  END IF;

  IF v_collection_id IS NULL AND (v_input_species_id IS NULL OR v_input_code IS NULL) THEN
    RAISE EXCEPTION 'Input batch has no collection';
  END IF;

  IF NOT is_current_custodian(auth.uid(), p_input_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
  END IF;

  SELECT COUNT(*) INTO v_sub_batch_count
  FROM sub_batches WHERE batch_id = p_input_batch_id;

  IF v_sub_batch_count > 0 THEN
    RAISE EXCEPTION 'Cannot clean a batch that already has sub-batches. Use fn_clean_sub_batch instead.';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  IF NOT p_is_cleaned THEN
    SELECT COUNT(*)
    INTO v_org_count
    FROM jsonb_array_elements(p_outputs) AS o
    WHERE o->>'quality' != 'ORG';

    IF v_org_count > 0 THEN
      RAISE EXCEPTION 'When not cleaned, only ORG quality output is allowed';
    END IF;
  END IF;

  IF v_collection_id IS NOT NULL THEN
    SELECT code INTO v_base_code
    FROM "collection"
    WHERE id = v_collection_id;

    IF v_base_code IS NULL THEN
      RAISE EXCEPTION 'Collection not found or has no code';
    END IF;
  ELSE
    v_base_code := v_input_code;
    v_output_species_id := v_input_species_id;
  END IF;

  v_code_pattern := regexp_replace(v_base_code, '[.*+?^${}()|[\]\\]', '\\\&', 'g');

  INSERT INTO batch_cleaning (
    input_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    worker_ids, duration, created_by, organisation_id
  ) VALUES (
    p_input_batch_id, p_material_type, p_material_subtype,
    p_material_notes, p_is_cleaned, p_cleaning_notes,
    COALESCE(p_worker_ids, '{}'::UUID[]), p_duration,
    auth.uid(), v_organisation_id
  )
  RETURNING id INTO v_cleaning_id;

  FOR v_output IN SELECT * FROM jsonb_array_elements(p_outputs)
  LOOP
    v_quality := v_output->>'quality';
    v_out_material_type := v_output->>'material_type';
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;

    SELECT COALESCE(MAX(
      CASE
        WHEN code ~ ('^' || v_code_pattern || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE (v_collection_id IS NOT NULL AND collection_id = v_collection_id)
       OR (v_collection_id IS NULL AND collection_id IS NULL AND organisation_id = v_organisation_id);

    v_batch_code := v_base_code || '-' || v_quality || '-' || v_increment::TEXT;

    INSERT INTO batches (
      collection_id, species_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_output_species_id, v_batch_code, v_out_weight, v_organisation_id
    )
    RETURNING id INTO v_output_batch_id;

    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (v_output_batch_id, v_organisation_id, 'Batch created via cleaning');

    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  RETURN v_cleaning_id;
END;
$function$
;

-- A batch's species is its collection's, or its own when it has no collection.
-- species_name is new (appended, so existing columns keep their order): the
-- species can no longer be embedded through collection_id for every batch.
create or replace view "public"."active_batches" as  WITH computed AS (
         SELECT DISTINCT b.id,
            b.collection_id,
            b.organisation_id,
            b.created_at,
            b.weight_grams,
            b.notes,
            b.code,
            bcw.original_weight,
            bcw.current_weight,
            cbs.location_id AS current_location_id,
            COALESCE(c.species_id, b.species_id) AS species_id,
            s.name AS species_name,
            ( WITH RECURSIVE ancestors AS (
                         SELECT batch_lineage.batch_id,
                            batch_lineage.parent_batch_id,
                            batch_lineage.event_details,
                            batch_lineage.creation_event
                           FROM public.batch_lineage
                          WHERE (batch_lineage.batch_id = b.id)
                        UNION
                         SELECT bl.batch_id,
                            bl.parent_batch_id,
                            bl.event_details,
                            bl.creation_event
                           FROM (public.batch_lineage bl
                             JOIN ancestors a ON (((bl.batch_id = a.parent_batch_id) OR ((a.creation_event = 'merge'::text) AND (bl.batch_id IN ( SELECT (jsonb_array_elements_text((a.event_details -> 'source_batch_ids'::text)))::uuid AS jsonb_array_elements_text))))))
                        )
                 SELECT (EXISTS ( SELECT 1
                           FROM ancestors
                          WHERE (ancestors.creation_event = 'treating'::text))) AS "exists") AS is_treated,
            ((EXISTS ( SELECT 1
                   FROM public.batch_cleaning_output bco
                  WHERE (bco.output_batch_id = b.id))) OR (EXISTS ( WITH RECURSIVE ancestors AS (
                         SELECT batch_lineage.batch_id,
                            batch_lineage.parent_batch_id,
                            batch_lineage.creation_event
                           FROM public.batch_lineage
                          WHERE (batch_lineage.batch_id = b.id)
                        UNION
                         SELECT bl.batch_id,
                            bl.parent_batch_id,
                            bl.creation_event
                           FROM (public.batch_lineage bl
                             JOIN ancestors a ON ((bl.batch_id = a.parent_batch_id)))
                        )
                 SELECT 1
                   FROM (ancestors anc
                     JOIN public.batch_cleaning bc ON ((bc.input_batch_id = anc.batch_id)))))) AS is_cleaned,
            COALESCE(( SELECT t.statistics
                   FROM public.tests t
                  WHERE ((t.batch_id = b.id) AND (t.type = 'quality'::text) AND (t.statistics IS NOT NULL))
                  ORDER BY t.tested_at DESC
                 LIMIT 1), ( SELECT t.statistics
                   FROM public.tests t
                  WHERE ((t.batch_id = ( SELECT batch_lineage.parent_batch_id
                           FROM public.batch_lineage
                          WHERE ((batch_lineage.batch_id = b.id) AND (batch_lineage.creation_event = 'split'::text)))) AND (t.type = 'quality'::text) AND (t.statistics IS NOT NULL))
                  ORDER BY t.tested_at DESC
                 LIMIT 1), public.get_merged_batch_inherited_statistics(b.id)) AS latest_quality_statistics
           FROM ((((public.batches b
             JOIN public.batch_current_weight bcw ON ((bcw.id = b.id)))
             LEFT JOIN public.collection c ON ((c.id = b.collection_id)))
             LEFT JOIN public.species s ON ((s.id = COALESCE(c.species_id, b.species_id))))
             LEFT JOIN LATERAL ( SELECT current_batch_storage.location_id
                   FROM public.current_batch_storage
                  WHERE (current_batch_storage.batch_id = b.id)
                  ORDER BY current_batch_storage.stored_at DESC
                 LIMIT 1) cbs ON (true))
          WHERE ((bcw.current_weight > (0)::numeric) OR (bcw.current_weight IS NULL))
        )
 SELECT computed.id,
    computed.collection_id,
    computed.organisation_id,
    computed.created_at,
    computed.weight_grams,
    computed.notes,
    computed.code,
    computed.original_weight,
    computed.current_weight,
    computed.current_location_id,
    computed.species_id,
    computed.is_treated,
    computed.is_cleaned,
    computed.latest_quality_statistics,
    computed.species_name
   FROM computed
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning bc
          WHERE (bc.input_batch_id = computed.id))));

ALTER VIEW public.active_batches SET (security_invoker = true);

-- A laboratory holding a bag may read the species of what is in it. That used to
-- be reachable only through the batch's collection; a batch with no collection
-- carries its species itself.
ALTER POLICY "species_select" ON public.species
  USING (
    (organisation_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id))
    OR (EXISTS ( SELECT 1
       FROM (public.collection c
         JOIN public.batches b ON ((b.collection_id = c.id)))
      WHERE ((c.species_id = species.id) AND public.holds_any_bag_of_batch(b.id))))
    OR (EXISTS ( SELECT 1
       FROM public.batches b
      WHERE ((b.species_id = species.id) AND public.holds_any_bag_of_batch(b.id))))
  );
