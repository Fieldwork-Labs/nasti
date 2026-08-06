-- ============================================================================
-- BATCH CLEANING WORK DETAILS
-- ============================================================================
-- Record who performed a cleaning and how long it took. Material type describes
-- the incoming material when known, so it is no longer mandatory.

ALTER TABLE public.batch_cleaning
  ALTER COLUMN material_type DROP NOT NULL,
  ADD COLUMN worker_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  ADD COLUMN duration INTERVAL;

-- Existing completed cleanings predate duration capture. Backfill those with
-- zero so the conditional requirement can be added without inventing a value
-- for records where no cleaning was performed.
UPDATE public.batch_cleaning
SET duration = INTERVAL '0 seconds'
WHERE is_cleaned AND duration IS NULL;

ALTER TABLE public.batch_cleaning
  ADD CONSTRAINT batch_cleaning_cleaned_duration_required
  CHECK (NOT is_cleaned OR duration IS NOT NULL);

CREATE INDEX batch_cleaning_worker_ids_idx
  ON public.batch_cleaning USING GIN (worker_ids);

COMMENT ON COLUMN public.batch_cleaning.worker_ids IS
  'People who performed the cleaning, referencing the organisation person projection.';
COMMENT ON COLUMN public.batch_cleaning.duration IS
  'How long the cleaning took, recorded for planning and budgeting.';

-- Keep worker references organisation-scoped, matching collection.person_ids.
CREATE OR REPLACE FUNCTION public.validate_batch_cleaning_worker_ids()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

CREATE TRIGGER batch_cleaning_validate_worker_ids
BEFORE INSERT OR UPDATE OF worker_ids, organisation_id
ON public.batch_cleaning
FOR EACH ROW EXECUTE FUNCTION public.validate_batch_cleaning_worker_ids();

-- Replace the cleaning RPCs so duration and workers are written atomically
-- with the cleaning event.
DROP FUNCTION public.fn_clean_batch(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB
);

CREATE FUNCTION public.fn_clean_batch(
  p_input_batch_id UUID,
  p_duration INTERVAL DEFAULT NULL,
  p_material_type TEXT DEFAULT NULL,
  p_material_subtype TEXT DEFAULT NULL,
  p_material_notes TEXT DEFAULT NULL,
  p_is_cleaned BOOLEAN DEFAULT false,
  p_cleaning_notes TEXT DEFAULT NULL,
  p_worker_ids UUID[] DEFAULT '{}'::UUID[],
  p_outputs JSONB DEFAULT '[]'::JSONB
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_clean_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_clean_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) TO authenticated;

DROP FUNCTION public.fn_clean_sub_batch(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB
);

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
) RETURNS UUID AS $$
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

  IF NOT is_current_custodian(auth.uid(), v_batch_id) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of batch';
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_clean_sub_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_clean_sub_batch(
  UUID, INTERVAL, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID[], JSONB
) TO authenticated;

-- Editing is deliberately limited to descriptive cleaning metadata. Output
-- quality, material type, and weight are structural inventory data and cannot
-- be rewritten without also rebuilding the generated batches and lineage.
CREATE FUNCTION public.fn_update_batch_cleaning(
  p_cleaning_id UUID,
  p_duration INTERVAL DEFAULT NULL,
  p_material_type TEXT DEFAULT NULL,
  p_material_subtype TEXT DEFAULT NULL,
  p_material_notes TEXT DEFAULT NULL,
  p_cleaning_notes TEXT DEFAULT NULL,
  p_worker_ids UUID[] DEFAULT '{}'::UUID[]
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.fn_update_batch_cleaning(
  UUID, INTERVAL, TEXT, TEXT, TEXT, TEXT, UUID[]
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_update_batch_cleaning(
  UUID, INTERVAL, TEXT, TEXT, TEXT, TEXT, UUID[]
) TO authenticated;
