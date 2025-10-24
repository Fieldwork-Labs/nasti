-- Function to process batches
-- Processing creates a new output batch and records the processing event
-- If the input batch has NULL weight (initial/origin batch), p_origin_batch_weight sets the weight
CREATE OR REPLACE FUNCTION fn_process_batch(
  p_input_batch_id UUID,
  p_output_weight INTEGER,
  p_process batch_process_type,
  p_quality_assessment batch_quality,
  p_origin_batch_weight INTEGER DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
) RETURNS UUID AS $$
DECLARE
  v_output_batch_id UUID;
  v_collection_id UUID;
  v_batch_code TEXT;
  v_collection_code TEXT;
  v_increment INTEGER;
  v_organisation_id UUID;
  v_input_weight INTEGER;
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
      RAISE EXCEPTION 'origin_batch_weight must be provided when processing a batch with NULL weight';
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
  -- Get next increment for this collection code and quality
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
    v_organisation_id
  )
  RETURNING id INTO v_output_batch_id;

  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_output_batch_id, v_organisation_id, 'Batch created via processing');


  -- Record processing event
  INSERT INTO batch_processing (
    input_batch_id,
    output_batch_id,
    process,
    quality_assessment,
    notes,
    created_by,
    organisation_id
  ) VALUES (
    p_input_batch_id,
    v_output_batch_id,
    p_process,
    p_quality_assessment,
    p_notes,
    auth.uid(),
    v_organisation_id
  );

  -- Create weight adjustment to mark input batch as fully consumed
  -- The discarded portion is (v_input_weight - p_output_weight)
  -- We adjust by negative input weight to set current weight to 0
  INSERT INTO batch_weight_adjustments (
    batch_id,
    weight_grams,
    reason,
    created_by
  ) VALUES (
    p_input_batch_id,
    -v_input_weight,
    'Batch processed (' || p_process::text || '). Output weight: ' || p_output_weight || 'g. Discarded: ' || (v_input_weight - p_output_weight) || 'g.',
    auth.uid()
  );

  RETURN v_output_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
