-- Update batch creation functions to handle all required fields
SET search_path TO public;

-- Drop existing functions first
DROP FUNCTION IF EXISTS fn_split_batch(uuid, text);


-- Updated function: Split batch with inheritance of parent properties
CREATE OR REPLACE FUNCTION fn_split_batch(
  p_parent_batch_id uuid,
  p_weight_grams integer DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_parent_code text;
  v_child_id uuid;
  v_parent_current_weight integer;
  v_child_weight integer;
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

  -- Determine child weight (provided or default to half of current weight)
  v_child_weight := COALESCE(p_weight_grams, GREATEST(1, v_parent_current_weight / 2));

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
$$;


CREATE OR REPLACE FUNCTION fn_merge_batches(
  p_source_batch_ids uuid[],
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_batch_code text;
  v_new_id uuid;
  v_same bool;
  v_total_weight integer;
BEGIN
  IF array_length(p_source_batch_ids, 1) IS NULL OR array_length(p_source_batch_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Provide at least two source batches to merge';
  END IF;

  -- All sources must share the same current custodian
  v_org := assert_same_custodian(p_source_batch_ids);
  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of the custodian organisation';
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
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION fn_split_batch(uuid, integer, boolean, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_merge_batches(uuid[], boolean, boolean, boolean, boolean, text) TO authenticated;
