-- Update batch creation functions to handle all required fields
SET search_path TO public;

-- Drop existing functions first
DROP FUNCTION IF EXISTS fn_create_batch_from_collection(uuid, text);
DROP FUNCTION IF EXISTS fn_split_batch(uuid, text);


-- Updated function: Create batch from collection with all fields
CREATE OR REPLACE FUNCTION fn_create_batch_from_collection(
  p_collection_id uuid,
  p_weight_grams integer DEFAULT 1,
  p_is_extracted boolean DEFAULT FALSE,
  p_is_treated boolean DEFAULT FALSE,
  p_is_sorted boolean DEFAULT FALSE,
  p_is_coated boolean DEFAULT FALSE,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid; v_batch_id uuid;
BEGIN
  -- Validate weight_grams
  IF p_weight_grams IS NULL OR p_weight_grams <= 0 THEN
    RAISE EXCEPTION 'weight_grams must be a positive integer';
  END IF;

  -- The batch must be created by the organisation that owns the collection
  SELECT organisation_id INTO v_org
  FROM "collection" WHERE id = p_collection_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;

  IF NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not a member of collection organisation';
  END IF;

  INSERT INTO batches (
    id, 
    collection_id, 
    organisation_id, 
    weight_grams,
    is_extracted,
    is_treated,
    is_sorted,
    is_coated,
    notes
  )
  VALUES (
    gen_random_uuid(), 
    p_collection_id, 
    v_org, 
    p_weight_grams,
    p_is_extracted,
    p_is_treated,
    p_is_sorted,
    p_is_coated,
    p_notes
  )
  RETURNING id INTO v_batch_id;

  -- Establish initial custody
  INSERT INTO batch_custody (batch_id, organisation_id, notes)
  VALUES (v_batch_id, v_org, 'Initial custody from collection');

  RETURN v_batch_id;
END;
$$;

-- Updated function: Split batch with inheritance of parent properties
CREATE OR REPLACE FUNCTION fn_split_batch(
  p_parent_batch_id uuid,
  p_weight_grams integer DEFAULT NULL,
  p_is_extracted boolean DEFAULT NULL,
  p_is_treated boolean DEFAULT NULL,
  p_is_sorted boolean DEFAULT NULL,
  p_is_coated boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_collection uuid;
  v_child_id uuid;
  v_parent_current_weight integer;
  v_child_weight integer;
  v_parent_extracted boolean;
  v_parent_treated boolean;
  v_parent_sorted boolean;
  v_parent_coated boolean;
BEGIN
  -- Caller must be current custodian of the parent
  v_org := current_custodian_org_id(p_parent_batch_id);
  IF v_org IS NULL OR NOT is_org_member(auth.uid(), v_org) THEN
    RAISE EXCEPTION 'Permission denied: not current custodian of parent batch';
  END IF;

  -- Get parent batch properties for inheritance
  SELECT
    b.collection_id,
    b.is_extracted,
    b.is_treated,
    b.is_sorted,
    b.is_coated,
    bcw.current_weight
  INTO
    v_collection,
    v_parent_extracted,
    v_parent_treated,
    v_parent_sorted,
    v_parent_coated,
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
    organisation_id,
    weight_grams,
    is_extracted,
    is_treated,
    is_sorted,
    is_coated,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_org,
    v_child_weight,
    COALESCE(p_is_extracted, v_parent_extracted),
    COALESCE(p_is_treated, v_parent_treated),
    COALESCE(p_is_sorted, v_parent_sorted),
    COALESCE(p_is_coated, v_parent_coated),
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
  p_is_extracted boolean DEFAULT NULL,
  p_is_treated boolean DEFAULT NULL,
  p_is_sorted boolean DEFAULT NULL,
  p_is_coated boolean DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_org uuid; 
  v_collection uuid; 
  v_new_id uuid; 
  v_same bool;
  v_total_weight integer;
  v_all_extracted boolean;
  v_all_treated boolean;
  v_all_sorted boolean;
  v_all_coated boolean;
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

  -- Get collection_id for the new batch
  SELECT DISTINCT collection_id
  INTO v_collection
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  -- Validate all source batches are active and get their current weights
  SELECT
      SUM(bcw.current_weight),
      bool_and(b.is_extracted),
      bool_and(b.is_treated),
      bool_and(b.is_sorted),
      bool_and(b.is_coated),
      bool_and(bcw.current_weight > 0)
  INTO
      v_total_weight,
      v_all_extracted,
      v_all_treated,
      v_all_sorted,
      v_all_coated,
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
    organisation_id,
    weight_grams,
    is_extracted,
    is_treated,
    is_sorted,
    is_coated,
    notes
  )
  VALUES (
    gen_random_uuid(),
    v_collection,
    v_org,
    v_total_weight,
    COALESCE(p_is_extracted, v_all_extracted),
    COALESCE(p_is_treated, v_all_treated),
    COALESCE(p_is_sorted, v_all_sorted),
    COALESCE(p_is_coated, v_all_coated),
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
GRANT EXECUTE ON FUNCTION fn_create_batch_from_collection(uuid, integer, boolean, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_split_batch(uuid, integer, boolean, boolean, boolean, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_merge_batches(uuid[], boolean, boolean, boolean, boolean, text) TO authenticated;
