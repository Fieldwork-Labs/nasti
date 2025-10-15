-- Update batch creation functions to handle all required fields
SET search_path TO public;

-- Drop existing functions first
DROP FUNCTION IF EXISTS fn_create_batch_from_collection(uuid, text);
DROP FUNCTION IF EXISTS fn_split_batch(uuid, text);

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

  -- Get collection and aggregate properties from source batches
  SELECT 
      SUM(weight_grams),
      bool_and(is_extracted),
      bool_and(is_treated),
      bool_and(is_sorted),
      bool_and(is_coated)
  INTO 
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
