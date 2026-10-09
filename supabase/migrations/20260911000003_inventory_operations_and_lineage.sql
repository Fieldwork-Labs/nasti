-- Inventory operations and lineage
--
-- Final RPCs and read models for custody, storage, cleaning, splitting,
-- merging, treatment, weight accounting, and structured lineage.

set check_function_bodies = off;

drop function if exists "public"."generate_collection_code"(p_species_id uuid, p_field_name text, p_organisation_id uuid, p_location public.geography, p_created_at timestamp with time zone);

drop function if exists "public"."get_organisation_users"();

CREATE OR REPLACE FUNCTION public.assert_same_custodian(p_batch_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_org uuid;
BEGIN
  SELECT cbc.organisation_id
  INTO v_org
  FROM current_batch_custody cbc
  JOIN unnest(p_batch_ids) b(id) ON b.id = cbc.batch_id
  GROUP BY cbc.organisation_id
  HAVING count(*) = array_length(p_batch_ids, 1);

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'All source batches must share the same current custodian organisation';
  END IF;
  RETURN v_org;
END;
$function$
;

create or replace view "public"."batch_current_weight" as  SELECT b.id,
    b.weight_grams AS original_weight,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM public.batch_merges bm
              WHERE (bm.source_batch_id = b.id))) THEN (0)::numeric
            WHEN (NOT (EXISTS ( SELECT 1
               FROM public.sub_batches sb
              WHERE (sb.batch_id = b.id)))) THEN NULL::numeric
            ELSE COALESCE(( SELECT sum((sb.weight_grams + COALESCE(( SELECT sum(wa.weight_grams) AS sum
                       FROM public.batch_weight_adjustments wa
                      WHERE (wa.sub_batch_id = sb.id)), (0)::numeric))) AS sum
               FROM public.sub_batches sb
              WHERE ((sb.batch_id = b.id) AND (sb.held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)))), (0)::numeric)
        END AS current_weight
   FROM public.batches b;

CREATE OR REPLACE FUNCTION public.batch_has_externally_held_bags(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.batches b ON b.id = sb.batch_id
    WHERE sb.batch_id = p_batch_id
      AND sb.held_by_org_id IS DISTINCT FROM b.organisation_id
  )
$function$
;

create or replace view "public"."batch_lineage" as  SELECT bs.child_batch_id AS batch_id,
    bs.parent_batch_id,
    'split'::text AS creation_event,
    b.created_at,
    jsonb_build_object('batch_split_id', bs.id, 'weight_grams', b.weight_grams) AS event_details
   FROM (public.batch_splits bs
     JOIN public.batches b ON ((b.id = bs.child_batch_id)))
UNION ALL
 SELECT bm.merged_batch_id AS batch_id,
    NULL::uuid AS parent_batch_id,
    'merge'::text AS creation_event,
    b.created_at,
    jsonb_build_object('batch_merge_ids', jsonb_agg(bm.id ORDER BY bm.created_at), 'source_batch_ids', jsonb_agg(bm.source_batch_id ORDER BY bm.created_at)) AS event_details
   FROM (public.batch_merges bm
     JOIN public.batches b ON ((b.id = bm.merged_batch_id)))
  GROUP BY bm.merged_batch_id, b.created_at
UNION ALL
 SELECT bt.output_batch_id AS batch_id,
    bt.input_batch_id AS parent_batch_id,
    'treating'::text AS creation_event,
    b.created_at,
    jsonb_build_object('treatments_id', bt.id, 'treat', bt."treat", 'quality_assessment', bt.quality_assessment, 'output_weight', b.weight_grams) AS event_details
   FROM (public.treatments bt
     JOIN public.batches b ON ((b.id = bt.output_batch_id)))
UNION ALL
 SELECT bco.output_batch_id AS batch_id,
    bc.input_batch_id AS parent_batch_id,
    'cleaning'::text AS creation_event,
    b.created_at,
    jsonb_build_object('batch_cleaning_id', bc.id, 'cleaning_output_id', bco.id, 'quality', bco.quality, 'material_type', bco.material_type, 'output_weight', bco.weight_grams) AS event_details
   FROM ((public.batch_cleaning bc
     JOIN public.batch_cleaning_output bco ON ((bco.cleaning_id = bc.id)))
     JOIN public.batches b ON ((b.id = bco.output_batch_id)))
UNION ALL
 SELECT b.id AS batch_id,
    NULL::uuid AS parent_batch_id,
    'initial'::text AS creation_event,
    b.created_at,
    jsonb_build_object('collection_id', b.collection_id) AS event_details
   FROM public.batches b
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM public.batch_splits bs
          WHERE (bs.child_batch_id = b.id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_merges bm
          WHERE (bm.merged_batch_id = b.id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.treatments bt
          WHERE (bt.output_batch_id = b.id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning_output bco
          WHERE (bco.output_batch_id = b.id)))));

create or replace view "public"."batch_lineage_to_collections" as  WITH RECURSIVE lineage(batch_id, collection_id) AS (
         SELECT batches.id AS batch_id,
            batches.collection_id
           FROM public.batches
          WHERE (batches.collection_id IS NOT NULL)
        UNION ALL
         SELECT next_batch.batch_id,
            l.collection_id
           FROM (lineage l
             JOIN ( SELECT batch_splits.parent_batch_id AS source_id,
                    batch_splits.child_batch_id AS batch_id
                   FROM public.batch_splits
                UNION ALL
                 SELECT batch_merges.source_batch_id AS source_id,
                    batch_merges.merged_batch_id AS batch_id
                   FROM public.batch_merges
                UNION ALL
                 SELECT treatments.input_batch_id AS source_id,
                    treatments.output_batch_id AS batch_id
                   FROM public.treatments
                  WHERE (treatments.input_batch_id IS NOT NULL)
                UNION ALL
                 SELECT bc.input_batch_id AS source_id,
                    bco.output_batch_id AS batch_id
                   FROM (public.batch_cleaning bc
                     JOIN public.batch_cleaning_output bco ON ((bco.cleaning_id = bc.id)))
                  WHERE (bc.input_batch_id IS NOT NULL)) next_batch ON ((next_batch.source_id = l.batch_id)))
        )
 SELECT DISTINCT lineage.batch_id,
    lineage.collection_id
   FROM lineage;

CREATE OR REPLACE FUNCTION public.batch_weight_info(batch_row public.batches)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'original_weight', bcw.original_weight,
    'current_weight', bcw.current_weight
  )
  FROM batch_current_weight bcw
  WHERE bcw.id = batch_row.id;
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_batch(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT public.is_batch_owner(p_batch_id)
      OR public.holds_any_bag_of_batch(p_batch_id)
$function$
;

CREATE OR REPLACE FUNCTION public.can_read_sub_batch(p_sub_batch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.org_user ou
      ON ou.organisation_id = sb.held_by_org_id
    WHERE sb.id = p_sub_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
  OR EXISTS (
    SELECT 1
    FROM public.batch_testing_assignment bta
    INNER JOIN public.org_user ou
      ON ou.organisation_id = bta.assigned_by_org_id
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  );
END;
$function$
;

create or replace view "public"."current_batch_custody" as  SELECT DISTINCT ON (batch_custody.batch_id) batch_custody.batch_id,
    batch_custody.organisation_id,
    batch_custody.received_at
   FROM public.batch_custody
  ORDER BY batch_custody.batch_id, batch_custody.received_at DESC;

create or replace view "public"."current_batch_storage" as  SELECT DISTINCT ON (bs.sub_batch_id) bs.id,
    sb.batch_id,
    bs.sub_batch_id,
    bs.location_id,
    bs.stored_at,
    bs.notes
   FROM (public.batch_storage bs
     JOIN public.sub_batches sb ON ((sb.id = bs.sub_batch_id)))
  WHERE (bs.moved_out_at IS NULL)
  ORDER BY bs.sub_batch_id, bs.stored_at DESC;

CREATE OR REPLACE FUNCTION public.current_custodian_org_id(p_batch_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT cbc.organisation_id
  FROM current_batch_custody cbc
  WHERE cbc.batch_id = p_batch_id
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bag_and_store_cleaning_outputs(p_cleaning_id uuid, p_bags jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_created_ids UUID[];
  v_initial_bag_ids UUID[];
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(bag.id), '{}'::UUID[])
  INTO v_initial_bag_ids
  FROM public.batch_cleaning_output output
  INNER JOIN public.sub_batches bag ON bag.batch_id = output.output_batch_id
  WHERE output.cleaning_id = p_cleaning_id;

  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = ANY (v_initial_bag_ids);

  v_created_ids :=
    public.fn_bag_cleaning_outputs_unclassified(
      p_cleaning_id,
      p_bags
    );

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'cleaning',
    lineage_operation_id = p_cleaning_id
  WHERE adjustment.sub_batch_id = ANY (v_initial_bag_ids)
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != cardinality(v_initial_bag_ids) THEN
    RAISE EXCEPTION 'Bagging must replace each aggregate with one adjustment';
  END IF;

  RETURN v_created_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_bag_cleaning_outputs_unclassified(p_cleaning_id uuid, p_bags jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_organisation_id UUID;
  v_input_sub_batch_id UUID;
  v_output_count INTEGER;
  v_entry_count INTEGER;
  v_existing_sub_batch_count INTEGER;
  v_initial_sub_batch_id UUID;
  v_lineage_source_sub_batch_id UUID;
  v_allocated_weight NUMERIC;
  v_output RECORD;
  v_output_entry JSONB;
  v_container_group JSONB;
  v_container_id UUID;
  v_location_id UUID;
  v_quantity INTEGER;
  v_weight_grams NUMERIC;
  v_sub_batch_id UUID;
  v_container_index INTEGER;
  v_created_ids UUID[] := '{}'::UUID[];
BEGIN
  IF jsonb_typeof(p_bags) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Bagging entries must be an array';
  END IF;

  SELECT bc.organisation_id, bc.input_sub_batch_id
  INTO v_organisation_id, v_input_sub_batch_id
  FROM public.batch_cleaning bc
  WHERE bc.id = p_cleaning_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleaning record not found';
  END IF;

  IF v_organisation_id IS DISTINCT FROM public.get_user_organisation_id() THEN
    RAISE EXCEPTION 'Permission denied: cleaning record belongs to another organisation';
  END IF;

  SELECT count(*)
  INTO v_output_count
  FROM public.batch_cleaning_output
  WHERE cleaning_id = p_cleaning_id;

  IF jsonb_array_length(p_bags) != v_output_count THEN
    RAISE EXCEPTION 'Bagging details are required for every cleaning output';
  END IF;

  FOR v_output IN
    SELECT output_batch_id, weight_grams, quality
    FROM public.batch_cleaning_output
    WHERE cleaning_id = p_cleaning_id
    ORDER BY quality
  LOOP
    IF NOT public.is_current_custodian(auth.uid(), v_output.output_batch_id) THEN
      RAISE EXCEPTION
        'Permission denied: user is not the current custodian of output batch %',
        v_output.output_batch_id;
    END IF;

    SELECT count(*), min(entry.value::TEXT)::JSONB
    INTO v_entry_count, v_output_entry
    FROM jsonb_array_elements(p_bags) entry
    WHERE entry.value->>'output_batch_id' = v_output.output_batch_id::TEXT;

    IF v_entry_count != 1 THEN
      RAISE EXCEPTION 'Exactly one bagging entry is required for output batch %',
        v_output.output_batch_id;
    END IF;

    IF jsonb_typeof(v_output_entry->'containers') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_output_entry->'containers') = 0 THEN
      RAISE EXCEPTION 'At least one container group is required for output batch %',
        v_output.output_batch_id;
    END IF;

    SELECT COALESCE(sum(
      (container_group.value->>'quantity')::INTEGER
      * (container_group.value->>'weight_grams')::NUMERIC
    ), 0)
    INTO v_allocated_weight
    FROM jsonb_array_elements(v_output_entry->'containers') container_group;

    IF v_allocated_weight != v_output.weight_grams THEN
      RAISE EXCEPTION
        'Container weights for output batch % total % g, expected % g',
        v_output.output_batch_id,
        v_allocated_weight,
        v_output.weight_grams;
    END IF;

    SELECT id
    INTO v_initial_sub_batch_id
    FROM public.sub_batches
    WHERE batch_id = v_output.output_batch_id
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    SELECT count(*)
    INTO v_existing_sub_batch_count
    FROM public.sub_batches
    WHERE batch_id = v_output.output_batch_id;

    IF v_existing_sub_batch_count != 1 THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      WHERE sb.id = v_initial_sub_batch_id
        AND sb.container_id IS NULL
        AND sb.weight_grams = v_output.weight_grams
    ) THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.batch_storage bs
      WHERE bs.sub_batch_id = v_initial_sub_batch_id
    ) OR EXISTS (
      SELECT 1
      FROM public.batch_weight_adjustments bwa
      WHERE bwa.sub_batch_id = v_initial_sub_batch_id
    ) OR EXISTS (
      SELECT 1
      FROM public.tests test
      WHERE test.sub_batch_id = v_initial_sub_batch_id
    ) THEN
      RAISE EXCEPTION
        'Output batch % has already been stored, adjusted, or tested',
        v_output.output_batch_id;
    END IF;

    FOR v_container_group IN
      SELECT value
      FROM jsonb_array_elements(v_output_entry->'containers')
    LOOP
      v_container_id := (v_container_group->>'container_id')::UUID;
      v_location_id := NULLIF(v_container_group->>'location_id', '')::UUID;
      v_quantity := (v_container_group->>'quantity')::INTEGER;
      v_weight_grams := (v_container_group->>'weight_grams')::NUMERIC;

      IF v_quantity <= 0 OR v_weight_grams <= 0 THEN
        RAISE EXCEPTION 'Container quantity and weight must be greater than zero';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.containers container
        WHERE container.id = v_container_id
          AND container.organisation_id = v_organisation_id
          AND container.purpose = 'storage'
          AND container.active
      ) THEN
        RAISE EXCEPTION 'Invalid or inactive storage container %', v_container_id;
      END IF;

      IF v_location_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.storage_locations location
        WHERE location.id = v_location_id
          AND location.organisation_id = v_organisation_id
      ) THEN
        RAISE EXCEPTION 'Invalid storage location %', v_location_id;
      END IF;
    END LOOP;

    v_lineage_source_sub_batch_id := COALESCE(
      v_input_sub_batch_id,
      v_initial_sub_batch_id
    );

    INSERT INTO public.batch_weight_adjustments (
      sub_batch_id,
      weight_grams,
      reason,
      created_by
    ) VALUES (
      v_initial_sub_batch_id,
      -v_output.weight_grams,
      'Replaced by physical cleaning-output bags',
      auth.uid()
    );

    FOR v_container_group IN
      SELECT value
      FROM jsonb_array_elements(v_output_entry->'containers')
    LOOP
      v_container_id := (v_container_group->>'container_id')::UUID;
      v_location_id := NULLIF(v_container_group->>'location_id', '')::UUID;
      v_quantity := (v_container_group->>'quantity')::INTEGER;
      v_weight_grams := (v_container_group->>'weight_grams')::NUMERIC;

      FOR v_container_index IN 1..v_quantity
      LOOP
        INSERT INTO public.sub_batches (
          batch_id,
          container_id,
          weight_grams,
          notes
        ) VALUES (
          v_output.output_batch_id,
          v_container_id,
          v_weight_grams,
          'Bagged after cleaning'
        )
        RETURNING id INTO v_sub_batch_id;

        INSERT INTO public.sub_batch_lineage (
          source_sub_batch_id,
          derived_sub_batch_id,
          operation_kind,
          operation_id,
          created_by
        ) VALUES (
          v_lineage_source_sub_batch_id,
          v_sub_batch_id,
          'cleaning',
          p_cleaning_id,
          auth.uid()
        );

        IF v_location_id IS NOT NULL THEN
          INSERT INTO public.batch_storage (
            batch_id,
            sub_batch_id,
            location_id,
            notes
          ) VALUES (
            v_output.output_batch_id,
            v_sub_batch_id,
            v_location_id,
            'Initial storage after cleaning'
          );
        END IF;

        v_created_ids := array_append(v_created_ids, v_sub_batch_id);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_created_ids;
END;
$function$
;

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
  v_collection_code TEXT;
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

  SELECT b.collection_id, b.organisation_id
  INTO v_collection_id, v_organisation_id
  FROM batches b
  WHERE b.id = p_input_batch_id;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found or has no collection';
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

  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

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
        WHEN code ~ ('^' || v_collection_code || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE collection_id = v_collection_id;

    v_batch_code := v_collection_code || '-' || v_quality || '-' || v_increment::TEXT;

    INSERT INTO batches (
      collection_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_batch_code, v_out_weight, v_organisation_id
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

CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch(p_sub_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  v_cleaning_id := public.fn_clean_sub_batch_without_lineage(
    p_sub_batch_id,
    p_duration,
    p_material_type,
    p_material_subtype,
    p_material_notes,
    p_is_cleaned,
    p_cleaning_notes,
    p_worker_ids,
    p_outputs
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    p_sub_batch_id,
    output_bag.id,
    'cleaning',
    v_cleaning_id,
    auth.uid()
  FROM public.batch_cleaning_output output
  INNER JOIN public.sub_batches output_bag
    ON output_bag.batch_id = output.output_batch_id
  WHERE output.cleaning_id = v_cleaning_id;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'cleaning',
    lineage_operation_id = v_cleaning_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != 1 THEN
    RAISE EXCEPTION 'Sub-batch cleaning must create one source adjustment';
  END IF;

  RETURN v_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_clean_sub_batch_without_lineage(p_sub_batch_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_is_cleaned boolean DEFAULT false, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[], p_outputs jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleaning_id UUID;
  v_output_batch_id UUID;
  v_batch_id UUID;
  v_collection_id UUID;
  v_collection_code TEXT;
  v_organisation_id UUID;
  v_sub_batch_weight NUMERIC;
  v_effective_weight NUMERIC;
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

  SELECT sb.batch_id, sb.weight_grams, b.collection_id, b.organisation_id
  INTO v_batch_id, v_sub_batch_weight, v_collection_id, v_organisation_id
  FROM sub_batches sb
  JOIN batches b ON b.id = sb.batch_id
  WHERE sb.id = p_sub_batch_id;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Cleaning consumes the bag entirely, so the gate is bag custody, not batch
  -- ownership: the owner of the parent batch has no business cleaning a bag
  -- that is currently in someone else's hands.
  IF NOT is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  -- Reject rather than resolve. An open assignment is a physical fact about
  -- seed a Testing organisation is holding; consuming the bag would leave that
  -- assignment pointing at material that no longer exists. The software must
  -- not close it unilaterally, and must not move it to a successor bag.
  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    WHERE bta.sub_batch_id = p_sub_batch_id
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot clean a bag with an active testing assignment';
  END IF;

  v_effective_weight := v_sub_batch_weight + COALESCE(
    (SELECT SUM(wa.weight_grams)
     FROM batch_weight_adjustments wa
     WHERE wa.sub_batch_id = p_sub_batch_id),
    0
  );

  IF v_effective_weight <= 0 THEN
    RAISE EXCEPTION 'Sub-batch has no weight remaining';
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

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Parent batch has no collection';
  END IF;

  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  INSERT INTO batch_cleaning (
    input_batch_id, input_sub_batch_id, material_type, material_subtype,
    material_notes, is_cleaned, cleaning_notes,
    worker_ids, duration, created_by, organisation_id
  ) VALUES (
    v_batch_id, p_sub_batch_id, p_material_type, p_material_subtype,
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
        WHEN code ~ ('^' || v_collection_code || '-' || v_quality || '-[0-9]+$')
        THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
        ELSE 0
      END
    ), 0) + 1
    INTO v_increment
    FROM batches
    WHERE collection_id = v_collection_id;

    v_batch_code := v_collection_code || '-' || v_quality || '-' || v_increment::TEXT;

    INSERT INTO batches (
      collection_id, code, weight_grams, organisation_id
    ) VALUES (
      v_collection_id, v_batch_code, v_out_weight, v_organisation_id
    )
    RETURNING id INTO v_output_batch_id;

    INSERT INTO batch_custody (batch_id, organisation_id, notes)
    VALUES (
      v_output_batch_id,
      v_organisation_id,
      'Batch created via sub-batch cleaning'
    );

    INSERT INTO batch_cleaning_output (
      cleaning_id, output_batch_id, quality, material_type, weight_grams
    ) VALUES (
      v_cleaning_id, v_output_batch_id, v_quality, v_out_material_type, v_out_weight
    );

    INSERT INTO sub_batches (batch_id, weight_grams, notes)
    VALUES (v_output_batch_id, v_out_weight, 'Initial sub-batch from cleaning');
  END LOOP;

  INSERT INTO batch_weight_adjustments (
    sub_batch_id, weight_grams, reason, created_by
  ) VALUES (
    p_sub_batch_id,
    -v_effective_weight,
    'Sub-batch cleaned. Fully consumed.',
    auth.uid()
  );

  RETURN v_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_create_origin_batch_for_collection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_collection_code text;
  v_new_batch_id uuid;
BEGIN
  SELECT code INTO v_collection_code
  FROM public.collection
  WHERE id = NEW.id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  PERFORM set_config('nasti.bypass_permission_check', 'on', true);

  -- Origin batch code is the same as the collection code
  INSERT INTO public.batches (code, collection_id, organisation_id)
  VALUES (v_collection_code, NEW.id, NEW.organisation_id)
  RETURNING id INTO v_new_batch_id;

  INSERT INTO public.batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_batch_id, NEW.organisation_id, 'Batch created from collection');

  PERFORM set_config('nasti.bypass_permission_check', 'off', true);

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_default_sub_batch_holder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.held_by_org_id IS NULL THEN
    SELECT b.organisation_id
    INTO NEW.held_by_org_id
    FROM public.batches b
    WHERE b.id = NEW.batch_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_get_container_usage()
 RETURNS TABLE(container_id uuid, collection_count bigint, storage_sub_batch_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    container.id AS container_id,
    count(DISTINCT collection_container.collection_id) AS collection_count,
    count(DISTINCT sub_batch.id) AS storage_sub_batch_count
  FROM public.containers container
  LEFT JOIN public.collection_containers collection_container
    ON collection_container.container_id = container.id
  LEFT JOIN public.sub_batches sub_batch
    ON sub_batch.container_id = container.id
  WHERE container.organisation_id = public.get_user_organisation_id()
  GROUP BY container.id;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_merge_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_batch_code text;
  v_new_id uuid;
  v_same bool;
  v_total_weight numeric;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to merge';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- A whole-batch merge zeroes every source batch, so it has to answer for
  -- every bag in them. Reject rather than resolve: a bag held by another
  -- organisation is physically elsewhere, and an open assignment is a
  -- commitment about seed in someone else's hands. Neither may be consumed
  -- here, and an assignment must never be auto-closed or moved to the merged
  -- batch — if a future workflow needs that, it must do it in this same
  -- transaction and never leave an assignment pointing at deleted material.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot merge a batch with an active testing assignment';
  END IF;

  -- Validate that all batches share the same collection_id
  SELECT COUNT(DISTINCT collection_id) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must be derived from the same collection';
  END IF;

  -- Validate that all batches have the same code
  SELECT COUNT(DISTINCT code) = 1
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All batches must have the same code to be merged';
  END IF;

  -- Get collection_id and code for the new batch
  SELECT DISTINCT collection_id, code
  INTO v_collection, v_batch_code
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  -- Validate all source batches are active and get their current weights
  SELECT
      SUM(bcw.current_weight),
      bool_and(bcw.current_weight > 0)
  INTO
      v_total_weight,
      v_same
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_batch_code,  -- Use shared code from source batches
    v_org,
    v_total_weight,
    p_notes
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on merge');

  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches(p_sub_batch_ids uuid[], p_container_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_destination_id UUID;
  v_operation_id UUID;
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = ANY (p_sub_batch_ids);

  v_destination_id :=
    public.fn_merge_sub_batches_without_adjustment_classification(
      p_sub_batch_ids,
      p_container_id,
      p_location_id,
      p_notes
    );

  SELECT lineage.operation_id
  INTO STRICT v_operation_id
  FROM public.sub_batch_lineage lineage
  WHERE lineage.derived_sub_batch_id = v_destination_id
    AND lineage.operation_kind = 'merge'
  LIMIT 1;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'merge',
    lineage_operation_id = v_operation_id
  WHERE adjustment.sub_batch_id = ANY (p_sub_batch_ids)
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'Merge must create one weight adjustment per source bag';
  END IF;

  RETURN v_destination_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches_without_adjustment_classification(p_sub_batch_ids uuid[], p_container_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_batch_count INTEGER;
  v_holder_count INTEGER;
  v_held_by_org_id UUID;
  v_source_count INTEGER;
  v_organisation_id UUID;
  v_total_weight NUMERIC;
  v_new_sub_batch_id UUID := gen_random_uuid();
  v_operation_id UUID := gen_random_uuid();
  v_merged_at TIMESTAMPTZ := now();
BEGIN
  IF p_sub_batch_ids IS NULL
    OR cardinality(p_sub_batch_ids) < 2 THEN
    RAISE EXCEPTION 'Provide at least two sub-batches to merge';
  END IF;

  IF (
    SELECT count(DISTINCT source_id)
    FROM unnest(p_sub_batch_ids) source_id
  ) != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'Sub-batches to merge must be distinct';
  END IF;

  IF p_container_id IS NULL THEN
    RAISE EXCEPTION 'A destination storage container is required';
  END IF;

  PERFORM sb.id
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids)
  ORDER BY sb.id
  FOR UPDATE;

  GET DIAGNOSTICS v_source_count = ROW_COUNT;

  IF v_source_count != cardinality(p_sub_batch_ids) THEN
    RAISE EXCEPTION 'One or more sub-batches were not found';
  END IF;

  SELECT count(DISTINCT sb.batch_id)
  INTO v_batch_count
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids);

  IF v_batch_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must belong to the same batch';
  END IF;

  SELECT count(DISTINCT sb.held_by_org_id)
  INTO v_holder_count
  FROM public.sub_batches sb
  WHERE sb.id = ANY (p_sub_batch_ids);

  IF v_holder_count != 1 THEN
    RAISE EXCEPTION 'All sub-batches must be held by the same organisation';
  END IF;

  SELECT sb.batch_id, sb.held_by_org_id
  INTO v_batch_id, v_held_by_org_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_ids[1];

  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_ids[1]) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of these bags';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = p_container_id
      AND container.organisation_id = v_organisation_id
      AND container.purpose = 'storage'
      AND container.active
  ) THEN
    RAISE EXCEPTION
      'Invalid or inactive storage container %',
      p_container_id;
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT sum(sbcw.current_weight)
  INTO v_total_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids);

  IF EXISTS (
    SELECT 1
    FROM public.sub_batch_current_weight sbcw
    WHERE sbcw.id = ANY (p_sub_batch_ids)
      AND sbcw.current_weight <= 0
  ) THEN
    RAISE EXCEPTION 'Every source sub-batch must have a positive current weight';
  END IF;

  INSERT INTO public.sub_batches (
    id,
    batch_id,
    container_id,
    weight_grams,
    notes,
    held_by_org_id
  ) VALUES (
    v_new_sub_batch_id,
    v_batch_id,
    p_container_id,
    v_total_weight,
    NULLIF(btrim(p_notes), ''),
    v_held_by_org_id
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    source_id,
    v_new_sub_batch_id,
    'merge',
    v_operation_id,
    auth.uid()
  FROM unnest(p_sub_batch_ids) source_id;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by
  )
  SELECT
    sbcw.id,
    -sbcw.current_weight,
    format('Merged into sub-batch %s', v_new_sub_batch_id),
    auth.uid()
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = ANY (p_sub_batch_ids);

  UPDATE public.batch_storage
  SET moved_out_at = v_merged_at
  WHERE sub_batch_id = ANY (p_sub_batch_ids)
    AND moved_out_at IS NULL;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      v_new_sub_batch_id,
      p_location_id,
      v_merged_at,
      'Storage after sub-batch merge'
    );
  END IF;

  RETURN v_new_sub_batch_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_mix_batches(p_source_batch_ids uuid[], p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_org UUID;
  v_new_id UUID;
  v_total_weight NUMERIC;
  v_species_count INTEGER;
  v_ibra_count INTEGER;
  v_species_id UUID;
  v_oldest_date TIMESTAMPTZ;
  v_all_active BOOLEAN;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to mix';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
  END IF;

  -- Mixing zeroes every source batch, so it has to answer for every bag in
  -- them. Reject rather than resolve: a bag held by another organisation is
  -- physically elsewhere, and an open assignment is a commitment about seed in
  -- someone else's hands. Neither may be consumed here, and an assignment must
  -- never be auto-closed or moved to the mixed batch.
  IF EXISTS (
    SELECT 1
    FROM sub_batches sb
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND sb.held_by_org_id IS DISTINCT FROM v_org
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch whose bags are held by another organisation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM batch_testing_assignment bta
    JOIN sub_batches sb ON sb.id = bta.sub_batch_id
    WHERE sb.batch_id = ANY (p_source_batch_ids)
      AND bta.closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot mix a batch with an active testing assignment';
  END IF;

  -- Validate all batches have the same species
  SELECT COUNT(DISTINCT c.species_id)
  INTO v_species_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_species_count != 1 THEN
    RAISE EXCEPTION 'All batches must be of the same species to mix';
  END IF;

  -- Get the species_id for code generation
  SELECT DISTINCT c.species_id
  INTO v_species_id
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Validate all batches are from the same IBRA region
  SELECT COUNT(DISTINCT get_ibra_code_from_location(c.location))
  INTO v_ibra_count
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  IF v_ibra_count != 1 THEN
    RAISE EXCEPTION 'All batches must be from the same IBRA region to mix';
  END IF;

  -- Validate all source batches are active and get their current weights
  SELECT
    SUM(bcw.current_weight),
    bool_and(bcw.current_weight > 0)
  INTO v_total_weight, v_all_active
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = ANY (p_source_batch_ids);

  IF NOT v_all_active THEN
    RAISE EXCEPTION 'All source batches must be active (current weight > 0)';
  END IF;

  -- Get the oldest collection date
  SELECT MIN(c.created_at)
  INTO v_oldest_date
  FROM batches b
  JOIN collection c ON c.id = b.collection_id
  WHERE b.id = ANY (p_source_batch_ids);

  -- Create new mixed batch (collection_id is NULL since it's a mix of multiple collections)
  INSERT INTO batches (
    id, collection_id, organisation_id, weight_grams, notes, created_at
  ) VALUES (
    gen_random_uuid(), NULL, v_org, v_total_weight, p_notes, v_oldest_date
  )
  RETURNING id INTO v_new_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_new_id, v_org, 'Custody on mix');

  -- Record mix sources using batch_merges table
  INSERT INTO batch_merges (merged_batch_id, source_batch_id)
  SELECT v_new_id, unnest(p_source_batch_ids);

  -- Create initial sub-batch for the mixed batch
  INSERT INTO sub_batches (batch_id, weight_grams, notes)
  VALUES (v_new_id, v_total_weight, 'Initial sub-batch from mix');

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_remove_storage_location(p_location_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_location public.storage_locations%ROWTYPE;
BEGIN
  SELECT location.*
  INTO v_location
  FROM public.storage_locations location
  WHERE location.id = p_location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Storage location not found';
  END IF;

  IF v_location.organisation_id IS DISTINCT FROM
    public.get_user_organisation_id()
    OR public.auth_org_role() IS DISTINCT FROM 'Admin' THEN
    RAISE EXCEPTION 'Permission denied: organisation admin required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.batch_storage storage
    WHERE storage.location_id = p_location_id
  ) THEN
    UPDATE public.storage_locations
    SET active = false
    WHERE id = p_location_id;

    RETURN 'retired';
  END IF;

  DELETE FROM public.storage_locations
  WHERE id = p_location_id;

  RETURN 'deleted';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_set_sub_batch_storage(p_sub_batch_id uuid, p_location_id uuid DEFAULT NULL::uuid, p_effective_at timestamp with time zone DEFAULT now(), p_notes text DEFAULT NULL::text)
 RETURNS public.batch_storage
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_current_storage public.batch_storage%ROWTYPE;
  v_result public.batch_storage%ROWTYPE;
BEGIN
  IF p_sub_batch_id IS NULL THEN
    RAISE EXCEPTION 'A sub-batch is required';
  END IF;

  IF p_effective_at IS NULL THEN
    RAISE EXCEPTION 'An effective storage time is required';
  END IF;

  -- Serialize every transition for the sub-batch. The open-row unique index is
  -- a final invariant guard for direct or concurrent writes.
  SELECT sb.batch_id
  INTO v_batch_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  -- Storage is a statement about where a physical bag is, so only whoever
  -- holds it may make one. The owner of the parent batch must not be able to
  -- shelve or move a bag that is currently in a Testing organisation's hands.
  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  IF v_current_weight IS NULL OR v_current_weight <= 0 THEN
    RAISE EXCEPTION 'Only a positive-weight sub-batch can be stored';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.storage_locations location
    WHERE location.id = p_location_id
      AND location.organisation_id = v_organisation_id
  ) THEN
    RAISE EXCEPTION 'Invalid storage location %', p_location_id;
  END IF;

  SELECT storage.*
  INTO v_current_storage
  FROM public.batch_storage storage
  WHERE storage.sub_batch_id = p_sub_batch_id
    AND storage.moved_out_at IS NULL
  FOR UPDATE;

  IF NOT FOUND AND p_location_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch is not currently stored';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND p_location_id = v_current_storage.location_id THEN
    RAISE EXCEPTION 'Sub-batch is already stored at this location';
  END IF;

  IF v_current_storage.id IS NOT NULL
    AND v_current_storage.stored_at IS NOT NULL
    AND p_effective_at < v_current_storage.stored_at THEN
    RAISE EXCEPTION
      'Effective storage time cannot be before the current storage start';
  END IF;

  IF v_current_storage.id IS NOT NULL THEN
    UPDATE public.batch_storage
    SET
      moved_out_at = p_effective_at,
      notes = CASE
        WHEN p_location_id IS NULL THEN p_notes
        ELSE notes
      END
    WHERE id = v_current_storage.id
    RETURNING * INTO v_result;
  END IF;

  IF p_location_id IS NOT NULL THEN
    INSERT INTO public.batch_storage (
      batch_id,
      sub_batch_id,
      location_id,
      stored_at,
      notes
    ) VALUES (
      v_batch_id,
      p_sub_batch_id,
      p_location_id,
      p_effective_at,
      p_notes
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_split_batch(p_parent_batch_id uuid, p_weight_grams numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_parent_code text;
  v_child_id uuid;
  v_parent_current_weight numeric;
  v_child_weight numeric;
BEGIN
  -- Caller must be current custodian of the parent
  v_org := current_custodian_org_id(p_parent_batch_id);
  IF v_org IS NULL OR NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of parent batch';
  END IF;

  -- Get parent batch properties for inheritance
  SELECT
    b.collection_id,
    b.code,
    bcw.current_weight
  INTO
    v_collection,
    v_parent_code,
    v_parent_current_weight
  FROM batches b
  JOIN batch_current_weight bcw ON bcw.id = b.id
  WHERE b.id = p_parent_batch_id;

  IF v_collection IS NULL THEN
    RAISE EXCEPTION 'Parent batch not found';
  END IF;

  -- Validate parent batch is active
  IF v_parent_current_weight IS NULL OR v_parent_current_weight <= 0 THEN
    RAISE EXCEPTION 'Parent batch is not active or has no weight remaining';
  END IF;

  -- Determine child weight (provided or default to half of current weight).
  -- The old GREATEST(1, ...) floor existed because integer division truncated
  -- a 1 g parent to 0; numeric halves exactly, so the floor would now round a
  -- legitimate sub-gram split up to a whole gram.
  v_child_weight := COALESCE(p_weight_grams, v_parent_current_weight / 2);

  -- Validate child weight doesn't exceed parent's current weight
  IF v_child_weight > v_parent_current_weight THEN
    RAISE EXCEPTION 'Child weight (% g) exceeds parent current weight (% g)',
      v_child_weight, v_parent_current_weight;
  END IF;

  -- Validate child weight is positive
  IF v_child_weight <= 0 THEN
    RAISE EXCEPTION 'Child batch weight must be greater than 0';
  END IF;

  -- Use provided values or inherit from parent
  INSERT INTO batches (
    id,
    collection_id,
    code,
    organisation_id,
    weight_grams,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_parent_code,  -- Child inherits exact parent code
    v_org,
    v_child_weight,
    p_notes
  )
  RETURNING id INTO v_child_id;

  INSERT INTO batch_splits (parent_batch_id, child_batch_id)
  VALUES (p_parent_batch_id, v_child_id);

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_child_id, v_org, 'Custody inherited on split');

  RETURN v_child_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_split_sub_batch(p_sub_batch_id uuid, p_outputs jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_derived_ids UUID[];
  v_operation_id UUID := gen_random_uuid();
  v_prior_adjustment_ids UUID[];
  v_classified_count INTEGER;
BEGIN
  SELECT COALESCE(array_agg(adjustment.id), '{}'::UUID[])
  INTO v_prior_adjustment_ids
  FROM public.batch_weight_adjustments adjustment
  WHERE adjustment.sub_batch_id = p_sub_batch_id;

  v_derived_ids := public.fn_split_sub_batch_without_lineage(
    p_sub_batch_id,
    p_outputs
  );

  INSERT INTO public.sub_batch_lineage (
    source_sub_batch_id,
    derived_sub_batch_id,
    operation_kind,
    operation_id,
    created_by
  )
  SELECT
    p_sub_batch_id,
    derived_id,
    'split',
    v_operation_id,
    auth.uid()
  FROM unnest(v_derived_ids) derived_id;

  UPDATE public.batch_weight_adjustments adjustment
  SET
    kind = 'split',
    lineage_operation_id = v_operation_id
  WHERE adjustment.sub_batch_id = p_sub_batch_id
    AND adjustment.id <> ALL (v_prior_adjustment_ids);

  GET DIAGNOSTICS v_classified_count = ROW_COUNT;
  IF v_classified_count != 1 THEN
    RAISE EXCEPTION 'Split must create exactly one weight adjustment';
  END IF;

  RETURN v_derived_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_split_sub_batch_without_lineage(p_sub_batch_id uuid, p_outputs jsonb)
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch_id UUID;
  v_held_by_org_id UUID;
  v_organisation_id UUID;
  v_current_weight NUMERIC;
  v_total_split_weight NUMERIC;
  v_output JSONB;
  v_out_weight NUMERIC;
  v_out_notes TEXT;
  v_container_id UUID;
  v_location_id UUID;
  v_new_id UUID;
  v_new_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Lock the source so simultaneous splits cannot allocate the same weight.
  SELECT sb.batch_id, sb.held_by_org_id
  INTO v_batch_id, v_held_by_org_id
  FROM public.sub_batches sb
  WHERE sb.id = p_sub_batch_id
  FOR UPDATE;

  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Sub-batch not found';
  END IF;

  SELECT sbcw.current_weight
  INTO v_current_weight
  FROM public.sub_batch_current_weight sbcw
  WHERE sbcw.id = p_sub_batch_id;

  -- Splitting takes weight out of this bag, so the gate is who holds the bag,
  -- not who owns the parent batch. It is also what lets a Testing organisation
  -- retain a subsample of an assigned bag, and what stops the owner carving up
  -- a bag it has already sent away.
  IF NOT public.is_current_bag_custodian(auth.uid(), p_sub_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not the current holder of this bag';
  END IF;

  v_organisation_id := public.get_user_organisation_id();

  IF p_outputs IS NULL
    OR jsonb_typeof(p_outputs) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Outputs must be an array';
  END IF;

  IF jsonb_array_length(p_outputs) = 0 THEN
    RAISE EXCEPTION 'At least one output is required';
  END IF;

  SELECT COALESCE(SUM((output.value->>'weight_grams')::NUMERIC), 0)
  INTO v_total_split_weight
  FROM jsonb_array_elements(p_outputs) output;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_outputs) output
    WHERE (output.value->>'weight_grams')::NUMERIC IS NULL
      OR (output.value->>'weight_grams')::NUMERIC <= 0
  ) THEN
    RAISE EXCEPTION 'Each output weight must be greater than 0';
  END IF;

  IF v_total_split_weight > v_current_weight THEN
    RAISE EXCEPTION
      'Total split weight (% g) must be less than current weight (% g)',
      v_total_split_weight,
      v_current_weight;
  END IF;

  -- Validate catalogue references before changing the source weight.
  FOR v_output IN
    SELECT value FROM jsonb_array_elements(p_outputs)
  LOOP
    v_container_id := NULLIF(v_output->>'container_id', '')::UUID;
    v_location_id := NULLIF(v_output->>'location_id', '')::UUID;

    IF v_container_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.containers container
      WHERE container.id = v_container_id
        AND container.organisation_id = v_organisation_id
        AND container.purpose = 'storage'
        AND container.active
    ) THEN
      RAISE EXCEPTION
        'Invalid or inactive storage container %',
        v_container_id;
    END IF;

    IF v_location_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.storage_locations location
      WHERE location.id = v_location_id
        AND location.organisation_id = v_organisation_id
    ) THEN
      RAISE EXCEPTION 'Invalid storage location %', v_location_id;
    END IF;
  END LOOP;

  INSERT INTO public.batch_weight_adjustments (
    sub_batch_id,
    weight_grams,
    reason,
    created_by
  ) VALUES (
    p_sub_batch_id,
    -v_total_split_weight,
    'Split into ' || jsonb_array_length(p_outputs) || ' new sub-batch(es)',
    auth.uid()
  );

  FOR v_output IN
    SELECT value FROM jsonb_array_elements(p_outputs)
  LOOP
    v_out_weight := (v_output->>'weight_grams')::NUMERIC;
    v_out_notes := v_output->>'notes';
    v_container_id := NULLIF(v_output->>'container_id', '')::UUID;
    v_location_id := NULLIF(v_output->>'location_id', '')::UUID;

    -- A child stays with whoever held the material it came from, which the
    -- gate above has already proved is the caller's organisation. Leaving it
    -- to the BEFORE INSERT default would silently hand a Testing
    -- organisation's split back to the batch owner.
    INSERT INTO public.sub_batches (
      batch_id,
      container_id,
      weight_grams,
      notes,
      held_by_org_id
    ) VALUES (
      v_batch_id,
      v_container_id,
      v_out_weight,
      v_out_notes,
      v_held_by_org_id
    )
    RETURNING id INTO v_new_id;

    IF v_location_id IS NOT NULL THEN
      INSERT INTO public.batch_storage (
        batch_id,
        sub_batch_id,
        location_id
      ) VALUES (
        v_batch_id,
        v_new_id,
        v_location_id
      );
    END IF;

    v_new_ids := array_append(v_new_ids, v_new_id);
  END LOOP;

  RETURN v_new_ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_batch_cleaning(p_cleaning_id uuid, p_duration interval DEFAULT NULL::interval, p_material_type text DEFAULT NULL::text, p_material_subtype text DEFAULT NULL::text, p_material_notes text DEFAULT NULL::text, p_cleaning_notes text DEFAULT NULL::text, p_worker_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_cleaned BOOLEAN;
  v_organisation_id UUID;
BEGIN
  SELECT bc.is_cleaned, bc.organisation_id
  INTO v_is_cleaned, v_organisation_id
  FROM batch_cleaning bc
  WHERE bc.id = p_cleaning_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cleaning record not found';
  END IF;

  IF v_organisation_id IS DISTINCT FROM get_user_organisation_id() THEN
    RAISE EXCEPTION 'Permission denied: cleaning record belongs to another organisation';
  END IF;

  IF v_is_cleaned AND p_duration IS NULL THEN
    RAISE EXCEPTION 'Cleaning duration is required';
  END IF;

  UPDATE batch_cleaning
  SET
    material_type = p_material_type,
    material_subtype = CASE
      WHEN p_material_type IS NULL THEN NULL
      ELSE p_material_subtype
    END,
    material_notes = p_material_notes,
    cleaning_notes = p_cleaning_notes,
    worker_ids = COALESCE(p_worker_ids, '{}'::UUID[]),
    duration = p_duration
  WHERE id = p_cleaning_id;

  RETURN p_cleaning_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_collection_code(p_collection_id uuid, p_species_id uuid, p_field_name text, p_organisation_id uuid, p_location public.geography, p_created_at timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    species_name TEXT;
    species_abbrev TEXT;
    org_name TEXT;
    org_abbrev TEXT;
    ibra_code TEXT;
    year_yy TEXT;
    base_code TEXT;
    sequence_num INTEGER;
    final_code TEXT;
BEGIN
    -- Get species name or use field_name or 'Unknown'
    IF p_species_id IS NOT NULL THEN
        SELECT name INTO species_name FROM species WHERE id = p_species_id;
    END IF;

    IF species_name IS NULL OR trim(species_name) = '' THEN
        species_name := COALESCE(nullif(trim(p_field_name), ''), 'Unknown');
    END IF;

    -- Generate species abbreviation
    species_abbrev := generate_species_abbreviation(species_name);

    -- Get organization name and generate abbreviation
    IF p_organisation_id IS NOT NULL THEN
        SELECT name INTO org_name FROM organisation WHERE id = p_organisation_id;
        org_abbrev := generate_org_abbreviation(org_name);
    ELSE
        org_abbrev := 'UNK';
    END IF;

    -- Get IBRA region code
    ibra_code := get_ibra_code_from_location(p_location);

    -- Format year as YY
    year_yy := to_char(COALESCE(p_created_at, now()), 'YY');

    -- Construct the base code (without sequence number)
    base_code := species_abbrev || '-' || org_abbrev || '.' || ibra_code || '.' || year_yy;

    -- Get the next sequence number for this combination within the organization
    sequence_num := get_next_code_sequence(base_code, p_organisation_id, p_collection_id);

    -- Construct the final code with sequence number
    final_code := base_code || '-' || sequence_num::TEXT;

    RETURN final_code;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_species_abbreviation(species_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    words TEXT[];
    word TEXT;
    abbreviation TEXT := '';
    is_phrase_name BOOLEAN := false;
    phrase_location TEXT;
BEGIN
    -- Handle null or empty names
    IF species_name IS NULL OR trim(species_name) = '' THEN
        RETURN 'UNK';
    END IF;

    -- Split the species name into words
    words := string_to_array(trim(species_name), ' ');

    -- Check if this is a phrase name by checking if the second word is exactly 'sp.' or 'sp'
    IF array_length(words, 1) >= 2 AND lower(words[2]) IN ('sp.', 'sp') THEN
        is_phrase_name := true;

        -- Phrase name pattern: "Genus sp. Location (Citation...)"
        -- Generate: Genus (3 letters) + SP + Location (3 letters)

        -- Get the genus (first word)
        abbreviation := upper(left(trim(words[1]), 3));

        -- Add 'SP' for phrase name indicator
        abbreviation := abbreviation || 'SP';

        -- Extract the location text between 'sp.' and the first '('
        -- Use regex to capture everything after 'sp.' or 'sp' and before '('
        phrase_location := regexp_replace(species_name, '^[^\s]+\s+sp\.?\s+([^(]+).*$', '\1', 'i');

        -- Remove all spaces from the location
        phrase_location := regexp_replace(phrase_location, '\s+', '', 'g');

        -- Remove any punctuation
        phrase_location := regexp_replace(phrase_location, '[^a-zA-Z]', '', 'g');

        -- Take first 3 letters of the location
        IF length(phrase_location) > 0 THEN
            abbreviation := abbreviation || upper(left(phrase_location, 3));
        END IF;

        RETURN abbreviation;
    END IF;

    -- Standard species name handling (not a phrase name)
    -- Take first 3 letters from each word, skipping common rank indicators
    FOREACH word IN ARRAY words
    LOOP
        -- Skip rank indicators like 'subsp.', 'var.', 'f.', etc.
        IF length(trim(word)) > 0 AND
           lower(word) NOT IN ('subsp.', 'var.', 'f.', 'subsp', 'var', 'ssp.', 'ssp') THEN
            -- Take first 3 letters (or less if word is shorter)
            abbreviation := abbreviation || upper(left(trim(word), 3));
        END IF;
    END LOOP;

    -- Ensure we have at least something
    IF abbreviation = '' THEN
        RETURN 'UNK';
    END IF;

    RETURN abbreviation;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_merged_batch_inherited_statistics(p_merged_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  source_batch_ids UUID[];
  source_count INTEGER;
  stats_count INTEGER;
  distinct_stats_count INTEGER;
  shared_statistics JSONB;
BEGIN
  SELECT ARRAY(
    SELECT jsonb_array_elements_text(event_details->'source_batch_ids')::UUID
  )
  INTO source_batch_ids
  FROM batch_lineage
  WHERE batch_id = p_merged_batch_id AND creation_event = 'merge';

  IF source_batch_ids IS NULL OR array_length(source_batch_ids, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  source_count := array_length(source_batch_ids, 1);

  WITH source_stats AS (
    SELECT DISTINCT ON (source_id) t.statistics
    FROM unnest(source_batch_ids) AS source_id
    LEFT JOIN tests t ON t.batch_id = source_id AND t.type = 'quality'
    WHERE t.statistics IS NOT NULL
    ORDER BY source_id, t.tested_at DESC
  )
  SELECT COUNT(*), COUNT(DISTINCT statistics), (ARRAY_AGG(statistics))[1]
  INTO stats_count, distinct_stats_count, shared_statistics
  FROM source_stats;

  IF stats_count = source_count AND distinct_stats_count = 1 THEN
    RETURN shared_statistics;
  ELSE
    RETURN NULL;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_code_sequence(base_code text, p_organisation_id uuid, p_collection_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    max_sequence INTEGER;
BEGIN
    -- Find the highest sequence number for this base code in this organization
    -- Exclude the current collection if we're updating
    SELECT COALESCE(MAX(
        CAST(
            substring(code from '-(\d+)$')
            AS INTEGER
        )
    ), 0) INTO max_sequence
    FROM collection
    WHERE organisation_id = p_organisation_id
        AND code ~ ('^' || regexp_replace(base_code, '[.*+?^${}()|[\]\\]', '\\\&', 'g') || '-\d+$')
        AND (p_collection_id IS NULL OR id != p_collection_id);

    -- Return the next sequence number
    RETURN COALESCE(max_sequence, 0) + 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.holds_any_bag_of_batch(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sub_batches sb
    INNER JOIN public.org_user ou
      ON ou.organisation_id = sb.held_by_org_id
    WHERE sb.batch_id = p_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_batch_custodian_or_past(auth_uid uuid, batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.batch_custody bc
      INNER JOIN public.org_user ou
        ON ou.organisation_id = bc.organisation_id
      WHERE bc.batch_id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$function$
;

CREATE OR REPLACE FUNCTION public.is_batch_owner(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.batches b
    INNER JOIN public.org_user ou
      ON ou.organisation_id = b.organisation_id
    WHERE b.id = p_batch_id
      AND ou.user_id = (SELECT auth.uid())
      AND ou.is_active = true
  )
$function$
;

CREATE OR REPLACE FUNCTION public.is_current_bag_custodian(p_user_id uuid, p_sub_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      INNER JOIN public.org_user ou
        ON ou.organisation_id = sb.held_by_org_id
      WHERE sb.id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$function$
;

CREATE OR REPLACE FUNCTION public.is_current_custodian(p_user_id uuid, p_batch_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT
    $1 = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.batches b
      INNER JOIN public.org_user ou
        ON ou.organisation_id = b.organisation_id
      WHERE b.id = $2
        AND ou.user_id = $1
        AND ou.is_active = true
    )
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_container_purpose_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Container purpose cannot be changed after creation'
    USING ERRCODE = '23514';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_seed_transfer_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Seed transfer facts are append-only'
    USING ERRCODE = '55000';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_sub_batch_lineage_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'Sub-batch lineage is append-only'
    USING ERRCODE = '55000';
END;
$function$
;

create or replace view "public"."sub_batch_current_weight" as  SELECT sb.id,
    sb.weight_grams AS original_weight,
    (sb.weight_grams + COALESCE(( SELECT sum(wa.weight_grams) AS sum
           FROM public.batch_weight_adjustments wa
          WHERE (wa.sub_batch_id = sb.id)), (0)::numeric)) AS current_weight
   FROM public.sub_batches sb;

CREATE OR REPLACE FUNCTION public.sub_batch_weight_info(sub_batch_row public.sub_batches)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  SELECT jsonb_build_object(
    'original_weight', sbcw.original_weight,
    'current_weight', sbcw.current_weight
  )
  FROM sub_batch_current_weight sbcw
  WHERE sbcw.id = sub_batch_row.id;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_active_storage_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_holder_organisation_id UUID;
  v_location_organisation_id UUID;
  v_location_active BOOLEAN;
BEGIN
  SELECT sb.held_by_org_id
  INTO v_holder_organisation_id
  FROM public.sub_batches sb
  WHERE sb.id = NEW.sub_batch_id;

  IF v_holder_organisation_id IS NULL THEN
    RAISE EXCEPTION 'Storage row does not reference an existing bag'
      USING ERRCODE = '23514';
  END IF;

  SELECT location.organisation_id, location.active
  INTO v_location_organisation_id, v_location_active
  FROM public.storage_locations location
  WHERE location.id = NEW.location_id;

  IF NOT FOUND OR NOT v_location_active THEN
    RAISE EXCEPTION 'Storage location is inactive or does not exist'
      USING ERRCODE = '23514';
  END IF;

  IF v_location_organisation_id IS DISTINCT FROM
    v_holder_organisation_id THEN
    RAISE EXCEPTION 'Storage location belongs to another organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_batch_cleaning_worker_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  invalid_count INTEGER;
BEGIN
  NEW.worker_ids = COALESCE(NEW.worker_ids, '{}'::UUID[]);

  IF cardinality(NEW.worker_ids) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM unnest(NEW.worker_ids) worker_id
  LEFT JOIN public.person p
    ON p.id = worker_id
    AND p.organisation_id = NEW.organisation_id
  WHERE p.id IS NULL;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'worker_ids must reference people in the same organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_seed_transfer_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.batches b
    WHERE b.id = NEW.batch_id
      AND b.organisation_id = NEW.owner_org_id
  ) THEN
    RAISE EXCEPTION 'Transfer owner snapshot must match the parent batch owner'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_sub_batch_lineage_edge()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_source_batch_id UUID;
  v_derived_batch_id UUID;
  v_source_owner_org_id UUID;
  v_derived_owner_org_id UUID;
BEGIN
  SELECT sb.batch_id, b.organisation_id
  INTO v_source_batch_id, v_source_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.source_sub_batch_id;

  SELECT sb.batch_id, b.organisation_id
  INTO v_derived_batch_id, v_derived_owner_org_id
  FROM public.sub_batches sb
  INNER JOIN public.batches b ON b.id = sb.batch_id
  WHERE sb.id = NEW.derived_sub_batch_id;

  IF v_source_batch_id IS NULL OR v_derived_batch_id IS NULL THEN
    RAISE EXCEPTION 'Lineage bags must exist'
      USING ERRCODE = '23514';
  END IF;

  IF v_source_owner_org_id IS DISTINCT FROM v_derived_owner_org_id THEN
    RAISE EXCEPTION 'Lineage cannot cross seed owners'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind IN ('split', 'merge')
    AND v_source_batch_id IS DISTINCT FROM v_derived_batch_id THEN
    RAISE EXCEPTION '% lineage must stay within one parent batch',
      NEW.operation_kind
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'split' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'split'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.source_sub_batch_id <> NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A split operation must have one source bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'merge' AND EXISTS (
    SELECT 1
    FROM public.sub_batch_lineage lineage
    WHERE lineage.operation_kind = 'merge'
      AND lineage.operation_id = NEW.operation_id
      AND lineage.derived_sub_batch_id <> NEW.derived_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'A merge operation must have one derived bag'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.operation_kind = 'cleaning' AND NOT EXISTS (
    SELECT 1
    FROM public.batch_cleaning cleaning
    INNER JOIN public.batch_cleaning_output output
      ON output.cleaning_id = cleaning.id
    INNER JOIN public.sub_batches derived
      ON derived.batch_id = output.output_batch_id
    INNER JOIN public.sub_batches source
      ON source.id = NEW.source_sub_batch_id
    WHERE cleaning.id = NEW.operation_id
      AND derived.id = NEW.derived_sub_batch_id
      AND (
        cleaning.input_sub_batch_id = NEW.source_sub_batch_id
        OR (
          cleaning.input_sub_batch_id IS NULL
          AND source.batch_id = output.output_batch_id
          AND derived.batch_id = source.batch_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Cleaning lineage must match its cleaning input and output'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    WITH RECURSIVE descendants (sub_batch_id) AS (
      SELECT NEW.derived_sub_batch_id
      UNION
      SELECT lineage.derived_sub_batch_id
      FROM public.sub_batch_lineage lineage
      INNER JOIN descendants
        ON descendants.sub_batch_id = lineage.source_sub_batch_id
    )
    SELECT 1
    FROM descendants
    WHERE sub_batch_id = NEW.source_sub_batch_id
  ) THEN
    RAISE EXCEPTION 'Lineage edge would create a cycle'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_sub_batch_storage_container()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.container_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- held_by_org_id is NOT NULL and is filled by sub_batches_default_held_by,
  -- which sorts before this trigger and so has already run.
  IF NOT EXISTS (
    SELECT 1
    FROM public.containers container
    WHERE container.id = NEW.container_id
      AND container.organisation_id = NEW.held_by_org_id
      AND container.purpose = 'storage'
      AND container.active
  ) THEN
    RAISE EXCEPTION
      'Storage container is inactive, invalid, or belongs to another organisation'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_treatment_array(treats jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  valid_treats TEXT[] := ARRAY['sort', 'coat', 'treat', 'other'];
  treat_value TEXT;
BEGIN
  IF jsonb_typeof(treats) != 'array' THEN
    RETURN FALSE;
  END IF;

  IF jsonb_array_length(treats) = 0 THEN
    RETURN FALSE;
  END IF;

  FOR treat_value IN SELECT jsonb_array_elements_text(treats)
  LOOP
    IF NOT (treat_value = ANY(valid_treats)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_populate_collection_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Generate code for new records
    IF TG_OP = 'INSERT' THEN
        NEW.code := generate_collection_code(
            NEW.id,
            NEW.species_id,
            NEW.field_name,
            NEW.organisation_id,
            NEW.location,
            NEW.created_at
        );
        RETURN NEW;
    END IF;

    -- Update code if relevant fields change
    IF TG_OP = 'UPDATE' THEN
        -- Check if any of the fields that affect the code have changed
        IF (OLD.species_id IS DISTINCT FROM NEW.species_id) OR
           (OLD.field_name IS DISTINCT FROM NEW.field_name) OR
           (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) OR
           (OLD.location IS DISTINCT FROM NEW.location) THEN
            NEW.code := generate_collection_code(
                NEW.id,
                NEW.species_id,
                NEW.field_name,
                NEW.organisation_id,
                NEW.location,
                NEW.created_at
            );
        END IF;
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_org_abbreviation(org_name text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    words TEXT[];
    word TEXT;
    abbreviation TEXT := '';
BEGIN
    -- Handle null or empty names
    IF org_name IS NULL OR trim(org_name) = '' THEN
        RETURN 'UNK';
    END IF;

    -- Split the organization name into words
    words := string_to_array(trim(org_name), ' ');

    -- If single word, take first 3 characters
    IF array_length(words, 1) = 1 THEN
        RETURN upper(left(words[1], 3));
    END IF;

    -- If multiple words, take first letter of each word
    FOREACH word IN ARRAY words
    LOOP
        -- Only include non-empty words and skip common articles/prepositions
        IF length(trim(word)) > 0 AND lower(word) NOT IN ('the', 'of', 'and', 'for', 'in', 'on', 'at', 'to', 'a', 'an') THEN
            abbreviation := abbreviation || upper(left(trim(word), 1));
        END IF;
    END LOOP;

    -- Ensure we have at least something
    IF abbreviation = '' THEN
        RETURN upper(left(org_name, 3));
    END IF;

    RETURN abbreviation;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ibra_code_from_location(location_geom public.geography)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    ibra_code TEXT;
BEGIN
    -- Handle null location
    IF location_geom IS NULL THEN
        RETURN 'UNK';
    END IF;

    -- Find intersecting IBRA region using geom_high for precision
    SELECT code INTO ibra_code
    FROM ibra_regions
    WHERE ST_Intersects(geom_high, location_geom::geometry)
    LIMIT 1;

    -- Return the code or 'UNK' if no intersection found
    RETURN COALESCE(ibra_code, 'UNK');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.load_ibra7_regions_paginated()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    base_url TEXT := 'https://gis.environment.gov.au/gispubmap/rest/services/ogc_services/IBRA7_Regions/FeatureServer/0/query';
    base_params TEXT := '?where=1%3D1&objectIds=&time=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&distance=&units=esriSRUnit_Foot&relationParam=&outFields=*&returnGeometry=true&maxAllowableOffset=&geometryPrecision=&outSR=&havingClause=&gdbVersion=&historicMoment=&returnDistinctValues=false&returnIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&orderByFields=&groupByFieldsForStatistics=&outStatistics=&returnZ=false&returnM=false&multipatchOption=xyFootprint&returnTrueCurves=false&returnExceededLimitFeatures=false&quantizationParameters=&returnCentroid=false&timeReferenceUnknownClient=false&sqlFormat=none&resultType=&featureEncoding=esriDefault&datumTransformation=&f=geojson';

    current_offset INT := 0;
    chunk_size INT := 5;
    response RECORD;
    geojson_data JSONB;
    features_array JSONB;
    feature_count INT;
    total_loaded INT := 0;
    query_url TEXT;
BEGIN
    -- Check if already loaded
    IF EXISTS (SELECT 1 FROM ibra_regions LIMIT 1) THEN
        RAISE NOTICE 'IBRA7 regions already loaded';
        RETURN;
    END IF;


    -- Create temporary table to store original data
    CREATE TEMP TABLE temp_ibra_original (
        geom GEOMETRY,
        properties JSONB,
        name TEXT,
        source_id BIGINT,
        reg_code TEXT
    );

    RAISE NOTICE 'Starting to load IBRA7 regions in chunks of %', chunk_size;

    LOOP
        -- Build paginated query URL
        query_url := base_url || base_params ||
            '&resultOffset=' || current_offset ||
            '&resultRecordCount=' || chunk_size;

        RAISE NOTICE 'Fetching chunk: offset=%, size=%', current_offset, chunk_size;
        RAISE NOTICE 'Query URL: %', query_url;

        SELECT status, content INTO response FROM http_get(query_url);

        IF response.status != 200 THEN
            RAISE WARNING 'Failed to fetch chunk at offset %: HTTP %', current_offset, response.status;
            EXIT;
        END IF;

        geojson_data := response.content::JSONB;

        -- Validate response
        IF geojson_data IS NULL OR geojson_data->>'type' != 'FeatureCollection' THEN
            RAISE WARNING 'Invalid GeoJSON response at offset %', current_offset;
            EXIT;
        END IF;

        features_array := geojson_data->'features';
        feature_count := jsonb_array_length(features_array);

        RAISE NOTICE 'Received % features in this chunk', feature_count;

        -- Exit if no more features
        IF feature_count = 0 THEN
            RAISE NOTICE 'No more features found at offset %', current_offset;
            EXIT;
        END IF;

        -- Insert this chunk's features
        INSERT INTO temp_ibra_original (geom, properties, name, source_id, reg_code)
        SELECT
            ST_GeomFromGeoJSON(feature->>'geometry'),  -- Original geometry
            feature->'properties',
            feature->'properties'->>'REG_NAME_7',
            (feature->'properties'->>'OBJECTID')::BIGINT,
            feature->'properties'->>'REG_CODE_7'
        FROM jsonb_array_elements(features_array) AS feature
        WHERE feature->>'geometry' IS NOT NULL;

        GET DIAGNOSTICS feature_count = ROW_COUNT;
        total_loaded := total_loaded + feature_count;
        current_offset := current_offset + chunk_size;

        RAISE NOTICE 'Inserted % features with geometry (% total so far)', feature_count, total_loaded;

        -- Small delay to be respectful to the service
        PERFORM pg_sleep(0.2);

        -- Safety check to prevent infinite loops
        IF current_offset > 1000 THEN
            RAISE WARNING 'Safety limit reached at % features', total_loaded;
            EXIT;
        END IF;
    END LOOP;

    RAISE NOTICE 'Completed loading % IBRA7 regions', total_loaded;

    -- Step 3: Now simplify all geometries together and insert into final table
    RAISE NOTICE 'Simplifying % regions while preserving topology...',
        (SELECT COUNT(*) FROM temp_ibra_original);

    INSERT INTO ibra_regions (geom_high, geom_medium, geom_low, properties, name, code)
    SELECT
        ST_SimplifyPreserveTopology(geom, 0.001) as geom_high,
        ST_SimplifyPreserveTopology(geom, 0.005) as geom_medium,
        ST_SimplifyPreserveTopology(geom, 0.02) as geom_low,
        properties,
        name,
        reg_code
    FROM temp_ibra_original;
END $function$
;

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
            c.species_id,
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
           FROM (((public.batches b
             JOIN public.batch_current_weight bcw ON ((bcw.id = b.id)))
             LEFT JOIN public.collection c ON ((c.id = b.collection_id)))
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
    computed.latest_quality_statistics
   FROM computed
  WHERE (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning bc
          WHERE (bc.input_batch_id = computed.id))));

create or replace view "public"."active_sub_batches" as  SELECT sb.id,
    sb.batch_id,
    sb.weight_grams,
    sb.notes,
    sb.created_at,
    sb.held_by_org_id,
    sbcw.original_weight,
    sbcw.current_weight,
    cbs.location_id AS current_location_id,
    sb.container_id
   FROM ((public.sub_batches sb
     JOIN public.sub_batch_current_weight sbcw ON ((sbcw.id = sb.id)))
     LEFT JOIN LATERAL ( SELECT current_batch_storage.location_id
           FROM public.current_batch_storage
          WHERE (current_batch_storage.sub_batch_id = sb.id)
          ORDER BY current_batch_storage.stored_at DESC
         LIMIT 1) cbs ON (true))
  WHERE (((sbcw.current_weight > (0)::numeric) OR (sbcw.current_weight IS NULL)) AND (sb.held_by_org_id = ( SELECT public.get_user_organisation_id() AS get_user_organisation_id)) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_merges bm
          WHERE (bm.source_batch_id = sb.batch_id)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.batch_cleaning bc
          WHERE (bc.input_sub_batch_id = sb.id)))));

alter table "public"."treatments" add constraint "treatments_treat_check" CHECK (public.validate_treatment_array("treat")) not valid;

alter table "public"."treatments" validate constraint "treatments_treat_check";
