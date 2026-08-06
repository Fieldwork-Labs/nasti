-- ============================================================================
-- SPLIT SUB-BATCH CONTAINERS AND STORAGE
-- ============================================================================
-- Persist the optional storage container and location selected for every new
-- split output in the same transaction as the weight split.

CREATE OR REPLACE FUNCTION public.fn_split_sub_batch(
  p_sub_batch_id UUID,
  p_outputs JSONB
) RETURNS UUID[] AS $$
DECLARE
  v_batch_id UUID;
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
  SELECT sb.batch_id
  INTO v_batch_id
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

  IF NOT public.is_current_custodian(auth.uid(), v_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
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

    INSERT INTO public.sub_batches (
      batch_id,
      container_id,
      weight_grams,
      notes
    ) VALUES (
      v_batch_id,
      v_container_id,
      v_out_weight,
      v_out_notes
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_split_sub_batch(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_split_sub_batch(UUID, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.fn_split_sub_batch(UUID, JSONB) IS
  'Splits weight from one sub-batch into new sub-batches with optional storage containers and locations.';
