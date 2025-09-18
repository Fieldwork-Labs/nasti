-- Update batch creation functions to handle all required fields
SET search_path TO public;

-- Drop existing functions first
DROP FUNCTION IF EXISTS fn_create_batch_from_collection(uuid, text);
DROP FUNCTION IF EXISTS fn_split_batch(uuid, text);
DROP FUNCTION IF EXISTS fn_merge_batches(uuid[], text);

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
  v_parent_weight integer;
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
    collection_id, 
    weight_grams,
    is_extracted,
    is_treated,
    is_sorted,
    is_coated
  INTO 
    v_collection,
    v_parent_weight,
    v_parent_extracted,
    v_parent_treated,
    v_parent_sorted,
    v_parent_coated
  FROM batches 
  WHERE id = p_parent_batch_id;

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
    COALESCE(p_weight_grams, GREATEST(1, v_parent_weight / 2)), -- Default to half parent weight, minimum 1
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

-- Updated function: Merge batches with combined properties
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

  -- If your schema requires batches.collection_id NOT NULL, enforce same collection
  SELECT bool_and(collection_id = (SELECT collection_id FROM batches WHERE id = p_source_batch_ids[1]))
  INTO v_same
  FROM batches
  WHERE id = ANY (p_source_batch_ids);

  IF NOT v_same THEN
    RAISE EXCEPTION 'Source batches must share the same collection_id (or migrate to batch_origins for multi-collection merges)';
  END IF;

  -- Get collection and aggregate properties from source batches
  SELECT 
    collection_id,
    SUM(weight_grams),
    bool_and(is_extracted),
    bool_and(is_treated),
    bool_and(is_sorted),
    bool_and(is_coated)
  INTO 
    v_collection,
    v_total_weight,
    v_all_extracted,
    v_all_treated,
    v_all_sorted,
    v_all_coated
  FROM batches 
  WHERE id = ANY (p_source_batch_ids);

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