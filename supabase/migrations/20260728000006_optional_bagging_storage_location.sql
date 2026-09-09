-- ============================================================================
-- OPTIONAL STORAGE LOCATION DURING CLEANING BAGGING
-- ============================================================================
-- A container may be recorded before its storage destination is known. In that
-- case the physical sub-batch is created without an initial batch_storage row.

CREATE OR REPLACE FUNCTION public.fn_bag_and_store_cleaning_outputs(
  p_cleaning_id UUID,
  p_bags JSONB
) RETURNS UUID[] AS $$
DECLARE
  v_organisation_id UUID;
  v_output_count INTEGER;
  v_entry_count INTEGER;
  v_existing_sub_batch_count INTEGER;
  v_initial_sub_batch_id UUID;
  v_allocated_weight NUMERIC;
  v_output RECORD;
  v_output_entry JSONB;
  v_container_group JSONB;
  v_container_id UUID;
  v_location_id UUID;
  v_quantity INTEGER;
  v_weight_grams NUMERIC;
  v_sub_batch_id UUID;
  v_created_ids UUID[] := '{}'::UUID[];
BEGIN
  IF jsonb_typeof(p_bags) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Bagging entries must be an array';
  END IF;

  SELECT bc.organisation_id
  INTO v_organisation_id
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
    IF NOT public.is_current_custodian(
      auth.uid(),
      v_output.output_batch_id
    ) THEN
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
      WHERE sb.batch_id = v_output.output_batch_id
        AND sb.container_id IS NULL
        AND sb.weight_grams = v_output.weight_grams
    ) THEN
      RAISE EXCEPTION
        'Output batch % is no longer in its initial bagging state',
        v_output.output_batch_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sub_batches sb
      WHERE sb.batch_id = v_output.output_batch_id
        AND (
          EXISTS (
            SELECT 1 FROM public.batch_storage bs
            WHERE bs.sub_batch_id = sb.id
          )
          OR EXISTS (
            SELECT 1 FROM public.batch_weight_adjustments bwa
            WHERE bwa.sub_batch_id = sb.id
          )
          OR EXISTS (
            SELECT 1 FROM public.tests t
            WHERE t.sub_batch_id = sb.id
          )
        )
    ) THEN
      RAISE EXCEPTION
        'Output batch % has already been stored, adjusted, or tested',
        v_output.output_batch_id;
    END IF;

    -- Validate supplied catalogue references before replacing the initial
    -- sub-batch. A location is optional, but must be valid when present.
    FOR v_container_group IN
      SELECT value
      FROM jsonb_array_elements(v_output_entry->'containers')
    LOOP
      v_container_id := (v_container_group->>'container_id')::UUID;
      v_location_id :=
        NULLIF(v_container_group->>'location_id', '')::UUID;
      v_quantity := (v_container_group->>'quantity')::INTEGER;
      v_weight_grams := (v_container_group->>'weight_grams')::NUMERIC;

      IF v_quantity <= 0 OR v_weight_grams <= 0 THEN
        RAISE EXCEPTION 'Container quantity and weight must be greater than zero';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.containers c
        WHERE c.id = v_container_id
          AND c.organisation_id = v_organisation_id
          AND c.purpose = 'storage'
          AND c.active
      ) THEN
        RAISE EXCEPTION 'Invalid or inactive storage container %', v_container_id;
      END IF;

      IF v_location_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM public.storage_locations sl
        WHERE sl.id = v_location_id
          AND sl.organisation_id = v_organisation_id
      ) THEN
        RAISE EXCEPTION 'Invalid storage location %', v_location_id;
      END IF;
    END LOOP;

    DELETE FROM public.sub_batches
    WHERE batch_id = v_output.output_batch_id;

    FOR v_container_group IN
      SELECT value
      FROM jsonb_array_elements(v_output_entry->'containers')
    LOOP
      v_container_id := (v_container_group->>'container_id')::UUID;
      v_location_id :=
        NULLIF(v_container_group->>'location_id', '')::UUID;
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_bag_and_store_cleaning_outputs(
  UUID, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_bag_and_store_cleaning_outputs(
  UUID, JSONB
) TO authenticated;

COMMENT ON FUNCTION public.fn_bag_and_store_cleaning_outputs(UUID, JSONB) IS
  'Expands cleaning outputs into physical container sub-batches and optionally records their initial storage locations.';
