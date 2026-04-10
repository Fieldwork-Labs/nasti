-- Function to treat batches (renamed from fn_process_batch)
-- Treatment creates a new output batch and records the treatment event
-- If the input batch has NULL weight (initial/origin batch), p_origin_batch_weight sets the weight
CREATE OR REPLACE FUNCTION fn_treat_batch(
  p_input_batch_id UUID,
  p_output_weight INTEGER,
  p_treat JSONB,
  p_quality_assessment batch_quality,
  p_origin_batch_weight INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_batch_code TEXT;
  v_collection_code TEXT;
  v_increment INTEGER;
  v_organisation_id UUID;
  v_input_weight INTEGER;
  v_sub_batch RECORD;
BEGIN

  -- Get collection_id, organisation_id, and current weight from input batch
  SELECT collection_id, organisation_id, weight_grams
  INTO v_collection_id, v_organisation_id, v_input_weight
  FROM batches
  WHERE id = p_input_batch_id;

  IF v_collection_id IS NULL THEN
    RAISE EXCEPTION 'Input batch not found or has no collection';
  END IF;

  -- If input batch has NULL weight, this is an "origin batch"
  IF v_input_weight IS NULL THEN
    IF p_origin_batch_weight IS NULL THEN
      RAISE EXCEPTION 'origin_batch_weight must be provided when treating a batch with NULL weight';
    END IF;

    UPDATE batches
    SET weight_grams = p_origin_batch_weight
    WHERE id = p_input_batch_id;

    v_input_weight := p_origin_batch_weight;

  END IF;

  -- Get collection code
  SELECT code INTO v_collection_code
  FROM "collection"
  WHERE id = v_collection_id;

  IF v_collection_code IS NULL THEN
    RAISE EXCEPTION 'Collection not found or has no code';
  END IF;

  -- Generate batch code: collection_code-quality-increment
  SELECT COALESCE(MAX(
    CASE
      WHEN code ~ ('^' || v_collection_code || '-' || p_quality_assessment::text || '-[0-9]+$')
      THEN CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_increment
  FROM batches
  WHERE collection_id = v_collection_id;

  v_batch_code := v_collection_code || '-' || p_quality_assessment::text || '-' || v_increment::text;

  -- Create output batch (linked to same collection)
  INSERT INTO batches (
    collection_id,
    code,
    weight_grams,
    notes,
    organisation_id
  ) VALUES (
    v_collection_id,
    v_batch_code,
    p_output_weight,
    p_notes,
    v_organisation_id
  )
  RETURNING id INTO v_output_batch_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_output_batch_id, v_organisation_id, 'Batch created via treating');

  -- Record treating event
  INSERT INTO treatments (
    input_batch_id,
    output_batch_id,
    treat,
    quality_assessment,
    notes,
    created_by,
    organisation_id
  ) VALUES (
    p_input_batch_id,
    v_output_batch_id,
    p_treat,
    p_quality_assessment,
    p_notes,
    auth.uid(),
    v_organisation_id
  );

  -- Create initial sub-batch for the output batch
  INSERT INTO sub_batches (batch_id, weight_grams, notes)
  VALUES (v_output_batch_id, p_output_weight, 'Initial sub-batch from treating');

  -- Consume all sub-batches of the input batch
  FOR v_sub_batch IN
    SELECT sb.id, sb.weight_grams + COALESCE(
      (SELECT SUM(wa.weight_grams) FROM batch_weight_adjustments wa WHERE wa.sub_batch_id = sb.id),
      0
    ) AS effective_weight
    FROM sub_batches sb
    WHERE sb.batch_id = p_input_batch_id
  LOOP
    IF v_sub_batch.effective_weight > 0 THEN
      INSERT INTO batch_weight_adjustments (
        sub_batch_id,
        weight_grams,
        reason,
        created_by
      ) VALUES (
        v_sub_batch.id,
        -v_sub_batch.effective_weight,
        'Batch treated (' || p_treat::text || '). Output weight: ' || p_output_weight || 'g.',
        auth.uid()
      );
    END IF;
  END LOOP;

  -- If input batch has an active testing assignment, create a new assignment for output batch
  INSERT INTO batch_testing_assignment (
    batch_id,
    assigned_to_org_id,
    assigned_by_org_id,
    assignment_type,
    sample_weight_grams,
    assigned_at
  )
  SELECT
    v_output_batch_id,
    bta.assigned_to_org_id,
    bta.assigned_by_org_id,
    bta.assignment_type,
    bta.sample_weight_grams,
    bta.assigned_at
  FROM batch_testing_assignment bta
  WHERE bta.batch_id = p_input_batch_id
    AND bta.returned_at IS NULL;

  RETURN v_output_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_treat_batch(UUID, INTEGER, JSONB, batch_quality, INTEGER, TEXT) TO authenticated;
