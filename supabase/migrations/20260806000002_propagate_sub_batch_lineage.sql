-- ============================================================================
-- ATOMIC LINEAGE PROPAGATION
-- ============================================================================
-- Every physical derivation records its ancestry in the same transaction that
-- creates the derived bag. Existing function bodies remain the authority for
-- validation; wrappers are used where the derivation result is sufficient.

-- --------------------------------------------------------------------------
-- Split: one source to every returned child.
-- --------------------------------------------------------------------------
ALTER FUNCTION public.fn_split_sub_batch(UUID, JSONB)
  RENAME TO fn_split_sub_batch_without_lineage;

REVOKE ALL ON FUNCTION
  public.fn_split_sub_batch_without_lineage(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_split_sub_batch(
  p_sub_batch_id UUID,
  p_outputs JSONB
) RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_derived_ids UUID[];
  v_operation_id UUID := gen_random_uuid();
BEGIN
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

  RETURN v_derived_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_split_sub_batch(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_split_sub_batch(UUID, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.fn_split_sub_batch(UUID, JSONB) IS
  'Splits weight into new physical bags and records immutable source ancestry.';

-- --------------------------------------------------------------------------
-- Merge: many same-batch, same-holder sources to one destination. Active
-- assignments remain on the source bags and are represented by lineage.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_merge_sub_batches(
  p_sub_batch_ids UUID[],
  p_container_id UUID,
  p_location_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_merge_sub_batches(
  UUID[], UUID, UUID, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_merge_sub_batches(
  UUID[], UUID, UUID, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.fn_merge_sub_batches(
  UUID[], UUID, UUID, TEXT
) IS
  'Merges co-held bags, preserves source history, and records unioned ancestry on the destination.';

-- --------------------------------------------------------------------------
-- Cleaning: the initial aggregate output remains traceable before physical
-- bagging. It becomes zero-weight history when physical bags are created.
-- --------------------------------------------------------------------------
ALTER FUNCTION public.fn_clean_sub_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) RENAME TO fn_clean_sub_batch_without_lineage;

REVOKE ALL ON FUNCTION public.fn_clean_sub_batch_without_lineage(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.fn_clean_sub_batch(
  p_sub_batch_id UUID,
  p_duration INTERVAL DEFAULT NULL,
  p_material_type TEXT DEFAULT NULL,
  p_material_subtype TEXT DEFAULT NULL,
  p_material_notes TEXT DEFAULT NULL,
  p_is_cleaned BOOLEAN DEFAULT false,
  p_cleaning_notes TEXT DEFAULT NULL,
  p_worker_ids UUID[] DEFAULT '{}'::UUID[],
  p_outputs JSONB DEFAULT '[]'::JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cleaning_id UUID;
BEGIN
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

  RETURN v_cleaning_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_clean_sub_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_clean_sub_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) TO authenticated;

-- Replace the destructive aggregate-row replacement. An aggregate bag with
-- lineage is retained at zero current weight, while every physical output bag
-- receives a direct edge from the cleaning input.
CREATE OR REPLACE FUNCTION public.fn_bag_and_store_cleaning_outputs(
  p_cleaning_id UUID,
  p_bags JSONB
) RETURNS UUID[] AS $$
DECLARE
  v_organisation_id UUID;
  v_input_sub_batch_id UUID;
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

  IF v_input_sub_batch_id IS NULL THEN
    RAISE EXCEPTION 'Cleaning output has no source bag lineage';
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
          v_input_sub_batch_id,
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_bag_and_store_cleaning_outputs(
  UUID, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_bag_and_store_cleaning_outputs(
  UUID, JSONB
) TO authenticated;

COMMENT ON FUNCTION public.fn_bag_and_store_cleaning_outputs(UUID, JSONB) IS
  'Creates physical cleaning-output bags, preserves the zero-weight aggregate for history, and records source ancestry.';
